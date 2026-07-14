package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newFlowAPITestRouter(t *testing.T) (*gin.Engine, *sql.DB) {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`
		CREATE TABLE flow_entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			month TEXT NOT NULL,
			direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
			counterparty TEXT NOT NULL,
			currency TEXT NOT NULL,
			amount REAL NOT NULL CHECK (amount > 0),
			tax_rate REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
			category TEXT NOT NULL DEFAULT '',
			comment TEXT NOT NULL DEFAULT ''
		)
	`); err != nil {
		db.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	gin.SetMode(gin.TestMode)
	router := gin.New()
	setupFlowAPI(router.Group("/api"), db)
	return router, db
}

func performFlowRequest(router http.Handler, method, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

func TestFlowAPICRUD(t *testing.T) {
	router, _ := newFlowAPITestRouter(t)

	created := performFlowRequest(router, http.MethodPost, "/api/flows", `{
		"month":"2026-07", "direction":"in", "counterparty":" Acme ",
		"currency":"usd", "amount":1200.5, "taxRate":6, "category":"Salary", "comment":"July salary"
	}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want %d; body: %s", created.Code, http.StatusCreated, created.Body.String())
	}
	var entry FlowEntry
	if err := json.Unmarshal(created.Body.Bytes(), &entry); err != nil {
		t.Fatal(err)
	}
	if entry.ID == 0 || entry.Counterparty != "Acme" || entry.Currency != "USD" || entry.TaxRate != 6 {
		t.Fatalf("created entry = %+v, want normalized fields and id", entry)
	}

	listed := performFlowRequest(router, http.MethodGet, "/api/flows", "")
	if listed.Code != http.StatusOK {
		t.Fatalf("list status = %d, want %d", listed.Code, http.StatusOK)
	}
	var entries []FlowEntry
	if err := json.Unmarshal(listed.Body.Bytes(), &entries); err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].ID != entry.ID {
		t.Fatalf("listed entries = %+v, want created entry", entries)
	}

	updated := performFlowRequest(router, http.MethodPut, "/api/flows/"+strconv.FormatInt(entry.ID, 10), `{
		"month":"2026-07", "direction":"out", "counterparty":"Landlord",
		"currency":"USD", "amount":800, "category":"Living expense", "comment":"Rent"
	}`)
	if updated.Code != http.StatusOK {
		t.Fatalf("update status = %d, want %d; body: %s", updated.Code, http.StatusOK, updated.Body.String())
	}
	if err := json.Unmarshal(updated.Body.Bytes(), &entry); err != nil {
		t.Fatal(err)
	}
	if entry.Direction != "out" || entry.Counterparty != "Landlord" {
		t.Fatalf("updated entry = %+v, want outgoing Landlord flow", entry)
	}

	deleted := performFlowRequest(router, http.MethodDelete, "/api/flows/"+strconv.FormatInt(entry.ID, 10), "")
	if deleted.Code != http.StatusOK {
		t.Fatalf("delete status = %d, want %d", deleted.Code, http.StatusOK)
	}
}

func TestFlowAPIRejectsInvalidEntry(t *testing.T) {
	router, _ := newFlowAPITestRouter(t)
	response := performFlowRequest(router, http.MethodPost, "/api/flows", `{
		"month":"2026-13", "direction":"sideways", "counterparty":"", "currency":"", "amount":0
	}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid create status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

func TestFlowAPIRejectsInvalidTaxRate(t *testing.T) {
	router, _ := newFlowAPITestRouter(t)
	response := performFlowRequest(router, http.MethodPost, "/api/flows", `{
		"month":"2026-07", "direction":"in", "counterparty":"Acme", "currency":"USD", "amount":100, "taxRate":101
	}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid tax status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}

func TestFlowAPIImportsEntriesAndSkipsExactDuplicates(t *testing.T) {
	router, db := newFlowAPITestRouter(t)
	insertFlowTestEntry(t, db, "2026-07", "in", "Acme", 100)

	response := performFlowRequest(router, http.MethodPost, "/api/flows/import", `{
		"entries":[
			{"month":"2026-07","direction":"in","counterparty":" Acme ","currency":"usd","amount":100,"taxRate":0,"category":"","comment":""},
			{"month":"2026-07","direction":"out","counterparty":"Landlord","currency":"rub","amount":80,"taxRate":0,"category":"Rent","comment":"July"},
			{"month":"2026-07","direction":"out","counterparty":"Landlord","currency":"RUB","amount":80,"taxRate":0,"category":"Rent","comment":"July"}
		]
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("import status = %d, want %d; body: %s", response.Code, http.StatusOK, response.Body.String())
	}

	var result FlowImportResult
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Imported != 1 || result.Skipped != 2 {
		t.Fatalf("import result = %+v, want 1 imported and 2 skipped", result)
	}

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("flow entry count = %d, want 2", count)
	}
}

func TestFlowAPIImportsExactDuplicatesWhenRequested(t *testing.T) {
	router, db := newFlowAPITestRouter(t)
	insertFlowTestEntry(t, db, "2026-07", "in", "Acme", 100)

	response := performFlowRequest(router, http.MethodPost, "/api/flows/import", `{
		"allowDuplicates":true,
		"entries":[
			{"month":"2026-07","direction":"in","counterparty":"Acme","currency":"USD","amount":100},
			{"month":"2026-07","direction":"in","counterparty":"Acme","currency":"USD","amount":100}
		]
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("duplicate import status = %d, want %d; body: %s", response.Code, http.StatusOK, response.Body.String())
	}

	var result FlowImportResult
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Imported != 2 || result.Skipped != 0 {
		t.Fatalf("duplicate import result = %+v, want 2 imported and 0 skipped", result)
	}

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 3 {
		t.Fatalf("flow entry count = %d, want 3", count)
	}
}

func TestFlowAPIImportRejectsInvalidFileWithoutPartialSave(t *testing.T) {
	router, db := newFlowAPITestRouter(t)

	response := performFlowRequest(router, http.MethodPost, "/api/flows/import", `{
		"entries":[
			{"month":"2026-07","direction":"in","counterparty":"Acme","currency":"USD","amount":100},
			{"month":"2026-13","direction":"in","counterparty":"Broken","currency":"USD","amount":50}
		]
	}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid import status = %d, want %d; body: %s", response.Code, http.StatusBadRequest, response.Body.String())
	}

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("flow entry count after invalid import = %d, want 0", count)
	}
}

func TestFlowAPISavesWholeMonthAtomically(t *testing.T) {
	router, db := newFlowAPITestRouter(t)
	firstID := insertFlowTestEntry(t, db, "2026-07", "in", "Acme", 100)
	secondID := insertFlowTestEntry(t, db, "2026-07", "out", "Landlord", 50)
	otherMonthID := insertFlowTestEntry(t, db, "2026-06", "in", "Acme", 90)

	response := performFlowRequest(router, http.MethodPut, "/api/flows/months/2026-07", `{
		"entries":[
			{"id":`+strconv.FormatInt(firstID, 10)+`,"direction":"in","counterparty":" Acme Inc ","currency":"usd","amount":125,"taxRate":6,"category":"Salary","comment":"Adjusted"},
			{"direction":"out","counterparty":"Tax office","currency":"rub","amount":15,"category":"Taxes","comment":""}
		]
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("save period status = %d, want %d; body: %s", response.Code, http.StatusOK, response.Body.String())
	}

	var saved []FlowEntry
	if err := json.Unmarshal(response.Body.Bytes(), &saved); err != nil {
		t.Fatal(err)
	}
	if len(saved) != 2 || saved[0].ID != firstID || saved[0].Counterparty != "Acme Inc" || saved[0].Currency != "USD" || saved[0].TaxRate != 6 || saved[1].ID == 0 {
		t.Fatalf("saved entries = %+v, want updated and inserted normalized entries", saved)
	}

	var deletedCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries WHERE id = ?", secondID).Scan(&deletedCount); err != nil {
		t.Fatal(err)
	}
	if deletedCount != 0 {
		t.Fatalf("removed period entry count = %d, want 0", deletedCount)
	}
	var otherMonthCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries WHERE id = ?", otherMonthID).Scan(&otherMonthCount); err != nil {
		t.Fatal(err)
	}
	if otherMonthCount != 1 {
		t.Fatalf("other month entry count = %d, want 1", otherMonthCount)
	}
}

func TestFlowAPIPeriodRejectsForeignIDWithoutPartialSave(t *testing.T) {
	router, db := newFlowAPITestRouter(t)
	periodID := insertFlowTestEntry(t, db, "2026-07", "in", "Original", 100)
	foreignID := insertFlowTestEntry(t, db, "2026-06", "in", "Other", 90)

	response := performFlowRequest(router, http.MethodPut, "/api/flows/months/2026-07", `{
		"entries":[
			{"id":`+strconv.FormatInt(periodID, 10)+`,"direction":"in","counterparty":"Changed","currency":"USD","amount":125},
			{"id":`+strconv.FormatInt(foreignID, 10)+`,"direction":"out","counterparty":"Foreign","currency":"USD","amount":15}
		]
	}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("foreign id status = %d, want %d; body: %s", response.Code, http.StatusBadRequest, response.Body.String())
	}

	var counterparty string
	if err := db.QueryRow("SELECT counterparty FROM flow_entries WHERE id = ?", periodID).Scan(&counterparty); err != nil {
		t.Fatal(err)
	}
	if counterparty != "Original" {
		t.Fatalf("counterparty after rolled back save = %q, want Original", counterparty)
	}
}

func insertFlowTestEntry(t *testing.T, db *sql.DB, month, direction, counterparty string, amount float64) int64 {
	t.Helper()
	result, err := db.Exec(`
		INSERT INTO flow_entries (month, direction, counterparty, currency, amount, category, comment)
		VALUES (?, ?, ?, 'USD', ?, '', '')
	`, month, direction, counterparty, amount)
	if err != nil {
		t.Fatal(err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	return id
}
