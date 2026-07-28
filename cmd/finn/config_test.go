package main

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTestConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "custom.yml")
	if err := os.WriteFile(path, []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadConfigReadsAnExplicitPath(t *testing.T) {
	path := writeTestConfig(t, `
app:
  port: 9123
  open_browser: false
database:
  filename: custom.db
backup:
  enabled: true
  cipher_key: "from the explicit file"
  targets:
    - name: local
      path: /tmp/finn-test-backups
`)

	cfg := LoadConfig(path)

	if cfg.App.Port != 9123 {
		t.Fatalf("port = %d, want 9123", cfg.App.Port)
	}
	if cfg.App.OpenBrowser {
		t.Fatal("open_browser = true, want false")
	}
	if cfg.Database.Filename != "custom.db" {
		t.Fatalf("database filename = %q, want custom.db", cfg.Database.Filename)
	}
	if cfg.Backup.CipherKey != "from the explicit file" {
		t.Fatalf("cipher key = %q, want the value from the explicit file", cfg.Backup.CipherKey)
	}
	if len(cfg.Backup.Targets) != 1 || cfg.Backup.Targets[0].Retention != 10 {
		t.Fatalf("targets = %+v, want one target with the default retention", cfg.Backup.Targets)
	}
}

func TestLoadConfigAppliesDefaultsToAnExplicitPath(t *testing.T) {
	cfg := LoadConfig(writeTestConfig(t, "app:\n  port: 9124\n"))

	if cfg.App.Port != 9124 {
		t.Fatalf("port = %d, want 9124", cfg.App.Port)
	}
	if !cfg.App.OpenBrowser {
		t.Fatal("open_browser = false, want the default true")
	}
	if cfg.Database.Filename != "finn.db" {
		t.Fatalf("database filename = %q, want the default finn.db", cfg.Database.Filename)
	}
	if cfg.Backup.IntervalHours != 12 {
		t.Fatalf("interval hours = %d, want the default 12", cfg.Backup.IntervalHours)
	}
	if cfg.Backup.Enabled {
		t.Fatal("backup enabled = true, want the default false")
	}
}

func TestLoadConfigExpandsHomeInTargetPaths(t *testing.T) {
	t.Setenv("HOME", "/tmp/finn-home")
	cfg := LoadConfig(writeTestConfig(t, `
backup:
  targets:
    - name: local
      path: $HOME/backups
      retention: 3
`))

	if len(cfg.Backup.Targets) != 1 {
		t.Fatalf("targets = %+v, want one", cfg.Backup.Targets)
	}
	if cfg.Backup.Targets[0].Path != "/tmp/finn-home/backups" {
		t.Fatalf("target path = %q, want the expanded home path", cfg.Backup.Targets[0].Path)
	}
	if cfg.Backup.Targets[0].Retention != 3 {
		t.Fatalf("retention = %d, want the configured 3", cfg.Backup.Targets[0].Retention)
	}
}

func TestLoadConfigReadsTheCipherKeyFromTheEnvironment(t *testing.T) {
	t.Setenv("FINN_BACKUP_CIPHER_KEY", "key from the environment")

	cfg := LoadConfig(writeTestConfig(t, "backup:\n  enabled: true\n"))

	if cfg.Backup.CipherKey != "key from the environment" {
		t.Fatalf("cipher key = %q, want the value from FINN_BACKUP_CIPHER_KEY", cfg.Backup.CipherKey)
	}
}

func TestLoadConfigLetsTheEnvironmentOverrideTheConfiguredCipherKey(t *testing.T) {
	t.Setenv("FINN_BACKUP_CIPHER_KEY", "key from the environment")

	cfg := LoadConfig(writeTestConfig(t, "backup:\n  enabled: true\n  cipher_key: \"key from the file\"\n"))

	if cfg.Backup.CipherKey != "key from the environment" {
		t.Fatalf("cipher key = %q, want the environment to win", cfg.Backup.CipherKey)
	}
}

func TestLoadConfigReadsTheCipherKeyFromTheEnvironmentWithoutAnyConfigFile(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("FINN_BACKUP_CIPHER_KEY", "key from the environment")

	cfg := LoadConfig("")

	if cfg.Backup.CipherKey != "key from the environment" {
		t.Fatalf("cipher key = %q, want the value from FINN_BACKUP_CIPHER_KEY", cfg.Backup.CipherKey)
	}
}

func TestLoadConfigPrefersTheExplicitPathOverTheEnvironmentHome(t *testing.T) {
	home := t.TempDir()
	if err := os.MkdirAll(filepath.Join(home, ".finn"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, ".finn", "config.yml"), []byte("app:\n  port: 7000\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)

	cfg := LoadConfig(writeTestConfig(t, "app:\n  port: 9125\n"))

	if cfg.App.Port != 9125 {
		t.Fatalf("port = %d, want the explicit file to win over ~/.finn/config.yml", cfg.App.Port)
	}
}
