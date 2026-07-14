package main

import (
	"database/sql"
	"encoding/json"
	"testing"

	appassets "finn"
)

func TestSQLMigrationsBootstrapDemoData(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })

	_, err = db.Exec(`
		CREATE TABLE snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT UNIQUE NOT NULL, data TEXT NOT NULL, duration_seconds INTEGER DEFAULT 0);
		CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
	`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(appassets.DemoSQL); err != nil {
		t.Fatal(err)
	}

	applied, err := runMigrations(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(applied) != 3 {
		t.Fatalf("applied migrations = %+v, want all three migrations", applied)
	}

	var snapshotCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM snapshots").Scan(&snapshotCount); err != nil {
		t.Fatal(err)
	}
	if snapshotCount != 10 {
		t.Fatalf("snapshot count = %d, want 10", snapshotCount)
	}
}

func TestSQLMigrationsBackfillCountriesOnce(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })

	_, err = db.Exec(`
		CREATE TABLE snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT UNIQUE NOT NULL, data TEXT NOT NULL, duration_seconds INTEGER DEFAULT 0);
		CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
		INSERT INTO settings (key, value) VALUES ('master_data', '{"organizations":[{"name":"Bank","country":"RUS"},{"name":"Broker","country":"USA","archivedAt":"2026-07-01T00:00:00Z"}]}');
		INSERT INTO snapshots (month, data) VALUES ('2026-01', '{"comment":"keep me","rates":{"RUB":1},"organizations":[{"id":"bank-id","name":"Bank","balances":[]},{"id":"broker-id","name":"Broker","country":"GBR","balances":[]},{"id":"unknown-id","name":"Unknown","balances":[]}]}');
	`)
	if err != nil {
		t.Fatal(err)
	}

	applied, err := runMigrations(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(applied) != 3 || applied[0].version != 1 || applied[1].version != 2 || applied[2].version != 3 {
		t.Fatalf("applied migrations = %+v, want versions 1, 2, and 3", applied)
	}

	var snapshotJSON string
	if err := db.QueryRow("SELECT data FROM snapshots WHERE month = '2026-01'").Scan(&snapshotJSON); err != nil {
		t.Fatal(err)
	}
	var snapshot aiSnapshotData
	if err := json.Unmarshal([]byte(snapshotJSON), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Comment != "keep me" {
		t.Fatalf("comment = %q, want preserved value", snapshot.Comment)
	}
	if got := snapshot.Organizations[0].Country; got != "RUS" {
		t.Fatalf("backfilled country = %q, want RUS", got)
	}
	if got := snapshot.Organizations[1].Country; got != "GBR" {
		t.Fatalf("existing country = %q, want GBR", got)
	}
	if got := snapshot.Organizations[2].Country; got != "" {
		t.Fatalf("unknown country = %q, want empty", got)
	}

	var flowTableCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'flow_entries'").Scan(&flowTableCount); err != nil {
		t.Fatal(err)
	}
	if flowTableCount != 1 {
		t.Fatalf("flow_entries table count = %d, want 1", flowTableCount)
	}
	var taxColumnCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('flow_entries') WHERE name = 'tax_rate'").Scan(&taxColumnCount); err != nil {
		t.Fatal(err)
	}
	if taxColumnCount != 1 {
		t.Fatalf("tax_rate column count = %d, want 1", taxColumnCount)
	}

	applied, err = runMigrations(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(applied) != 0 {
		t.Fatalf("second pass applied migrations = %+v, want none", applied)
	}

	var recorded int
	if err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = 1").Scan(&recorded); err != nil {
		t.Fatal(err)
	}
	if recorded != 1 {
		t.Fatalf("recorded migrations = %d, want 1", recorded)
	}
}
