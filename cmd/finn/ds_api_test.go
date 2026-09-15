package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type datasourceTestEnvironment struct {
	router  *gin.Engine
	db      *sql.DB
	service *dsService
}

func newDatasourceTestEnvironment(t *testing.T, script string) *datasourceTestEnvironment {
	t.Helper()

	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT UNIQUE NOT NULL, data TEXT NOT NULL, duration_seconds INTEGER DEFAULT 0);
		CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
	`); err != nil {
		t.Fatal(err)
	}
	if _, err := runMigrations(db); err != nil {
		t.Fatal(err)
	}

	plugin := testPlugin(t, script)
	cfg := &Config{Datasources: DatasourcesConfig{Enabled: true, Plugins: []DatasourcePlugin{plugin}}}

	gin.SetMode(gin.TestMode)
	router := gin.New()
	api := router.Group("/api")
	setupFlowAPI(api, db)
	service := setupDatasourceAPI(api, cfg, db, false)

	return &datasourceTestEnvironment{router: router, db: db, service: service}
}

// call drives the API the way a local browser does: the datasource group refuses
// anything that does not come from this machine.
func (env *datasourceTestEnvironment) call(method, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.RemoteAddr = "127.0.0.1:54321"
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	env.router.ServeHTTP(response, request)
	return response
}

func (env *datasourceTestEnvironment) confirmPlugin(t *testing.T) {
	t.Helper()
	if _, err := env.service.confirm("fake"); err != nil {
		t.Fatalf("confirm the plugin: %v", err)
	}
}

func (env *datasourceTestEnvironment) fetch(t *testing.T) dsFetchSummary {
	t.Helper()
	response := env.call(http.MethodPost, "/api/ds/sources/fake/fetch", "")
	if response.Code != http.StatusOK {
		t.Fatalf("fetch status = %d, body: %s", response.Code, response.Body.String())
	}
	var summary dsFetchSummary
	if err := json.Unmarshal(response.Body.Bytes(), &summary); err != nil {
		t.Fatalf("decode the fetch summary: %v", err)
	}
	return summary
}

func (env *datasourceTestEnvironment) inbox(t *testing.T, query string) []dsInboxItem {
	t.Helper()
	response := env.call(http.MethodGet, "/api/ds/inbox"+query, "")
	if response.Code != http.StatusOK {
		t.Fatalf("inbox status = %d, body: %s", response.Code, response.Body.String())
	}
	var items []dsInboxItem
	if err := json.Unmarshal(response.Body.Bytes(), &items); err != nil {
		t.Fatalf("decode the Inbox: %v", err)
	}
	return items
}

func (env *datasourceTestEnvironment) itemByExternalID(t *testing.T, externalID string) dsInboxItem {
	t.Helper()
	for _, item := range env.inbox(t, "?status=all") {
		if item.ExternalID == externalID {
			return item
		}
	}
	t.Fatalf("no Inbox item with external_id %q", externalID)
	return dsInboxItem{}
}

func TestDatasourceFetchRequiresConfirmationFirst(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")

	response := env.call(http.MethodPost, "/api/ds/sources/fake/fetch", "")
	if response.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d; body: %s", response.Code, http.StatusConflict, response.Body.String())
	}
	var payload struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(response.Body.Bytes(), &payload)
	if payload.Code != "confirmation_required" {
		t.Fatalf("code = %q, want confirmation_required so the UI can open its dialog", payload.Code)
	}

	if count := countRows(t, env.db, "SELECT COUNT(*) FROM ds_inbox"); count != 0 {
		t.Fatalf("an unconfirmed plugin must not write anything, found %d row(s)", count)
	}
}

func TestDatasourceFetchIsIdempotent(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)

	first := env.fetch(t)
	if first.ItemsNew != 2 || first.ItemsSkipped != 0 {
		t.Fatalf("first fetch = %+v, want two new items", first)
	}

	second := env.fetch(t)
	if second.ItemsNew != 0 || second.ItemsSkipped != 2 {
		t.Fatalf("second fetch = %+v, want both items skipped as duplicates", second)
	}
	if count := countRows(t, env.db, "SELECT COUNT(*) FROM ds_inbox"); count != 2 {
		t.Fatalf("Inbox holds %d row(s), want 2", count)
	}
}

func TestDatasourceFetchStoresCursorOnlyWithItsItems(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	var cursor, status string
	if err := env.db.QueryRow("SELECT cursor, last_status FROM ds_sources WHERE name = 'fake'").Scan(&cursor, &status); err != nil {
		t.Fatal(err)
	}
	if cursor != "42" || status != "ok" {
		t.Fatalf("cursor = %q, status = %q, want the plugin cursor and ok", cursor, status)
	}
	if count := countRows(t, env.db, "SELECT COUNT(*) FROM ds_inbox"); count != 2 {
		t.Fatalf("the cursor moved without its items: %d row(s) stored", count)
	}
}

func TestDatasourceFailedFetchLeavesTheCursorAlone(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	// Point the same source at a plugin that fails, which is what a revoked
	// token looks like from here.
	env.service.cfg.Datasources.Plugins[0].Env[testPluginScriptEnv] = "reports-error"
	env.service.mu.Lock()
	env.service.manifests = map[string]dsManifestCacheEntry{}
	env.service.mu.Unlock()

	summary := env.fetch(t)
	if summary.Status != "error" || summary.Error == "" {
		t.Fatalf("summary = %+v, want a failed run", summary)
	}

	var cursor, status, lastError string
	if err := env.db.QueryRow("SELECT cursor, last_status, last_error FROM ds_sources WHERE name = 'fake'").Scan(&cursor, &status, &lastError); err != nil {
		t.Fatal(err)
	}
	if cursor != "42" {
		t.Fatalf("cursor = %q, a failed run must not move it", cursor)
	}
	if status != "error" || lastError == "" {
		t.Fatalf("status = %q, error = %q, want the failure recorded", status, lastError)
	}
}

func TestDatasourceFetchKeepsInvalidDraftsForRepair(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "invalid-draft")
	env.confirmPlugin(t)

	summary := env.fetch(t)
	if summary.ItemsNew != 1 {
		t.Fatalf("summary = %+v, want the invalid item stored rather than dropped", summary)
	}

	item := env.itemByExternalID(t, "broken")
	if item.Status != dsStatusInvalid || !strings.Contains(item.Note, "month") {
		t.Fatalf("item = %+v, want invalid with the reason attached", item)
	}
}

func TestDatasourceFetchDropsDuplicateIDsWithinOneResponse(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "duplicate-ids")
	env.confirmPlugin(t)

	summary := env.fetch(t)
	if summary.ItemsNew != 1 || summary.ItemsSkipped != 1 {
		t.Fatalf("summary = %+v, want the second copy dropped", summary)
	}
	if len(summary.Warnings) == 0 {
		t.Fatal("dropping an item must be reported as a warning")
	}
}

func TestDatasourceAcceptCreatesAMovement(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	item := env.itemByExternalID(t, "a")
	response := env.call(http.MethodPost, "/api/ds/inbox/accept", fmt.Sprintf(`{"ids":[%d]}`, item.ID))
	if response.Code != http.StatusOK {
		t.Fatalf("accept status = %d, body: %s", response.Code, response.Body.String())
	}

	var result dsAcceptResult
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Accepted != 1 || result.Results[0].FlowEntryID == 0 {
		t.Fatalf("result = %+v, want one accepted item with a movement id", result)
	}

	var counterparty string
	var amount float64
	if err := env.db.QueryRow("SELECT counterparty, amount FROM flow_entries WHERE id = ?", result.Results[0].FlowEntryID).Scan(&counterparty, &amount); err != nil {
		t.Fatal(err)
	}
	if counterparty != "Shop" || amount != 3500 {
		t.Fatalf("movement = %s %v, want the accepted draft", counterparty, amount)
	}
}

func TestDatasourceAcceptRejectsRepeatedRequestIDs(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	item := env.itemByExternalID(t, "a")
	response := env.call(http.MethodPost, "/api/ds/inbox/accept", fmt.Sprintf(`{"ids":[%d,%d],"allowDuplicates":true}`, item.ID, item.ID))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", response.Code, http.StatusBadRequest, response.Body.String())
	}
	if count := countRows(t, env.db, "SELECT COUNT(*) FROM flow_entries"); count != 0 {
		t.Fatalf("repeating one Inbox id created %d movements, want none", count)
	}
}

func TestDatasourceAcceptBatchLetsOneFailureThrough(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	valid := env.itemByExternalID(t, "a")
	raw := env.itemByExternalID(t, "b")

	response := env.call(http.MethodPost, "/api/ds/inbox/accept", fmt.Sprintf(`{"ids":[%d,%d]}`, raw.ID, valid.ID))
	if response.Code != http.StatusOK {
		t.Fatalf("accept status = %d, body: %s", response.Code, response.Body.String())
	}

	var result dsAcceptResult
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Accepted != 1 || result.Failed != 1 {
		t.Fatalf("result = %+v, want the valid item accepted and the empty one reported", result)
	}
	if count := countRows(t, env.db, "SELECT COUNT(*) FROM flow_entries"); count != 1 {
		t.Fatalf("flow_entries = %d, one failure must not roll the batch back", count)
	}
}

func TestDatasourceAcceptSkipsDuplicatesOfExistingMovements(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	created := env.call(http.MethodPost, "/api/flows", `{
		"month":"2026-08","direction":"out","counterparty":"Shop","currency":"RUB","amount":3500,"category":"groceries"
	}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("seed status = %d, body: %s", created.Code, created.Body.String())
	}

	item := env.itemByExternalID(t, "a")
	if !env.itemByExternalID(t, "a").Duplicate {
		t.Fatal("the Inbox must flag a proposal that already exists as a movement")
	}

	response := env.call(http.MethodPost, "/api/ds/inbox/accept", fmt.Sprintf(`{"ids":[%d]}`, item.ID))
	var result dsAcceptResult
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Skipped != 1 || result.Results[0].Status != "duplicate" {
		t.Fatalf("result = %+v, want the duplicate skipped", result)
	}

	forced := env.call(http.MethodPost, "/api/ds/inbox/accept", fmt.Sprintf(`{"ids":[%d],"allowDuplicates":true}`, item.ID))
	if err := json.Unmarshal(forced.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Accepted != 1 {
		t.Fatalf("result = %+v, want allowDuplicates to let it through", result)
	}
}

func TestDatasourceInboxEditTurnsRawIntoAMovement(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	raw := env.itemByExternalID(t, "b")
	response := env.call(http.MethodPut, fmt.Sprintf("/api/ds/inbox/%d", raw.ID), `{
		"month":"2026-08","direction":"out","counterparty":"Bakery","currency":"RUB","amount":120
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("edit status = %d, body: %s", response.Code, response.Body.String())
	}

	var item dsInboxItem
	if err := json.Unmarshal(response.Body.Bytes(), &item); err != nil {
		t.Fatal(err)
	}
	if item.Kind != dsKindFlow || item.Status != dsStatusPending || item.Month != "2026-08" {
		t.Fatalf("item = %+v, want a pending movement", item)
	}
	if item.Raw == "" {
		t.Fatal("the original text must survive editing as provenance")
	}
}

func TestDatasourceInboxEditMarksABrokenDraftInvalid(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	item := env.itemByExternalID(t, "a")
	response := env.call(http.MethodPut, fmt.Sprintf("/api/ds/inbox/%d", item.ID), `{
		"month":"2026-08","direction":"out","counterparty":"Shop","currency":"RUB","amount":0
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("edit status = %d, body: %s", response.Code, response.Body.String())
	}

	var edited dsInboxItem
	if err := json.Unmarshal(response.Body.Bytes(), &edited); err != nil {
		t.Fatal(err)
	}
	if edited.Status != dsStatusInvalid || edited.Note == "" {
		t.Fatalf("item = %+v, want invalid with an explanation", edited)
	}
}

func TestDatasourceRejectKeepsTheRowSoItDoesNotReturn(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	item := env.itemByExternalID(t, "b")
	if response := env.call(http.MethodPost, "/api/ds/inbox/reject", fmt.Sprintf(`{"ids":[%d]}`, item.ID)); response.Code != http.StatusOK {
		t.Fatalf("reject status = %d, body: %s", response.Code, response.Body.String())
	}

	// A rejected row has to survive, because the unique index on it is the only
	// thing stopping the next fetch from proposing the same item again.
	env.service.cfg.Datasources.Plugins[0].Env[testPluginScriptEnv] = "two-items"
	summary := env.fetch(t)
	if summary.ItemsNew != 0 {
		t.Fatalf("summary = %+v, a rejected item must not come back", summary)
	}
	if env.itemByExternalID(t, "b").Status != dsStatusRejected {
		t.Fatal("the rejected item lost its status")
	}
}

func TestDatasourceDetachedIsComputedAfterDirectDeletion(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	item := env.itemByExternalID(t, "a")
	accept := env.call(http.MethodPost, "/api/ds/inbox/accept", fmt.Sprintf(`{"ids":[%d]}`, item.ID))
	var result dsAcceptResult
	if err := json.Unmarshal(accept.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	flowEntryID := result.Results[0].FlowEntryID

	if response := env.call(http.MethodDelete, fmt.Sprintf("/api/flows/%d", flowEntryID), ""); response.Code != http.StatusOK {
		t.Fatalf("delete status = %d, body: %s", response.Code, response.Body.String())
	}

	detached := env.inbox(t, "?status=detached")
	if len(detached) != 1 || detached[0].ID != item.ID {
		t.Fatalf("detached = %+v, want the accepted item once its movement is gone", detached)
	}
	// Nothing was written to say so: the state is derived, which is why deleting
	// through either route is covered without a trigger.
	var storedStatus string
	if err := env.db.QueryRow("SELECT status FROM ds_inbox WHERE id = ?", item.ID).Scan(&storedStatus); err != nil {
		t.Fatal(err)
	}
	if storedStatus != dsStatusAccepted {
		t.Fatalf("stored status = %q, detached must not be persisted", storedStatus)
	}

	for _, listed := range env.inbox(t, "") {
		if listed.ID == item.ID {
			t.Fatal("a detached item must show up only under its own filter")
		}
	}

	if response := env.call(http.MethodPost, "/api/ds/inbox/reopen", fmt.Sprintf(`{"ids":[%d]}`, item.ID)); response.Code != http.StatusOK {
		t.Fatalf("reopen status = %d, body: %s", response.Code, response.Body.String())
	}
	if env.itemByExternalID(t, "a").Status != dsStatusPending {
		t.Fatal("reopen must put the item back in the queue")
	}
}

func TestDatasourceDetachedIsComputedAfterMonthCleanup(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	item := env.itemByExternalID(t, "a")
	accept := env.call(http.MethodPost, "/api/ds/inbox/accept", fmt.Sprintf(`{"ids":[%d]}`, item.ID))
	var result dsAcceptResult
	if err := json.Unmarshal(accept.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}

	// Saving a month deletes everything the frontend did not send back, which is
	// the second way a movement can disappear.
	if response := env.call(http.MethodPut, "/api/flows/months/2026-08", `{"entries":[]}`); response.Code != http.StatusOK {
		t.Fatalf("month save status = %d, body: %s", response.Code, response.Body.String())
	}

	detached := env.inbox(t, "?status=detached")
	if len(detached) != 1 {
		t.Fatalf("detached = %+v, want the item after the month was cleaned up", detached)
	}
}

func TestDatasourceAcceptedDraftIsNeverRewritten(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	item := env.itemByExternalID(t, "a")
	accept := env.call(http.MethodPost, "/api/ds/inbox/accept", fmt.Sprintf(`{"ids":[%d]}`, item.ID))
	var result dsAcceptResult
	if err := json.Unmarshal(accept.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}

	if response := env.call(http.MethodPut, fmt.Sprintf("/api/flows/%d", result.Results[0].FlowEntryID), `{
		"month":"2026-08","direction":"out","counterparty":"Shop","currency":"RUB","amount":9999
	}`); response.Code != http.StatusOK {
		t.Fatalf("movement update status = %d, body: %s", response.Code, response.Body.String())
	}

	var draft FlowEntryRequest
	if err := json.Unmarshal(env.itemByExternalID(t, "a").Draft, &draft); err != nil {
		t.Fatal(err)
	}
	if draft.Amount != 3500 {
		t.Fatalf("draft amount = %v, the Inbox records what the source proposed, not the movement", draft.Amount)
	}
}

func TestDatasourceClearRemovesRowsForGood(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.confirmPlugin(t)
	env.fetch(t)

	if response := env.call(http.MethodDelete, "/api/ds/inbox?status=pending", ""); response.Code != http.StatusOK {
		t.Fatalf("clear status = %d, body: %s", response.Code, response.Body.String())
	}
	if count := countRows(t, env.db, "SELECT COUNT(*) FROM ds_inbox"); count != 0 {
		t.Fatalf("Inbox holds %d row(s) after being cleared", count)
	}

	// Clearing gives up deduplication for what it removed, so the same items are
	// proposed again on the next run. The UI warns about exactly this.
	summary := env.fetch(t)
	if summary.ItemsNew != 2 {
		t.Fatalf("summary = %+v, want the cleared items proposed again", summary)
	}
}

func TestDatasourceSourcesReportState(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")

	response := env.call(http.MethodGet, "/api/ds/sources", "")
	if response.Code != http.StatusOK {
		t.Fatalf("sources status = %d, body: %s", response.Code, response.Body.String())
	}
	var view dsSourcesView
	if err := json.Unmarshal(response.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	if !view.Enabled || len(view.Sources) != 1 {
		t.Fatalf("view = %+v, want one enabled source", view)
	}

	source := view.Sources[0]
	if source.Confirmed {
		t.Fatal("a plugin starts out unconfirmed")
	}
	if source.Pinned {
		t.Fatal("a plugin without sha256 in config must be reported as unpinned")
	}
	if source.SHA256 == "" {
		t.Fatal("the actual hash has to be shown so it can be pinned")
	}
	if source.Manifest == nil || source.Manifest.Name != "fake" {
		t.Fatalf("manifest = %+v, want the plugin's own description", source.Manifest)
	}
}

func TestDatasourceSourcesDoNotExecuteManifestsWhileDisabled(t *testing.T) {
	tests := []struct {
		name      string
		configure func(*datasourceTestEnvironment)
	}{
		{
			name: "globally disabled",
			configure: func(env *datasourceTestEnvironment) {
				env.service.cfg.Datasources.Enabled = false
			},
		},
		{
			name: "demo mode",
			configure: func(env *datasourceTestEnvironment) {
				env.service.isDemo = true
			},
		},
		{
			name: "plugin disabled",
			configure: func(env *datasourceTestEnvironment) {
				env.service.cfg.Datasources.Plugins[0].Disabled = true
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			env := newDatasourceTestEnvironment(t, "manifest-only")
			test.configure(env)
			response := env.call(http.MethodGet, "/api/ds/sources", "")
			if response.Code != http.StatusOK {
				t.Fatalf("status = %d, body: %s", response.Code, response.Body.String())
			}
			env.service.mu.Lock()
			cached := len(env.service.manifests)
			env.service.mu.Unlock()
			if cached != 0 {
				t.Fatalf("source listing executed and cached %d manifest(s)", cached)
			}
		})
	}
}

func TestDatasourceSummaryNeverExecutesManifest(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "manifest-only")
	response := env.call(http.MethodGet, "/api/ds/summary", "")
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body: %s", response.Code, response.Body.String())
	}
	var summary dsSummaryView
	if err := json.Unmarshal(response.Body.Bytes(), &summary); err != nil {
		t.Fatal(err)
	}
	if !summary.Available || summary.Pending != 0 {
		t.Fatalf("summary = %+v", summary)
	}
	env.service.mu.Lock()
	cached := len(env.service.manifests)
	env.service.mu.Unlock()
	if cached != 0 {
		t.Fatalf("badge summary executed and cached %d manifest(s)", cached)
	}
}

func TestDatasourceSourcesRejectIncompleteManifest(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "empty-manifest")
	response := env.call(http.MethodGet, "/api/ds/sources", "")
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body: %s", response.Code, response.Body.String())
	}
	var view dsSourcesView
	if err := json.Unmarshal(response.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	if len(view.Sources) != 1 || view.Sources[0].ManifestError == "" || view.Sources[0].Manifest != nil {
		t.Fatalf("source = %+v, want an invalid manifest error", view.Sources)
	}
	if view.Sources[0].Runnable {
		t.Fatal("a source with an invalid manifest must not be runnable")
	}
	if _, err := env.service.confirm("fake"); err != nil {
		t.Fatalf("confirmation records the binary identity independently of conformance: %v", err)
	}
	fetch := env.call(http.MethodPost, "/api/ds/sources/fake/fetch", "")
	if fetch.Code != http.StatusBadRequest || !strings.Contains(fetch.Body.String(), "manifest") {
		t.Fatalf("fetch status = %d, body: %s; want invalid manifest refusal", fetch.Code, fetch.Body.String())
	}
}

func TestDatasourceDemoModeRefusesToRunAnything(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")
	env.service.isDemo = true

	response := env.call(http.MethodPost, "/api/ds/sources/fake/fetch", "")
	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d in demo mode; body: %s", response.Code, http.StatusForbidden, response.Body.String())
	}
}

func TestDatasourceAPIRefusesNonLocalRequests(t *testing.T) {
	env := newDatasourceTestEnvironment(t, "two-items")

	request := httptest.NewRequest(http.MethodGet, "/api/ds/inbox", nil)
	request.RemoteAddr = "203.0.113.7:5555"
	response := httptest.NewRecorder()
	env.router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d for a request from another machine", response.Code, http.StatusForbidden)
	}
}

func countRows(t *testing.T, db *sql.DB, query string) int {
	t.Helper()
	var count int
	if err := db.QueryRow(query).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}
