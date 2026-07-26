package main

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newToolsTestDatabase(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "tools-test.db")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })

	_, err = db.Exec(`
		CREATE TABLE snapshots (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			month TEXT UNIQUE NOT NULL,
			data TEXT NOT NULL,
			duration_seconds INTEGER DEFAULT 0
		);
		CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE flow_entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			month TEXT NOT NULL,
			entry_type TEXT NOT NULL,
			direction TEXT NOT NULL,
			counterparty TEXT NOT NULL,
			account TEXT NOT NULL,
			tag TEXT NOT NULL,
			currency TEXT NOT NULL,
			amount REAL NOT NULL,
			tax_rate REAL NOT NULL,
			category TEXT NOT NULL,
			comment TEXT NOT NULL,
			to_account TEXT NOT NULL,
			to_tag TEXT NOT NULL,
			to_currency TEXT NOT NULL,
			to_amount REAL NOT NULL
		);
		INSERT INTO settings (key, value) VALUES (
			'master_data',
			'{"organizations":[{"name":"Bank"}],"currencies":["RUB","USD"],"tags":["cash"],"cashFlow":{"enabled":true}}'
		);
		INSERT INTO snapshots (month, data, duration_seconds) VALUES (
			'2026-01',
			'{"rates":{"RUB":1,"USD":80},"organizations":[{"id":"org-1","name":"Bank","balances":[{"currency":"RUB","amount":100,"tags":["cash"]}]}]}',
			10
		);
		INSERT INTO flow_entries (
			month, entry_type, direction, counterparty, account, tag, currency,
			amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount
		) VALUES (
			'2026-01', 'external', 'in', 'Employer', 'Bank', 'cash', 'RUB',
			100, 0, 'salary', '', '', '', '', 0
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func newToolsTestRouter(cfg *Config, db *sql.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	setupToolsAPI(router.Group("/api"), cfg, db, false)
	return router
}

func toolsRequest(
	t *testing.T,
	router http.Handler,
	method, path string,
	body any,
) *httptest.ResponseRecorder {
	t.Helper()
	var payload bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&payload).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	request := httptest.NewRequest(method, path, &payload)
	request.RemoteAddr = "127.0.0.1:41000"
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

func TestDataHealthReportsHealthyDatabase(t *testing.T) {
	db := newToolsTestDatabase(t)
	report, err := runDataHealthCheck(db)
	if err != nil {
		t.Fatal(err)
	}
	if report.Status != "healthy" {
		t.Fatalf("status = %q, issues: %+v", report.Status, report.Issues)
	}
	if report.Summary.Snapshots != 1 || report.Summary.FlowEntries != 1 {
		t.Fatalf("unexpected summary: %+v", report.Summary)
	}
}

func TestDataHealthAggregatesActionableProblems(t *testing.T) {
	db := newToolsTestDatabase(t)
	_, err := db.Exec(`
		UPDATE snapshots
		SET data = '{"rates":{"RUB":0},"organizations":[
			{"id":"","name":"","balances":[{"currency":"USD","amount":"not-a-number","tags":["unknown"]}]}
		]}'
		WHERE month = '2026-01'
	`)
	if err != nil {
		t.Fatal(err)
	}

	report, err := runDataHealthCheck(db)
	if err != nil {
		t.Fatal(err)
	}
	if report.Status != "critical" || report.Summary.Critical == 0 {
		t.Fatalf("report did not flag critical issues: %+v", report)
	}
	codes := make(map[string]bool)
	for _, issue := range report.Issues {
		codes[issue.Code] = true
	}
	for _, code := range []string{
		"snapshot_rate_non_positive",
		"snapshot_balance_rate_missing",
		"snapshot_balance_amount_invalid",
		"snapshot_organization_id_missing",
	} {
		if !codes[code] {
			t.Errorf("missing issue %q: %+v", code, report.Issues)
		}
	}
}

func TestToolsExportJSONAndCSV(t *testing.T) {
	db := newToolsTestDatabase(t)
	router := newToolsTestRouter(&Config{}, db)
	request := exportRequest{
		Format:           "json",
		FromMonth:        "2026-01",
		ToMonth:          "2026-01",
		IncludeSnapshots: true,
		IncludeSettings:  true,
		IncludeCashFlow:  true,
	}

	response := toolsRequest(t, router, http.MethodPost, "/api/tools/export", request)
	if response.Code != http.StatusOK {
		t.Fatalf("JSON export status = %d, body: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Header().Get("Content-Disposition"), ".json") {
		t.Fatalf("JSON export has no filename: %q", response.Header().Get("Content-Disposition"))
	}
	var decoded portableExport
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded.Snapshots) != 1 || len(decoded.Settings) != 1 || len(decoded.CashFlow) != 1 {
		t.Fatalf("unexpected JSON export counts: %+v", decoded)
	}

	request.Format = "csv"
	response = toolsRequest(t, router, http.MethodPost, "/api/tools/export", request)
	if response.Code != http.StatusOK {
		t.Fatalf("CSV export status = %d, body: %s", response.Code, response.Body.String())
	}
	archive, err := zip.NewReader(bytes.NewReader(response.Body.Bytes()), int64(response.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	names := make(map[string]bool)
	for _, file := range archive.File {
		names[file.Name] = true
	}
	for _, name := range []string{
		"manifest.json", "snapshots.csv", "organizations.csv", "balances.csv",
		"rates.csv", "settings.json", "cash_flow.csv",
	} {
		if !names[name] {
			t.Errorf("CSV archive is missing %s", name)
		}
	}
}

func TestBackupInspectorListsAndVerifiesBackup(t *testing.T) {
	db := newToolsTestDatabase(t)
	targetPath := t.TempDir()
	cfg := &Config{Backup: BackupConfig{
		Enabled:       true,
		OnlyIfChanged: true,
		Targets: []BackupTarget{{
			Name:      "local",
			Path:      targetPath,
			Retention: 5,
		}},
	}}
	report := RunBackupJob(cfg, db)
	if report.Status != backupStatusSuccess {
		t.Fatalf("backup failed: %+v", report)
	}

	router := newToolsTestRouter(cfg, db)
	response := toolsRequest(t, router, http.MethodGet, "/api/tools/backups", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("list status = %d, body: %s", response.Code, response.Body.String())
	}
	var listed backupInspectorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Targets) != 1 || len(listed.Targets[0].Files) != 1 {
		t.Fatalf("unexpected backup listing: %+v", listed)
	}
	file := listed.Targets[0].Files[0]
	if !file.Current {
		t.Fatalf("new backup was not marked current: %+v", file)
	}

	response = toolsRequest(t, router, http.MethodPost, "/api/tools/backups/verify", backupVerifyRequest{
		Target: "local",
		File:   file.Name,
	})
	if response.Code != http.StatusOK {
		t.Fatalf("verify status = %d, body: %s", response.Code, response.Body.String())
	}
	var verified backupVerifyResponse
	if err := json.Unmarshal(response.Body.Bytes(), &verified); err != nil {
		t.Fatal(err)
	}
	if verified.Status != "verified" || !verified.MatchesName {
		t.Fatalf("backup was not verified: %+v", verified)
	}

	response = toolsRequest(t, router, http.MethodPost, "/api/tools/backups/verify", backupVerifyRequest{
		Target: "local",
		File:   "../outside.db",
	})
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("path traversal status = %d, body: %s", response.Code, response.Body.String())
	}
}
