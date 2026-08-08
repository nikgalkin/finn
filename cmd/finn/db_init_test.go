package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInitDBOpensAFileDatabaseInWALMode(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	cfg := &Config{Database: DBConfig{Filename: "finn_test.db"}}
	db := initDB(cfg, false)
	t.Cleanup(func() { db.Close() })

	var journalMode string
	if err := db.QueryRow("PRAGMA journal_mode").Scan(&journalMode); err != nil {
		t.Fatal(err)
	}
	if !strings.EqualFold(journalMode, "wal") {
		t.Fatalf("journal_mode = %q, want wal", journalMode)
	}

	var busyTimeout int
	if err := db.QueryRow("PRAGMA busy_timeout").Scan(&busyTimeout); err != nil {
		t.Fatal(err)
	}
	if busyTimeout != 5000 {
		t.Fatalf("busy_timeout = %d, want 5000", busyTimeout)
	}

	dbPath := filepath.Join(home, ".finn", "finn_test.db")
	if _, err := os.Stat(dbPath); err != nil {
		t.Fatalf("database file missing at %s: %v", dbPath, err)
	}

	var migrationCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&migrationCount); err != nil {
		t.Fatal(err)
	}
	if migrationCount == 0 {
		t.Fatal("no migrations recorded on a fresh database")
	}
}

func TestInitDBKeepsWrittenRowsAcrossReopen(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	cfg := &Config{Database: DBConfig{Filename: "finn_test.db"}}

	db := initDB(cfg, false)
	if _, err := db.Exec(
		"INSERT INTO snapshots (month, data, duration_seconds) VALUES ('2026-01', '{\"organizations\":[]}', 42)",
	); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	reopened := initDB(cfg, false)
	t.Cleanup(func() { reopened.Close() })

	var data string
	var duration int
	if err := reopened.QueryRow("SELECT data, duration_seconds FROM snapshots WHERE month = '2026-01'").Scan(&data, &duration); err != nil {
		t.Fatalf("row written in WAL mode did not survive reopen: %v", err)
	}
	if duration != 42 {
		t.Fatalf("duration_seconds = %d, want 42", duration)
	}
}

func TestInitDBSeedsTheDemoWorkspaceOnce(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	cfg := &Config{Database: DBConfig{Filename: "finn_test.db", DemoFilename: "finn_demo_test.db"}}

	db := initDB(cfg, true)
	var seeded int
	if err := db.QueryRow("SELECT COUNT(*) FROM snapshots").Scan(&seeded); err != nil {
		t.Fatal(err)
	}
	if seeded == 0 {
		t.Fatal("demo workspace has no snapshots after seeding")
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	reopened := initDB(cfg, true)
	t.Cleanup(func() { reopened.Close() })

	var afterReopen int
	if err := reopened.QueryRow("SELECT COUNT(*) FROM snapshots").Scan(&afterReopen); err != nil {
		t.Fatal(err)
	}
	if afterReopen != seeded {
		t.Fatalf("snapshot count = %d after reopen, want %d", afterReopen, seeded)
	}
}
