package main

import (
	"crypto/sha256"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newBackupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`
		CREATE TABLE snapshots (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			month TEXT UNIQUE NOT NULL,
			data TEXT NOT NULL,
			duration_seconds INTEGER DEFAULT 0
		);
		CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		INSERT INTO snapshots (month, data, duration_seconds) VALUES ('2026-01', '{"value":1}', 10);
		INSERT INTO settings (key, value) VALUES ('master_data', '{}');
	`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func backupFileCount(t *testing.T, dir string) int {
	t.Helper()
	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, file := range files {
		if !file.IsDir() && strings.HasPrefix(file.Name(), backupPrefix) {
			count++
		}
	}
	return count
}

func TestRunBackupJobSkipsUnchangedDatabase(t *testing.T) {
	db := newBackupTestDB(t)
	targetDir := t.TempDir()
	cfg := &Config{Backup: BackupConfig{
		Enabled:       true,
		OnlyIfChanged: true,
		Targets:       []BackupTarget{{Name: "test", Path: targetDir, Retention: 10}},
	}}

	first := RunBackupJob(cfg, db)
	if first.Status != backupStatusSuccess {
		t.Fatalf("first backup status = %q, want %q: %+v", first.Status, backupStatusSuccess, first)
	}
	if got := backupFileCount(t, targetDir); got != 1 {
		t.Fatalf("backup count after first run = %d, want 1", got)
	}
	files, err := os.ReadDir(targetDir)
	if err != nil {
		t.Fatal(err)
	}
	if got := fingerprintFromBackupName(files[0].Name()); len(got) != backupHashLength {
		t.Fatalf("stored fingerprint length = %d, want %d", len(got), backupHashLength)
	}

	second := RunBackupJob(cfg, db)
	if second.Status != backupStatusSkipped {
		t.Fatalf("second backup status = %q, want %q: %+v", second.Status, backupStatusSkipped, second)
	}
	if second.Targets[0].Status != "current" {
		t.Fatalf("second target status = %q, want current", second.Targets[0].Status)
	}
	if got := backupFileCount(t, targetDir); got != 1 {
		t.Fatalf("backup count after unchanged run = %d, want 1", got)
	}

	if _, err := db.Exec("UPDATE snapshots SET data = ? WHERE month = ?", `{"value":2}`, "2026-01"); err != nil {
		t.Fatal(err)
	}
	third := RunBackupJob(cfg, db)
	if third.Status != backupStatusSuccess {
		t.Fatalf("changed backup status = %q, want %q: %+v", third.Status, backupStatusSuccess, third)
	}
	if got := backupFileCount(t, targetDir); got != 2 {
		t.Fatalf("backup count after data change = %d, want 2", got)
	}
}

func TestRunBackupJobRecognizesLegacyFullFingerprint(t *testing.T) {
	db := newBackupTestDB(t)
	targetDir := t.TempDir()
	fingerprint, err := databaseFingerprint(db)
	if err != nil {
		t.Fatal(err)
	}
	legacyName := "finn_backup_2026_07_10_120000_" + fingerprint + ".db"
	if err := os.WriteFile(filepath.Join(targetDir, legacyName), []byte("legacy test marker"), 0600); err != nil {
		t.Fatal(err)
	}
	cfg := &Config{Backup: BackupConfig{
		Enabled:       true,
		OnlyIfChanged: true,
		Targets:       []BackupTarget{{Name: "test", Path: targetDir, Retention: 10}},
	}}

	report := RunBackupJob(cfg, db)
	if report.Status != backupStatusSkipped {
		t.Fatalf("backup status = %q, want %q: %+v", report.Status, backupStatusSkipped, report)
	}
	if got := backupFileCount(t, targetDir); got != 1 {
		t.Fatalf("backup count = %d, want legacy file to be reused", got)
	}
}

func TestRunBackupJobAlwaysCreatesWhenChangeCheckDisabled(t *testing.T) {
	db := newBackupTestDB(t)
	targetDir := t.TempDir()
	cfg := &Config{Backup: BackupConfig{
		Enabled:       true,
		OnlyIfChanged: false,
		Targets:       []BackupTarget{{Name: "test", Path: targetDir, Retention: 10}},
	}}

	first := RunBackupJob(cfg, db)
	second := RunBackupJob(cfg, db)
	if first.Status != backupStatusSuccess || second.Status != backupStatusSuccess {
		t.Fatalf("always-create statuses = %q, %q; want success, success", first.Status, second.Status)
	}
	if got := backupFileCount(t, targetDir); got != 2 {
		t.Fatalf("backup count = %d, want 2 unchanged backups", got)
	}
}

func TestRunBackupJobReportsPartialTargetFailure(t *testing.T) {
	db := newBackupTestDB(t)
	goodTarget := t.TempDir()
	blockedTarget := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(blockedTarget, []byte("block directory creation"), 0600); err != nil {
		t.Fatal(err)
	}
	cfg := &Config{Backup: BackupConfig{
		Enabled: true,
		Targets: []BackupTarget{
			{Name: "good", Path: goodTarget, Retention: 10},
			{Name: "blocked", Path: blockedTarget, Retention: 10},
		},
	}}

	report := RunBackupJob(cfg, db)
	if report.Status != backupStatusPartial {
		t.Fatalf("backup status = %q, want %q: %+v", report.Status, backupStatusPartial, report)
	}
	if report.Targets[0].Status != "created" || report.Targets[1].Status != "failed" {
		t.Fatalf("unexpected target results: %+v", report.Targets)
	}
}

func TestFingerprintFromBackupName(t *testing.T) {
	shortFingerprint := strings.Repeat("a", backupHashLength)
	shortName := "finn_backup_2026_07_10_120000_" + shortFingerprint + ".enc"
	if got := fingerprintFromBackupName(shortName); got != shortFingerprint {
		t.Fatalf("fingerprintFromBackupName(short) = %q, want %q", got, shortFingerprint)
	}

	fullFingerprint := strings.Repeat("b", sha256.Size*2)
	fullName := "finn_backup_2026_07_10_120000_" + fullFingerprint + ".enc"
	if got := fingerprintFromBackupName(fullName); got != fullFingerprint {
		t.Fatalf("fingerprintFromBackupName(full) = %q, want %q", got, fullFingerprint)
	}
	if got := fingerprintFromBackupName("finn_backup_2026_07_10_120000.enc"); got != "" {
		t.Fatalf("legacy backup fingerprint = %q, want empty", got)
	}
}
