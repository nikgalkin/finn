package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

// newTestSQLConsole builds a console over a throwaway database file that already
// contains the application tables.
func newTestSQLConsole(t *testing.T) *SQLConsole {
	t.Helper()

	databasePath := filepath.Join(t.TempDir(), "console-test.db")
	appDB, err := sql.Open("sqlite3", databasePath)
	if err != nil {
		t.Fatal(err)
	}
	appDB.SetMaxOpenConns(1)
	t.Cleanup(func() { appDB.Close() })

	if _, err := appDB.Exec(`
		CREATE TABLE snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT UNIQUE NOT NULL, data TEXT NOT NULL, duration_seconds INTEGER DEFAULT 0);
		CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
		INSERT INTO snapshots (month, data) VALUES ('2026-01', '{"a":1}'), ('2026-02', '{"a":2}');
		INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, '001_x.sql', '2026-01-01');
	`); err != nil {
		t.Fatal(err)
	}

	console, err := newSQLConsole(&Config{}, appDB, databasePath, false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { console.Close() })
	return console
}

func execSQLConsole(t *testing.T, console *SQLConsole, body string) *httptest.ResponseRecorder {
	t.Helper()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	console.registerRoutes(router.Group("/api"))

	request := httptest.NewRequest(http.MethodPost, "/api/sql/exec", bytes.NewBufferString(body))
	request.RemoteAddr = "127.0.0.1:41000"
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

// TestSQLConsoleRejectsDatabaseManagement is the important one: the console is a
// data tool, so everything that changes the database itself must be refused.
func TestSQLConsoleRejectsDatabaseManagement(t *testing.T) {
	console := newTestSQLConsole(t)

	blocked := []struct {
		name string
		sql  string
	}{
		{"create table", `CREATE TABLE evil (x TEXT)`},
		{"create temp table", `CREATE TEMP TABLE evil (x TEXT)`},
		{"drop table", `DROP TABLE snapshots`},
		{"alter table", `ALTER TABLE snapshots ADD COLUMN evil TEXT`},
		{"create index", `CREATE INDEX idx ON snapshots(month)`},
		{"create trigger", `CREATE TRIGGER t AFTER INSERT ON snapshots BEGIN DELETE FROM snapshots; END`},
		{"create view", `CREATE VIEW v AS SELECT * FROM snapshots`},
		{"attach", `ATTACH DATABASE '/tmp/evil.db' AS evil`},
		{"detach", `DETACH DATABASE main`},
		{"pragma writable_schema", `PRAGMA writable_schema = ON`},
		{"pragma journal_mode", `PRAGMA journal_mode = DELETE`},
		{"vacuum", `VACUUM`},
		{"reindex", `REINDEX`},
		{"analyze", `ANALYZE`},
		{"write sqlite_master", `UPDATE sqlite_master SET sql = 'x'`},
		{"write schema_migrations", `DELETE FROM schema_migrations`},
		{"load_extension", `SELECT load_extension('/tmp/x.so')`},
		{"ddl smuggled behind select", `SELECT 1; /* comment */ DROP TABLE snapshots`},
		{"ddl smuggled behind comment", `-- harmless
			DROP TABLE snapshots`},
	}

	for _, tt := range blocked {
		t.Run(tt.name, func(t *testing.T) {
			payload, _ := json.Marshal(map[string]any{"sql": tt.sql, "mode": "apply"})
			response := execSQLConsole(t, console, string(payload))
			if response.Code == http.StatusOK {
				t.Fatalf("%s was allowed, want rejection; body: %s", tt.name, response.Body.String())
			}
		})
	}

	// The schema must have survived every attempt above.
	var tableCount int
	if err := console.appDB.QueryRow(
		"SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
	).Scan(&tableCount); err != nil {
		t.Fatal(err)
	}
	if tableCount != 3 {
		t.Fatalf("table count = %d, want the original 3 tables", tableCount)
	}

	var migrationCount int
	if err := console.appDB.QueryRow("SELECT count(*) FROM schema_migrations").Scan(&migrationCount); err != nil {
		t.Fatal(err)
	}
	if migrationCount != 1 {
		t.Fatalf("schema_migrations rows = %d, want 1", migrationCount)
	}
}

func TestSQLConsoleAllowsDataStatements(t *testing.T) {
	console := newTestSQLConsole(t)

	allowed := []struct {
		name string
		sql  string
	}{
		{"select", `SELECT id, month FROM snapshots`},
		{"insert", `INSERT INTO snapshots (month, data) VALUES ('2026-03', '{}')`},
		{"update", `UPDATE snapshots SET data = '{"a":9}' WHERE month = '2026-01'`},
		{"update via json_set", `UPDATE snapshots SET data = json_set(data, '$.a', 42) WHERE month = '2026-02'`},
		{"delete", `DELETE FROM snapshots WHERE month = '2026-02'`},
		{"upsert", `INSERT INTO snapshots (month, data) VALUES ('2026-01', '{}') ON CONFLICT DO NOTHING`},
		{"insert select", `INSERT INTO snapshots (month, data) SELECT '2026-08', data FROM snapshots LIMIT 1`},
		{"cte select", `WITH recent AS (SELECT * FROM snapshots) SELECT count(*) FROM recent`},
		{"read schema_migrations", `SELECT version, name FROM schema_migrations`},
		{"explain query plan", `EXPLAIN QUERY PLAN SELECT * FROM snapshots WHERE month = '2026-01'`},
	}

	for _, tt := range allowed {
		t.Run(tt.name, func(t *testing.T) {
			payload, _ := json.Marshal(map[string]any{"sql": tt.sql, "mode": "dry_run"})
			response := execSQLConsole(t, console, string(payload))
			if response.Code != http.StatusOK {
				t.Fatalf("%s was rejected, want success; body: %s", tt.name, response.Body.String())
			}
		})
	}
}

func TestSQLConsoleDryRunLeavesDataUnchanged(t *testing.T) {
	console := newTestSQLConsole(t)

	payload, _ := json.Marshal(map[string]any{"sql": `DELETE FROM snapshots`, "mode": "dry_run"})
	response := execSQLConsole(t, console, string(payload))
	if response.Code != http.StatusOK {
		t.Fatalf("dry run status = %d, body: %s", response.Code, response.Body.String())
	}

	var decoded sqlConsoleResponse
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Committed {
		t.Fatal("dry run reported a commit")
	}
	if decoded.TotalWrites != 2 {
		t.Fatalf("dry run reported %d affected rows, want 2", decoded.TotalWrites)
	}

	var remaining int
	if err := console.appDB.QueryRow("SELECT count(*) FROM snapshots").Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 2 {
		t.Fatalf("rows after dry run = %d, want 2 (nothing should have been deleted)", remaining)
	}
}

func TestSQLConsoleApplyCommits(t *testing.T) {
	console := newTestSQLConsole(t)

	payload, _ := json.Marshal(map[string]any{"sql": `DELETE FROM snapshots WHERE month = '2026-01'`, "mode": "apply"})
	response := execSQLConsole(t, console, string(payload))
	if response.Code != http.StatusOK {
		t.Fatalf("apply status = %d, body: %s", response.Code, response.Body.String())
	}

	var decoded sqlConsoleResponse
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if !decoded.Committed {
		t.Fatal("apply did not report a commit")
	}

	var remaining int
	if err := console.appDB.QueryRow("SELECT count(*) FROM snapshots").Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 1 {
		t.Fatalf("rows after apply = %d, want 1", remaining)
	}
}

// A batch must be all-or-nothing: a later failure must undo earlier statements.
func TestSQLConsoleRollsBackFailedBatch(t *testing.T) {
	console := newTestSQLConsole(t)

	script := `DELETE FROM snapshots WHERE month = '2026-01'; DROP TABLE settings`
	payload, _ := json.Marshal(map[string]any{"sql": script, "mode": "apply"})
	response := execSQLConsole(t, console, string(payload))
	if response.Code == http.StatusOK {
		t.Fatalf("batch containing DDL succeeded, want rejection; body: %s", response.Body.String())
	}

	var remaining int
	if err := console.appDB.QueryRow("SELECT count(*) FROM snapshots").Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 2 {
		t.Fatalf("rows after rejected batch = %d, want 2 (the whole batch must be refused)", remaining)
	}
}

// Snapshot payloads are JSON, so a semicolon inside a string literal must not be
// mistaken for a statement separator.
func TestSQLConsoleKeepsSemicolonsInsideStrings(t *testing.T) {
	console := newTestSQLConsole(t)

	script := `UPDATE snapshots SET data = '{"note":"paid; then refunded"}' WHERE month = '2026-01'`
	payload, _ := json.Marshal(map[string]any{"sql": script, "mode": "apply"})
	response := execSQLConsole(t, console, string(payload))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body: %s", response.Code, response.Body.String())
	}

	var decoded sqlConsoleResponse
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded.Statements) != 1 {
		t.Fatalf("statement count = %d, want 1; the literal was split", len(decoded.Statements))
	}

	var stored string
	if err := console.appDB.QueryRow("SELECT data FROM snapshots WHERE month = '2026-01'").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != `{"note":"paid; then refunded"}` {
		t.Fatalf("stored data = %q, want the literal to survive intact", stored)
	}
}

// Column provenance is what lets the UI offer to build an UPDATE from a result
// cell, so it must survive aliases, joins and CTEs.
func TestSQLConsoleReportsColumnSources(t *testing.T) {
	console := newTestSQLConsole(t)

	tests := []struct {
		name string
		sql  string
		want []sqlConsoleColumnSource
	}{
		{
			name: "plain select",
			sql:  `SELECT month, duration_seconds FROM snapshots`,
			want: []sqlConsoleColumnSource{{"snapshots", "month"}, {"snapshots", "duration_seconds"}},
		},
		{
			name: "aliased columns resolve to their origin",
			sql:  `SELECT s.month AS m, s.data AS payload FROM snapshots s`,
			want: []sqlConsoleColumnSource{{"snapshots", "month"}, {"snapshots", "data"}},
		},
		{
			name: "computed columns have no source",
			sql:  `SELECT month, count(*) AS total FROM snapshots GROUP BY month`,
			want: []sqlConsoleColumnSource{{"snapshots", "month"}, {"", ""}},
		},
		{
			name: "cte resolves through to the base table",
			sql:  `WITH recent AS (SELECT month FROM snapshots) SELECT month FROM recent`,
			want: []sqlConsoleColumnSource{{"snapshots", "month"}},
		},
		{
			name: "literal only",
			sql:  `SELECT 1 + 1 AS computed`,
			want: []sqlConsoleColumnSource{{"", ""}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, _ := json.Marshal(map[string]any{"sql": tt.sql, "mode": "dry_run"})
			response := execSQLConsole(t, console, string(payload))
			if response.Code != http.StatusOK {
				t.Fatalf("status = %d, body: %s", response.Code, response.Body.String())
			}

			var decoded sqlConsoleResponse
			if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
				t.Fatal(err)
			}
			got := decoded.Statements[0].ColumnSources
			if len(got) != len(tt.want) {
				t.Fatalf("column source count = %d, want %d (%+v)", len(got), len(tt.want), got)
			}
			for i, want := range tt.want {
				if got[i] != want {
					t.Errorf("column %d source = %+v, want %+v", i, got[i], want)
				}
			}
		})
	}
}

func TestSQLConsoleRejectsForeignOrigin(t *testing.T) {
	console := newTestSQLConsole(t)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	console.registerRoutes(router.Group("/api"))

	payload, _ := json.Marshal(map[string]any{"sql": "SELECT 1", "mode": "dry_run"})
	request := httptest.NewRequest(http.MethodPost, "/api/sql/exec", bytes.NewBuffer(payload))
	request.RemoteAddr = "127.0.0.1:41000"
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "https://evil.example.com")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("foreign origin status = %d, want %d", response.Code, http.StatusForbidden)
	}
}

func TestSQLConsoleSchemaListsTables(t *testing.T) {
	console := newTestSQLConsole(t)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	console.registerRoutes(router.Group("/api"))

	request := httptest.NewRequest(http.MethodGet, "/api/sql/schema", nil)
	request.RemoteAddr = "127.0.0.1:41000"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("schema status = %d, body: %s", response.Code, response.Body.String())
	}

	var decoded struct {
		Tables []sqlConsoleTable `json:"tables"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded.Tables) != 3 {
		t.Fatalf("schema returned %d tables, want 3", len(decoded.Tables))
	}

	byName := make(map[string]sqlConsoleTable, len(decoded.Tables))
	for _, table := range decoded.Tables {
		byName[table.Name] = table
	}

	snapshots, ok := byName["snapshots"]
	if !ok {
		t.Fatal("snapshots table missing from schema")
	}
	if snapshots.RowCount != 2 {
		t.Fatalf("snapshots row count = %d, want 2", snapshots.RowCount)
	}
	if len(snapshots.Columns) != 4 {
		t.Fatalf("snapshots column count = %d, want 4", len(snapshots.Columns))
	}
	if snapshots.ReadOnly {
		t.Fatal("snapshots must be writable")
	}
	if !byName["schema_migrations"].ReadOnly {
		t.Fatal("schema_migrations must be reported as read-only")
	}
}

func TestStatementIsWrite(t *testing.T) {
	tests := []struct {
		sql  string
		want bool
	}{
		{`SELECT * FROM snapshots`, false},
		{`  select 1`, false},
		{`WITH x AS (SELECT 1) SELECT * FROM x`, false},
		{`INSERT INTO snapshots (month) VALUES ('2026-01')`, true},
		{`update snapshots set data = '{}'`, true},
		{`DELETE FROM snapshots`, true},
		{`REPLACE INTO snapshots (id) VALUES (1)`, true},
		{`WITH stale AS (SELECT id FROM snapshots) DELETE FROM snapshots WHERE id IN (SELECT id FROM stale)`, true},
		// the word "delete" here is data, not a statement
		{`WITH x AS (SELECT 'delete' AS word) SELECT * FROM x`, false},
	}

	for _, tt := range tests {
		if got := statementIsWrite(tt.sql); got != tt.want {
			t.Errorf("statementIsWrite(%q) = %v, want %v", tt.sql, got, tt.want)
		}
	}
}

func TestLeadingSQLKeyword(t *testing.T) {
	tests := []struct {
		sql  string
		want string
	}{
		{`SELECT 1`, "select"},
		{"  \n  select 1", "select"},
		{`-- a comment
			DROP TABLE x`, "drop"},
		{`/* block */ CREATE TABLE x (y)`, "create"},
		{`INSERT INTO t VALUES (1)`, "insert"},
		{`(SELECT 1)`, ""},
		{``, ""},
	}

	for _, tt := range tests {
		if got := leadingSQLKeyword(tt.sql); got != tt.want {
			t.Errorf("leadingSQLKeyword(%q) = %q, want %q", tt.sql, got, tt.want)
		}
	}
}
