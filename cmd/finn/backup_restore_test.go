package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func backupFileIn(t *testing.T, dir string) string {
	t.Helper()

	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 {
		t.Fatalf("target holds %d files, want 1", len(files))
	}
	return filepath.Join(dir, files[0].Name())
}

func TestRestoreBringsBackTheDatabaseCapturedByTheBackupJob(t *testing.T) {
	for _, tt := range []struct {
		name      string
		cipherKey string
		extension string
	}{
		{name: "encrypted", cipherKey: "correct horse battery staple", extension: "." + extEncrypted},
		{name: "plain", cipherKey: "", extension: "." + extRaw},
	} {
		t.Run(tt.name, func(t *testing.T) {
			home := t.TempDir()
			t.Setenv("HOME", home)
			t.Setenv("USERPROFILE", home)

			targetDir := t.TempDir()
			cfg := &Config{
				Database: DBConfig{Filename: "finn_test.db"},
				Backup: BackupConfig{
					Enabled:   true,
					CipherKey: tt.cipherKey,
					Targets:   []BackupTarget{{Name: "test", Path: targetDir, Retention: 10}},
				},
			}

			db := initDB(cfg, false)
			if _, err := db.Exec(
				"INSERT INTO snapshots (month, data, duration_seconds) VALUES ('2026-01', '{\"kept\":true}', 7)",
			); err != nil {
				t.Fatal(err)
			}

			if report := RunBackupJob(cfg, db); report.Status != backupStatusSuccess {
				t.Fatalf("backup status = %q, want success: %+v", report.Status, report)
			}

			backupPath := backupFileIn(t, targetDir)
			if filepath.Ext(backupPath) != tt.extension {
				t.Fatalf("backup extension = %q, want %q", filepath.Ext(backupPath), tt.extension)
			}

			if _, err := db.Exec("DELETE FROM snapshots WHERE month = '2026-01'"); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(
				"INSERT INTO snapshots (month, data, duration_seconds) VALUES ('2026-02', '{\"lost\":true}', 9)",
			); err != nil {
				t.Fatal(err)
			}
			if err := db.Close(); err != nil {
				t.Fatal(err)
			}

			RunRestoreJob(cfg, backupPath)

			restored := initDB(cfg, false)
			t.Cleanup(func() { restored.Close() })

			var data string
			var duration int
			if err := restored.QueryRow(
				"SELECT data, duration_seconds FROM snapshots WHERE month = '2026-01'",
			).Scan(&data, &duration); err != nil {
				t.Fatalf("row captured by the backup is missing after restore: %v", err)
			}
			if duration != 7 || !strings.Contains(data, "kept") {
				t.Fatalf("restored row = %q / %d, want the backed up values", data, duration)
			}

			var afterBackupRows int
			if err := restored.QueryRow(
				"SELECT COUNT(*) FROM snapshots WHERE month = '2026-02'",
			).Scan(&afterBackupRows); err != nil {
				t.Fatal(err)
			}
			if afterBackupRows != 0 {
				t.Fatal("a row written after the backup survived the restore")
			}
		})
	}
}

func TestRestoreKeepsAnEmergencyCopyOfTheReplacedDatabase(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)

	targetDir := t.TempDir()
	cfg := &Config{
		Database: DBConfig{Filename: "finn_test.db"},
		Backup: BackupConfig{
			Enabled: true,
			Targets: []BackupTarget{{Name: "test", Path: targetDir, Retention: 10}},
		},
	}

	db := initDB(cfg, false)
	if _, err := db.Exec(
		"INSERT INTO snapshots (month, data, duration_seconds) VALUES ('2026-01', '{\"kept\":true}', 7)",
	); err != nil {
		t.Fatal(err)
	}
	if report := RunBackupJob(cfg, db); report.Status != backupStatusSuccess {
		t.Fatalf("backup status = %q, want success: %+v", report.Status, report)
	}
	if _, err := db.Exec(
		"INSERT INTO snapshots (month, data, duration_seconds) VALUES ('2026-03', '{\"replaced\":true}', 3)",
	); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	RunRestoreJob(cfg, backupFileIn(t, targetDir))

	entries, err := os.ReadDir(filepath.Join(home, ".finn"))
	if err != nil {
		t.Fatal(err)
	}
	var safetyCopies []string
	for _, entry := range entries {
		if strings.Contains(entry.Name(), ".bak_") {
			safetyCopies = append(safetyCopies, entry.Name())
		}
	}
	if len(safetyCopies) != 1 {
		t.Fatalf("emergency copies = %v, want exactly one", safetyCopies)
	}

	replaced, err := os.ReadFile(filepath.Join(home, ".finn", safetyCopies[0]))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(replaced), "SQLite format 3") {
		t.Fatal("emergency copy is not a SQLite database")
	}
}
