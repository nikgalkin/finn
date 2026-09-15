package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalizeDatasourcesConfigRejectsUnsafeEntries(t *testing.T) {
	config := DatasourcesConfig{Enabled: true, Plugins: []DatasourcePlugin{
		{Name: "telegram", Path: "/opt/finn/finn-ds-telegram"},
		{Name: "telegram", Path: "/opt/finn/other"},
		{Name: "on PATH", Path: "/opt/finn/spaced"},
		{Name: "relative", Path: "finn-ds-telegram"},
		{Name: "badhash", Path: "/opt/finn/plugin", SHA256: "not-a-hash"},
		{Name: "", Path: "/opt/finn/anonymous"},
	}}
	normalizeDatasourcesConfig(&config)

	expectations := map[int]string{
		0: "",
		1: "another plugin already uses this name",
		2: "name must be lowercase",
		3: "path must be absolute",
		4: "sha256 must be 64",
		5: "name is required",
	}
	for index, want := range expectations {
		got := config.Plugins[index].ConfigError
		if want == "" && got != "" {
			t.Fatalf("plugin %d: unexpected error %q", index, got)
		}
		if want != "" && !strings.Contains(got, want) {
			t.Fatalf("plugin %d: error = %q, want it to mention %q", index, got, want)
		}
	}
}

func TestNormalizeDatasourcesConfigExpandsPaths(t *testing.T) {
	t.Setenv("FINN_TEST_PLUGIN_DIR", "/opt/plugins")
	config := DatasourcesConfig{Plugins: []DatasourcePlugin{
		{Name: "expanded", Path: "$FINN_TEST_PLUGIN_DIR/finn-ds-telegram"},
		{Name: "tilde", Path: "~/.finn/plugins/finn-ds-telegram"},
	}}
	normalizeDatasourcesConfig(&config)

	if config.Plugins[0].Path != "/opt/plugins/finn-ds-telegram" {
		t.Fatalf("path = %q, want the variable expanded", config.Plugins[0].Path)
	}
	if strings.HasPrefix(config.Plugins[1].Path, "~") || !filepath.IsAbs(config.Plugins[1].Path) {
		t.Fatalf("path = %q, want ~ resolved to an absolute path", config.Plugins[1].Path)
	}
	if config.Plugins[1].ConfigError != "" {
		t.Fatalf("unexpected error: %s", config.Plugins[1].ConfigError)
	}
}

func TestLoadDatasourcesFromFilePreservesKeyCase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yml")
	if err := os.WriteFile(path, []byte(`
datasources:
  enabled: true
  plugins:
    - name: telegram
      path: "/opt/finn/finn-ds-telegram"
      sha256: "`+strings.Repeat("9", 64)+`"
      env:
        FINN_DS_TELEGRAM_TOKEN: "123456:AA"
      config:
        allowedChatIds: [12345678]
`), 0o600); err != nil {
		t.Fatal(err)
	}

	config, err := loadDatasourcesFromFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !config.Enabled || len(config.Plugins) != 1 {
		t.Fatalf("config = %+v, want one enabled plugin", config)
	}

	plugin := config.Plugins[0]
	// An environment variable name is case-sensitive, and a plugin's own config
	// keys are its business: neither may be rewritten on the way through.
	if plugin.Env["FINN_DS_TELEGRAM_TOKEN"] != "123456:AA" {
		t.Fatalf("env = %+v, want the variable name untouched", plugin.Env)
	}
	if _, found := plugin.Config["allowedChatIds"]; !found {
		t.Fatalf("config = %+v, want the plugin's own key spelling", plugin.Config)
	}
	if plugin.SHA256 == "" {
		t.Fatal("sha256 must survive the round trip")
	}
}

func TestDatasourcePluginTimeoutAndPinning(t *testing.T) {
	if timeout := (DatasourcePlugin{}).Timeout(); timeout != defaultDatasourceTimeoutSeconds {
		t.Fatalf("timeout = %d, want the default %d", timeout, defaultDatasourceTimeoutSeconds)
	}
	if timeout := (DatasourcePlugin{TimeoutSeconds: 9000}).Timeout(); timeout != maxDatasourceTimeoutSeconds {
		t.Fatalf("timeout = %d, want it capped at %d", timeout, maxDatasourceTimeoutSeconds)
	}
	if (DatasourcePlugin{}).Pinned() {
		t.Fatal("a plugin without sha256 is unpinned")
	}
	if !(DatasourcePlugin{SHA256: strings.Repeat("a", 64)}).Pinned() {
		t.Fatal("a plugin with sha256 is pinned")
	}
}
