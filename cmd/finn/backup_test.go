package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestGenerateBackupCipherKey(t *testing.T) {
	key, err := generateBackupCipherKey()
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		t.Fatalf("generated key is not valid base64: %v", err)
	}
	if len(decoded) != 32 {
		t.Fatalf("generated key contains %d bytes, want 32", len(decoded))
	}
}

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
		CREATE TABLE flow_entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			month TEXT NOT NULL,
			entry_type TEXT NOT NULL DEFAULT 'external',
			direction TEXT NOT NULL,
			counterparty TEXT NOT NULL,
			account TEXT NOT NULL DEFAULT '',
			currency TEXT NOT NULL,
			amount REAL NOT NULL,
			tax_rate REAL NOT NULL DEFAULT 0,
			category TEXT NOT NULL DEFAULT '',
			comment TEXT NOT NULL DEFAULT '',
			to_account TEXT NOT NULL DEFAULT '',
			to_currency TEXT NOT NULL DEFAULT '',
			to_amount REAL NOT NULL DEFAULT 0
		);
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

func TestRunBackupJobDetectsFlowOnlyChanges(t *testing.T) {
	db := newBackupTestDB(t)
	targetDir := t.TempDir()
	cfg := &Config{Backup: BackupConfig{
		Enabled:       true,
		OnlyIfChanged: true,
		Targets:       []BackupTarget{{Name: "test", Path: targetDir, Retention: 10}},
	}}

	if report := RunBackupJob(cfg, db); report.Status != backupStatusSuccess {
		t.Fatalf("initial backup status = %q, want success: %+v", report.Status, report)
	}
	if _, err := db.Exec(`
		INSERT INTO flow_entries (month, direction, counterparty, currency, amount, category, comment)
		VALUES ('2026-07', 'in', 'Acme', 'USD', 1000, 'Salary', '')
	`); err != nil {
		t.Fatal(err)
	}
	if report := RunBackupJob(cfg, db); report.Status != backupStatusSuccess {
		t.Fatalf("flow-only backup status = %q, want success: %+v", report.Status, report)
	}
	if got := backupFileCount(t, targetDir); got != 2 {
		t.Fatalf("backup count after flow-only change = %d, want 2", got)
	}
}

func TestRunBackupJobDetectsCashFlowTransferOnlyChanges(t *testing.T) {
	db := newBackupTestDB(t)
	targetDir := t.TempDir()
	cfg := &Config{Backup: BackupConfig{
		Enabled:       true,
		OnlyIfChanged: true,
		Targets:       []BackupTarget{{Name: "test", Path: targetDir, Retention: 10}},
	}}

	if report := RunBackupJob(cfg, db); report.Status != backupStatusSuccess {
		t.Fatalf("initial backup status = %q, want success: %+v", report.Status, report)
	}
	if _, err := db.Exec(`
		INSERT INTO flow_entries (month, entry_type, direction, counterparty, account, currency, amount, category, comment, to_account, to_currency, to_amount)
		VALUES ('2026-07', 'transfer', 'out', '', 'Alfa', 'RUB', 100000, '', 'P2P', 'Broker', 'USD', 1100)
	`); err != nil {
		t.Fatal(err)
	}
	if report := RunBackupJob(cfg, db); report.Status != backupStatusSuccess {
		t.Fatalf("transfer-only backup status = %q, want success: %+v", report.Status, report)
	}
	if got := backupFileCount(t, targetDir); got != 2 {
		t.Fatalf("backup count after transfer-only change = %d, want 2", got)
	}
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

func TestRunBackupJobCreatesBackupWithWarningInWriteOnlyTarget(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("directory permission bits are not enforced consistently on Windows")
	}

	db := newBackupTestDB(t)
	targetDir := filepath.Join(t.TempDir(), "write-only")
	if err := os.Mkdir(targetDir, 0300); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(targetDir, 0700) })
	if _, err := os.ReadDir(targetDir); err == nil {
		t.Skip("test environment can read a directory without read permission")
	}

	cfg := &Config{Backup: BackupConfig{
		Enabled: true,
		Targets: []BackupTarget{{Name: "write-only", Path: targetDir, Retention: 10}},
	}}
	report := RunBackupJob(cfg, db)

	if report.Status != backupStatusPartial {
		t.Fatalf("backup status = %q, want %q: %+v", report.Status, backupStatusPartial, report)
	}
	if report.Targets[0].Status != "created_with_warning" || !strings.Contains(report.Targets[0].Error, "old backups may not be cleaned up") {
		t.Fatalf("unexpected target result: %+v", report.Targets[0])
	}

	if err := os.Chmod(targetDir, 0700); err != nil {
		t.Fatal(err)
	}
	if got := backupFileCount(t, targetDir); got != 1 {
		t.Fatalf("backup count = %d, want 1 for a writable target", got)
	}
}

func TestRunBackupJobReportsOnlyWriteOnlyTargetWithWarning(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("directory permission bits are not enforced consistently on Windows")
	}

	db := newBackupTestDB(t)
	healthyTarget := t.TempDir()
	unreadableTarget := filepath.Join(t.TempDir(), "write-only")
	if err := os.Mkdir(unreadableTarget, 0300); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(unreadableTarget, 0700) })
	if _, err := os.ReadDir(unreadableTarget); err == nil {
		t.Skip("test environment can read a directory without read permission")
	}

	cfg := &Config{Backup: BackupConfig{
		Enabled: true,
		Targets: []BackupTarget{
			{Name: "healthy", Path: healthyTarget, Retention: 10},
			{Name: "write-only", Path: unreadableTarget, Retention: 10},
		},
	}}
	report := RunBackupJob(cfg, db)

	if report.Status != backupStatusPartial {
		t.Fatalf("backup status = %q, want %q: %+v", report.Status, backupStatusPartial, report)
	}
	if report.Targets[0].Status != "created" || report.Targets[1].Status != "created_with_warning" {
		t.Fatalf("unexpected target results: %+v", report.Targets)
	}
	if got := backupFileCount(t, healthyTarget); got != 1 {
		t.Fatalf("healthy backup count = %d, want 1", got)
	}
	if err := os.Chmod(unreadableTarget, 0700); err != nil {
		t.Fatal(err)
	}
	if got := backupFileCount(t, unreadableTarget); got != 1 {
		t.Fatalf("write-only backup count = %d, want 1", got)
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

func TestCompactBackupVersion(t *testing.T) {
	tests := map[string]string{
		"1.4.0":           "v140",
		"v1.4.0":          "v140",
		"V1.4.0":          "v140",
		"1.4.0+build/7":   "v140-build-7",
		" release 1.4.0 ": "vrelease-140",
		"":                "vdev",
	}
	for input, want := range tests {
		if got := compactBackupVersion(input); got != want {
			t.Errorf("compactBackupVersion(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestBackupFilenameIncludesVersion(t *testing.T) {
	originalVersion := version
	version = "v1.4.0+build/7"
	t.Cleanup(func() { version = originalVersion })
	fingerprint := strings.Repeat("a", sha256.Size*2)

	if got, want := backupFilename("2026_07_20_183000", fingerprint, extEncrypted, 1), "finn_backup_2026_07_20_183000_v140-build-7_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.enc"; got != want {
		t.Fatalf("backupFilename(first) = %q, want %q", got, want)
	}
	if got, want := backupFilename("2026_07_20_183000", fingerprint, extRaw, 2), "finn_backup_2026_07_20_183000_2_v140-build-7_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.db"; got != want {
		t.Fatalf("backupFilename(sequence) = %q, want %q", got, want)
	}
}
