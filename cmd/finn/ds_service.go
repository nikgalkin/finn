package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

// dsRunRetention is how many runs per source survive. The audit trail is for
// "why did last night's fetch fail", not for history.
const dsRunRetention = 100

// settingsKeyDSConfirmations records which path+hash pairs the user agreed to
// run. It lives in settings rather than in config.yml because it is an answer
// about an entry the file already lists, not a registry of its own: confirming
// something that is not in config.yml grants nothing.
const settingsKeyDSConfirmations = "ds_confirmations"

var (
	errDatasourcesDisabled = errors.New("datasources are disabled in config.yml")
	errDatasourcesDemo     = errors.New("datasources are turned off in demo mode")
	errDatasourceUnknown   = errors.New("no such datasource in config.yml")
	errDatasourceBusy      = errors.New("this datasource is already running")
	errDatasourceNeedsOK   = errors.New("this plugin has not been confirmed for its current path and hash")
	errDatasourceOff       = errors.New("this datasource is disabled in config.yml")
)

type dsManifestView struct {
	Name       string        `json:"name"`
	Version    string        `json:"version"`
	Kinds      []string      `json:"kinds"`
	UsesCursor bool          `json:"usesCursor"`
	ConfigKeys []dsConfigKey `json:"configKeys,omitempty"`
}

// dsSourceView is one row of the sources panel: what the config says, what the
// binary on disk turned out to be, and how the last run went.
type dsSourceView struct {
	Name           string          `json:"name"`
	Path           string          `json:"path"`
	SHA256         string          `json:"sha256,omitempty"`
	Pinned         bool            `json:"pinned"`
	Confirmed      bool            `json:"confirmed"`
	Orphaned       bool            `json:"orphaned"`
	Disabled       bool            `json:"disabled"`
	Runnable       bool            `json:"runnable"`
	TimeoutSeconds int             `json:"timeoutSeconds"`
	ConfigError    string          `json:"configError,omitempty"`
	BinaryError    string          `json:"binaryError,omitempty"`
	ManifestError  string          `json:"manifestError,omitempty"`
	Manifest       *dsManifestView `json:"manifest,omitempty"`
	Cursor         string          `json:"cursor,omitempty"`
	LastRunAt      string          `json:"lastRunAt,omitempty"`
	LastStatus     string          `json:"lastStatus,omitempty"`
	LastError      string          `json:"lastError,omitempty"`
	PendingCount   int             `json:"pendingCount"`
}

type dsSourcesView struct {
	Enabled bool           `json:"enabled"`
	Demo    bool           `json:"demo"`
	Sources []dsSourceView `json:"sources"`
	Pending int            `json:"pending"`
}

// dsSummaryView is deliberately cheaper than sources(): the app header asks for
// it on navigation and should never hash or execute plugin binaries merely to
// refresh a badge.
type dsSummaryView struct {
	Available bool `json:"available"`
	Pending   int  `json:"pending"`
}

// dsFetchSummary is what one fetch did, as stored in ds_runs and returned to the
// caller of a fetch.
type dsFetchSummary struct {
	RunID        int64    `json:"runId"`
	Source       string   `json:"source"`
	Status       string   `json:"status"`
	StartedAt    string   `json:"startedAt"`
	FinishedAt   string   `json:"finishedAt"`
	DurationMS   int64    `json:"durationMs"`
	ExitCode     int      `json:"exitCode"`
	StdoutBytes  int      `json:"stdoutBytes"`
	ItemsTotal   int      `json:"itemsTotal"`
	ItemsNew     int      `json:"itemsNew"`
	ItemsSkipped int      `json:"itemsSkipped"`
	Cursor       string   `json:"cursor,omitempty"`
	Warnings     []string `json:"warnings,omitempty"`
	Error        string   `json:"error,omitempty"`
	StderrTail   string   `json:"stderrTail,omitempty"`
	DryRun       bool     `json:"dryRun,omitempty"`
	Items        []dsItem `json:"items,omitempty"`
}

type dsManifestCacheEntry struct {
	hash     string
	manifest dsManifestView
	err      string
}

// dsService owns everything datasource-shaped: which plugins exist, whether they
// may run, and what a run did to the Inbox.
type dsService struct {
	cfg    *Config
	db     *sql.DB
	isDemo bool

	mu        sync.Mutex
	manifests map[string]dsManifestCacheEntry
	running   map[string]bool
}

func newDatasourceService(cfg *Config, db *sql.DB, isDemo bool) *dsService {
	return &dsService{
		cfg:       cfg,
		db:        db,
		isDemo:    isDemo,
		manifests: make(map[string]dsManifestCacheEntry),
		running:   make(map[string]bool),
	}
}

// available reports whether the mechanism may be used at all. Demo mode never
// runs external programs: a sample database is meant to be safe to hand around.
func (service *dsService) available() error {
	if service.isDemo {
		return errDatasourcesDemo
	}
	if !service.cfg.Datasources.Enabled {
		return errDatasourcesDisabled
	}
	return nil
}

func (service *dsService) plugin(name string) (DatasourcePlugin, error) {
	plugin, found := service.cfg.Datasources.Plugin(strings.ToLower(strings.TrimSpace(name)))
	if !found {
		return DatasourcePlugin{}, errDatasourceUnknown
	}
	return plugin, nil
}

// --- confirmations -------------------------------------------------------

type dsConfirmation struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	At     string `json:"at"`
}

func (service *dsService) confirmations() (map[string]dsConfirmation, error) {
	var value string
	err := service.db.QueryRow("SELECT value FROM settings WHERE key = ?", settingsKeyDSConfirmations).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return map[string]dsConfirmation{}, nil
	}
	if err != nil {
		return nil, err
	}
	confirmations := map[string]dsConfirmation{}
	if err := json.Unmarshal([]byte(value), &confirmations); err != nil {
		return map[string]dsConfirmation{}, nil
	}
	return confirmations, nil
}

// confirm records that the user agreed to run this exact binary. The hash is
// part of the record, so replacing the file asks again.
func (service *dsService) confirm(name string) (dsSourceView, error) {
	if err := service.available(); err != nil {
		return dsSourceView{}, err
	}
	plugin, err := service.plugin(name)
	if err != nil {
		return dsSourceView{}, err
	}
	binary, err := verifyDatasourceBinary(plugin)
	if err != nil {
		return dsSourceView{}, err
	}

	confirmations, err := service.confirmations()
	if err != nil {
		return dsSourceView{}, err
	}
	confirmations[plugin.Name] = dsConfirmation{Path: binary.Path, SHA256: binary.SHA256, At: time.Now().Format(time.RFC3339)}
	encoded, err := json.Marshal(confirmations)
	if err != nil {
		return dsSourceView{}, err
	}
	if _, err := service.db.Exec(
		"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		settingsKeyDSConfirmations, string(encoded),
	); err != nil {
		return dsSourceView{}, err
	}

	views, err := service.sources()
	if err != nil {
		return dsSourceView{}, err
	}
	for _, view := range views.Sources {
		if view.Name == plugin.Name {
			return view, nil
		}
	}
	return dsSourceView{}, errDatasourceUnknown
}

func confirmationMatches(confirmation dsConfirmation, binary verifiedBinary) bool {
	return confirmation.Path == binary.Path && confirmation.SHA256 == binary.SHA256
}

// --- manifests -----------------------------------------------------------

// manifest asks the plugin to describe itself. The answer is cached per hash:
// the command is contractually free of side effects and of network access, but
// re-running a program on every page load would still be wrong.
func (service *dsService) manifest(ctx context.Context, plugin DatasourcePlugin, binary verifiedBinary) (dsManifestView, error) {
	service.mu.Lock()
	cached, found := service.manifests[plugin.Name]
	service.mu.Unlock()
	if found && cached.hash == binary.SHA256 {
		if cached.err != "" {
			return dsManifestView{}, errors.New(cached.err)
		}
		return cached.manifest, nil
	}

	result := runDatasourcePlugin(ctx, plugin, dsRequest{
		Command: dsCommandManifest,
		Source:  plugin.Name,
		Config:  plugin.Config,
	})

	entry := dsManifestCacheEntry{hash: binary.SHA256}
	if result.Error != "" {
		entry.err = result.Error
	} else if err := validateDatasourceManifest(result.Response); err != nil {
		entry.err = "invalid manifest: " + err.Error()
	} else {
		entry.manifest = dsManifestView{
			Name:       result.Response.Name,
			Version:    result.Response.Version,
			Kinds:      result.Response.Kinds,
			UsesCursor: result.Response.UsesCursor,
			ConfigKeys: result.Response.ConfigKeys,
		}
	}

	service.mu.Lock()
	service.manifests[plugin.Name] = entry
	service.mu.Unlock()

	if entry.err != "" {
		return dsManifestView{}, errors.New(entry.err)
	}
	return entry.manifest, nil
}

// --- sources -------------------------------------------------------------

// sources merges the three places the truth lives: config.yml for the registry,
// the binary on disk for what would actually run, and ds_sources for how the
// last attempt went.
func (service *dsService) sources() (dsSourcesView, error) {
	view := dsSourcesView{
		Enabled: service.cfg.Datasources.Enabled && !service.isDemo,
		Demo:    service.isDemo,
		Sources: []dsSourceView{},
	}

	state, err := service.sourceStates()
	if err != nil {
		return view, err
	}
	pending, err := service.pendingCounts()
	if err != nil {
		return view, err
	}
	confirmations, err := service.confirmations()
	if err != nil {
		return view, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	configured := make(map[string]struct{}, len(service.cfg.Datasources.Plugins))
	for _, plugin := range service.cfg.Datasources.Plugins {
		configured[plugin.Name] = struct{}{}

		source := dsSourceView{
			Name:           plugin.Name,
			Path:           plugin.Path,
			Pinned:         plugin.Pinned(),
			Disabled:       plugin.Disabled,
			TimeoutSeconds: plugin.Timeout(),
			ConfigError:    plugin.ConfigError,
			PendingCount:   pending[plugin.Name],
		}
		if recorded, found := state[plugin.Name]; found {
			source.Cursor = recorded.Cursor
			source.LastRunAt = recorded.LastRunAt
			source.LastStatus = recorded.LastStatus
			source.LastError = recorded.LastError
		}
		// Listing sources is also how the header decides whether to show the
		// Inbox. It must stay a read-only operation while the mechanism (or this
		// individual entry) is disabled: in particular, demo mode must never
		// execute even the nominally side-effect-free manifest command.
		if !view.Enabled || plugin.Disabled || plugin.ConfigError != "" {
			view.Sources = append(view.Sources, source)
			view.Pending += source.PendingCount
			continue
		}

		binary, binaryErr := verifyDatasourceBinary(plugin)
		if binaryErr != nil {
			source.BinaryError = binaryErr.Error()
		} else {
			source.SHA256 = binary.SHA256
			source.Confirmed = confirmationMatches(confirmations[plugin.Name], binary)
			if manifest, err := service.manifest(ctx, plugin, binary); err != nil {
				source.ManifestError = err.Error()
			} else {
				manifestCopy := manifest
				source.Manifest = &manifestCopy
			}
		}
		source.Runnable = view.Enabled && !plugin.Disabled && source.BinaryError == "" && source.ConfigError == "" && source.ManifestError == ""
		view.Sources = append(view.Sources, source)
		view.Pending += source.PendingCount
	}

	// A source that ran once and then vanished from config.yml still owns rows
	// in the Inbox. Showing it as orphaned explains where they came from; it can
	// never be run again without being put back in the file.
	for name, recorded := range state {
		if _, found := configured[name]; found {
			continue
		}
		view.Sources = append(view.Sources, dsSourceView{
			Name:         name,
			Orphaned:     true,
			Cursor:       recorded.Cursor,
			LastRunAt:    recorded.LastRunAt,
			LastStatus:   recorded.LastStatus,
			LastError:    recorded.LastError,
			PendingCount: pending[name],
		})
		view.Pending += pending[name]
	}

	sort.SliceStable(view.Sources, func(i, j int) bool { return view.Sources[i].Name < view.Sources[j].Name })
	return view, nil
}

func (service *dsService) summary() (dsSummaryView, error) {
	view := dsSummaryView{
		Available: service.cfg.Datasources.Enabled && !service.isDemo && len(service.cfg.Datasources.Plugins) > 0,
	}
	if err := service.db.QueryRow("SELECT COUNT(*) FROM ds_inbox WHERE status IN ('pending', 'invalid')").Scan(&view.Pending); err != nil {
		return view, err
	}
	return view, nil
}

type dsSourceState struct {
	Cursor     string
	LastRunAt  string
	LastStatus string
	LastError  string
}

func (service *dsService) sourceStates() (map[string]dsSourceState, error) {
	rows, err := service.db.Query("SELECT name, cursor, last_run_at, last_status, last_error FROM ds_sources")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	states := make(map[string]dsSourceState)
	for rows.Next() {
		var name string
		var state dsSourceState
		if err := rows.Scan(&name, &state.Cursor, &state.LastRunAt, &state.LastStatus, &state.LastError); err != nil {
			return nil, err
		}
		states[name] = state
	}
	return states, rows.Err()
}

func (service *dsService) pendingCounts() (map[string]int, error) {
	rows, err := service.db.Query("SELECT source, COUNT(*) FROM ds_inbox WHERE status IN ('pending', 'invalid') GROUP BY source")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var source string
		var count int
		if err := rows.Scan(&source, &count); err != nil {
			return nil, err
		}
		counts[source] = count
	}
	return counts, rows.Err()
}

// --- fetch ---------------------------------------------------------------

type dsFetchOptions struct {
	DryRun      bool
	SkipConfirm bool
}

// fetch runs one source and, unless this is a dry run, files what came back.
//
// A dry run guarantees only that Finn wrote nothing. The plugin has already
// talked to the outside world by then and may have acted there — replied in a
// chat, marked something as read. The guarantee is one-directional.
func (service *dsService) fetch(ctx context.Context, name string, options dsFetchOptions) (dsFetchSummary, error) {
	if err := service.available(); err != nil {
		return dsFetchSummary{}, err
	}
	plugin, err := service.plugin(name)
	if err != nil {
		return dsFetchSummary{}, err
	}
	if plugin.ConfigError != "" {
		return dsFetchSummary{}, errors.New(plugin.ConfigError)
	}
	if plugin.Disabled {
		return dsFetchSummary{}, errDatasourceOff
	}

	binary, err := verifyDatasourceBinary(plugin)
	if err != nil {
		return dsFetchSummary{}, err
	}
	if !options.SkipConfirm {
		confirmations, err := service.confirmations()
		if err != nil {
			return dsFetchSummary{}, err
		}
		if !confirmationMatches(confirmations[plugin.Name], binary) {
			return dsFetchSummary{}, errDatasourceNeedsOK
		}
	}
	if !service.claim(plugin.Name) {
		return dsFetchSummary{}, errDatasourceBusy
	}
	defer service.release(plugin.Name)

	// Conformance is not merely advisory: every real fetch is preceded by a
	// complete manifest. The cache makes this free after the sources page has
	// already loaded it, while CLI and direct API callers get the same guarantee.
	if _, err := service.manifest(ctx, plugin, binary); err != nil {
		return dsFetchSummary{}, fmt.Errorf("plugin manifest: %w", err)
	}

	cursor, err := service.cursor(plugin.Name)
	if err != nil {
		return dsFetchSummary{}, err
	}
	references, err := service.references()
	if err != nil {
		return dsFetchSummary{}, err
	}

	result := runDatasourcePlugin(ctx, plugin, dsRequest{
		Command:         dsCommandFetch,
		Source:          plugin.Name,
		Cursor:          cursor,
		Config:          plugin.Config,
		KnownCurrencies: references.Currencies,
		KnownAccounts:   references.Accounts,
		KnownTags:       references.Tags,
		KnownCategories: references.Categories,
	})

	if options.DryRun {
		summary := summarizeRun(result)
		summary.DryRun = true
		summary.Items = result.Response.Items
		if result.Error == "" {
			summary.ItemsTotal = len(result.Response.Items)
			summary.Cursor = result.Response.Cursor
		}
		return summary, nil
	}
	return service.recordRun(plugin.Name, result)
}

func (service *dsService) claim(name string) bool {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.running[name] {
		return false
	}
	service.running[name] = true
	return true
}

func (service *dsService) release(name string) {
	service.mu.Lock()
	defer service.mu.Unlock()
	delete(service.running, name)
}

func (service *dsService) cursor(name string) (string, error) {
	var cursor string
	err := service.db.QueryRow("SELECT cursor FROM ds_sources WHERE name = ?", name).Scan(&cursor)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return cursor, err
}

type dsReferences struct {
	Currencies []string
	Accounts   []string
	Tags       []string
	Categories []string
}

// references are the lists a plugin normalizes against, so it can turn "bank"
// into the account the user actually configured instead of guessing. The base
// currency leads the list, which is what a plugin should default to.
func (service *dsService) references() (dsReferences, error) {
	master, err := loadMasterSettings(service.db)
	if err != nil {
		return dsReferences{}, err
	}

	references := dsReferences{
		Currencies: stringListSetting(master["currencies"]),
		Tags:       stringListSetting(master["tags"]),
	}
	if base, ok := master["baseCurrency"].(string); ok && base != "" {
		references.Currencies = append([]string{base}, removeString(references.Currencies, base)...)
	}
	for _, organization := range organizationListSetting(master["organizations"]) {
		references.Accounts = append(references.Accounts, organization)
	}
	if cashFlow, ok := master["cashFlow"].(map[string]any); ok {
		references.Categories = stringListSetting(cashFlow["categories"])
	}
	return references, nil
}

func stringListSetting(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	list := make([]string, 0, len(items))
	for _, item := range items {
		if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
			list = append(list, text)
		}
	}
	return list
}

// organizationListSetting reads organization names, tolerating both the current
// object form and the plain strings older settings used.
func organizationListSetting(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	names := make([]string, 0, len(items))
	for _, item := range items {
		switch typed := item.(type) {
		case string:
			names = append(names, typed)
		case map[string]any:
			if typed["archivedAt"] != nil {
				continue
			}
			if name, ok := typed["name"].(string); ok && strings.TrimSpace(name) != "" {
				names = append(names, name)
			}
		}
	}
	return names
}

func removeString(list []string, value string) []string {
	filtered := make([]string, 0, len(list))
	for _, item := range list {
		if item != value {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func summarizeRun(result dsRunResult) dsFetchSummary {
	status := "ok"
	if result.Error != "" {
		status = "error"
	}
	return dsFetchSummary{
		Source:      result.Source,
		Status:      status,
		StartedAt:   result.StartedAt.Format(time.RFC3339),
		FinishedAt:  result.FinishedAt.Format(time.RFC3339),
		DurationMS:  result.Duration.Milliseconds(),
		ExitCode:    result.ExitCode,
		StdoutBytes: result.StdoutBytes,
		Warnings:    result.Response.Warnings,
		Error:       result.Error,
		StderrTail:  result.StderrTail,
	}
}

// recordRun writes the audit row, the items and the cursor. Items and cursor go
// in one transaction: a cursor committed without its items would skip them
// forever, and the source has no way to hand them over a second time.
func (service *dsService) recordRun(source string, result dsRunResult) (dsFetchSummary, error) {
	summary := summarizeRun(result)

	transaction, err := service.db.Begin()
	if err != nil {
		return summary, err
	}
	defer transaction.Rollback()

	runResult, err := transaction.Exec(`
		INSERT INTO ds_runs (source, started_at, finished_at, exit_code, duration_ms, stdout_bytes, error, stderr_tail)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, source, summary.StartedAt, summary.FinishedAt, summary.ExitCode, summary.DurationMS, summary.StdoutBytes, summary.Error, summary.StderrTail)
	if err != nil {
		return summary, err
	}
	runID, err := runResult.LastInsertId()
	if err != nil {
		return summary, err
	}
	summary.RunID = runID

	if result.Error == "" {
		received := time.Now().Format(time.RFC3339)
		seen := make(map[string]struct{}, len(result.Response.Items))
		for index, item := range result.Response.Items {
			summary.ItemsTotal++

			row, warning := prepareInboxRow(source, item, received, runID)
			if warning != "" {
				summary.ItemsSkipped++
				summary.Warnings = append(summary.Warnings, fmt.Sprintf("item %d: %s", index+1, warning))
				continue
			}
			if _, duplicate := seen[row.ExternalID]; duplicate {
				summary.ItemsSkipped++
				summary.Warnings = append(summary.Warnings, fmt.Sprintf("item %d: external_id %q appears twice in one response", index+1, row.ExternalID))
				continue
			}
			seen[row.ExternalID] = struct{}{}

			// The unique index carries deduplication, so a re-fetch of the same
			// item is a no-op rather than a second copy — including one the user
			// already rejected.
			insert, err := transaction.Exec(`
				INSERT OR IGNORE INTO ds_inbox (source, external_id, kind, status, occurred_at, received_at, raw, draft, note, run_id)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`, row.Source, row.ExternalID, row.Kind, row.Status, row.OccurredAt, row.ReceivedAt, row.Raw, row.Draft, row.Note, runID)
			if err != nil {
				return summary, err
			}
			affected, err := insert.RowsAffected()
			if err != nil {
				return summary, err
			}
			if affected == 0 {
				summary.ItemsSkipped++
				continue
			}
			summary.ItemsNew++
		}
		summary.Cursor = result.Response.Cursor
	}

	if _, err := transaction.Exec(`
		UPDATE ds_runs SET items_total = ?, items_new = ?, items_skipped = ? WHERE id = ?
	`, summary.ItemsTotal, summary.ItemsNew, summary.ItemsSkipped, runID); err != nil {
		return summary, err
	}

	lastStatus := summary.Status
	if _, err := transaction.Exec(`
		INSERT INTO ds_sources (name, cursor, last_run_at, last_status, last_error)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(name) DO UPDATE SET
			cursor = CASE WHEN excluded.last_status = 'ok' THEN excluded.cursor ELSE ds_sources.cursor END,
			last_run_at = excluded.last_run_at,
			last_status = excluded.last_status,
			last_error = excluded.last_error
	`, source, summary.Cursor, summary.FinishedAt, lastStatus, summary.Error); err != nil {
		return summary, err
	}

	if _, err := transaction.Exec(`
		DELETE FROM ds_runs
		WHERE source = ? AND id NOT IN (SELECT id FROM ds_runs WHERE source = ? ORDER BY id DESC LIMIT ?)
	`, source, source, dsRunRetention); err != nil {
		return summary, err
	}

	if err := transaction.Commit(); err != nil {
		return summary, err
	}
	return summary, nil
}

// --- runs ----------------------------------------------------------------

type dsRunView struct {
	ID           int64  `json:"id"`
	Source       string `json:"source"`
	StartedAt    string `json:"startedAt"`
	FinishedAt   string `json:"finishedAt"`
	ExitCode     int    `json:"exitCode"`
	DurationMS   int64  `json:"durationMs"`
	StdoutBytes  int    `json:"stdoutBytes"`
	ItemsTotal   int    `json:"itemsTotal"`
	ItemsNew     int    `json:"itemsNew"`
	ItemsSkipped int    `json:"itemsSkipped"`
	Error        string `json:"error,omitempty"`
	StderrTail   string `json:"stderrTail,omitempty"`
}

func (service *dsService) runs(source string, limit int) ([]dsRunView, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `
		SELECT id, source, started_at, finished_at, exit_code, duration_ms, stdout_bytes, items_total, items_new, items_skipped, error, stderr_tail
		FROM ds_runs`
	arguments := []any{}
	if source != "" {
		query += " WHERE source = ?"
		arguments = append(arguments, source)
	}
	query += " ORDER BY id DESC LIMIT ?"
	arguments = append(arguments, limit)

	rows, err := service.db.Query(query, arguments...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := make([]dsRunView, 0, limit)
	for rows.Next() {
		var run dsRunView
		if err := rows.Scan(&run.ID, &run.Source, &run.StartedAt, &run.FinishedAt, &run.ExitCode, &run.DurationMS,
			&run.StdoutBytes, &run.ItemsTotal, &run.ItemsNew, &run.ItemsSkipped, &run.Error, &run.StderrTail); err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}
