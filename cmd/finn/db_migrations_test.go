package main

import (
	"database/sql"
	"encoding/json"
	"math"
	"testing"
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
	applied, err := runMigrations(db)
	if err != nil {
		t.Fatal(err)
	}
	if len(applied) != 4 {
		t.Fatalf("applied migrations = %+v, want all four migrations", applied)
	}
	if err := seedDemo(db); err != nil {
		t.Fatal(err)
	}

	var snapshotCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM snapshots").Scan(&snapshotCount); err != nil {
		t.Fatal(err)
	}
	if snapshotCount != 10 {
		t.Fatalf("snapshot count = %d, want 10", snapshotCount)
	}

	var flowCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries").Scan(&flowCount); err != nil {
		t.Fatal(err)
	}
	if flowCount != 29 {
		t.Fatalf("flow entry count = %d, want 29", flowCount)
	}

	var salaryCount, rentCount, transferCount, carCount, bonusCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries WHERE entry_type = 'external' AND direction = 'in' AND currency = 'USD' AND amount = 3000 AND category = 'salary'").Scan(&salaryCount); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries WHERE entry_type = 'external' AND direction = 'out' AND currency = 'RUB' AND amount = 90000 AND category = 'rent'").Scan(&rentCount); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries WHERE entry_type = 'transfer' AND currency = 'USD' AND to_currency = 'RUB'").Scan(&transferCount); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries WHERE month = '2026-03' AND direction = 'out' AND currency = 'RUB' AND amount = 600000 AND category = 'car'").Scan(&carCount); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM flow_entries WHERE month = '2026-05' AND direction = 'in' AND currency = 'USD' AND amount = 5000 AND category = 'bonus'").Scan(&bonusCount); err != nil {
		t.Fatal(err)
	}
	if salaryCount != 9 || rentCount != 9 || transferCount != 9 {
		t.Fatalf("recurring demo rows = salary:%d rent:%d transfers:%d, want 9 each", salaryCount, rentCount, transferCount)
	}
	if carCount != 1 || bonusCount != 1 {
		t.Fatalf("demo events = car:%d bonus:%d, want 1 each", carCount, bonusCount)
	}

	rows, err := db.Query("SELECT data FROM snapshots ORDER BY month")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var previousDeposit float64
	for snapshotIndex := 0; rows.Next(); snapshotIndex++ {
		var snapshotJSON string
		if err := rows.Scan(&snapshotJSON); err != nil {
			t.Fatal(err)
		}
		var snapshot aiSnapshotData
		if err := json.Unmarshal([]byte(snapshotJSON), &snapshot); err != nil {
			t.Fatal(err)
		}
		var deposit float64
		for _, organization := range snapshot.Organizations {
			if organization.Name != "Alfabank" || len(organization.Balances) == 0 {
				continue
			}
			deposit = numberValue(organization.Balances[0].Amount)
		}
		if deposit == 0 {
			t.Fatalf("snapshot %d has no Alfabank deposit", snapshotIndex)
		}
		if snapshotIndex > 0 {
			monthlyReturn := deposit/previousDeposit - 1
			const expectedMonthlyReturn = 0.10 / 12
			if math.Abs(monthlyReturn-expectedMonthlyReturn) > 0.0000001 {
				t.Fatalf("snapshot %d deposit return = %.8f, want 10%% annual rate accrued monthly", snapshotIndex, monthlyReturn)
			}
		}
		previousDeposit = deposit
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
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
	if len(applied) != 4 || applied[0].version != 1 || applied[1].version != 2 || applied[2].version != 3 || applied[3].version != 4 {
		t.Fatalf("applied migrations = %+v, want versions 1, 2, 3, and 4", applied)
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
	var entryTypeColumnCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('flow_entries') WHERE name = 'entry_type'").Scan(&entryTypeColumnCount); err != nil {
		t.Fatal(err)
	}
	if entryTypeColumnCount != 1 {
		t.Fatalf("entry_type column count = %d, want 1", entryTypeColumnCount)
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
