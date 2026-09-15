package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	yaml "go.yaml.in/yaml/v3"
)

// The plugin registry lives in config.yml and nowhere else. /api/settings writes
// JSON into the database and answers any loopback caller, so a registry kept
// there would turn an XSS in the SPA — or any local process — into arbitrary
// code execution. A file a person edits in a text editor breaks that chain.

const (
	defaultDatasourceTimeoutSeconds = 30
	maxDatasourceTimeoutSeconds     = 300
	maxDatasourcePlugins            = 32
)

var datasourceNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,39}$`)

var sha256Pattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

type DatasourcesConfig struct {
	Enabled bool               `yaml:"enabled"`
	Plugins []DatasourcePlugin `yaml:"plugins"`
}

type DatasourcePlugin struct {
	Name           string            `yaml:"name"`
	Path           string            `yaml:"path"`
	SHA256         string            `yaml:"sha256"`
	TimeoutSeconds int               `yaml:"timeout_seconds"`
	Disabled       bool              `yaml:"disabled"`
	Env            map[string]string `yaml:"env"`
	Config         map[string]any    `yaml:"config"`

	// ConfigError holds what is wrong with this entry. A broken entry is kept
	// rather than dropped so the UI can say which plugin is misconfigured and
	// why, instead of silently showing one source fewer than the file lists.
	ConfigError string `yaml:"-"`
}

// loadDatasourcesFromFile reads this one section straight from the config file
// instead of through viper.
//
// Viper lowercases every key it stores, which would rename FINN_DS_TELEGRAM_TOKEN
// to finn_ds_telegram_token and quietly hand the plugin an environment variable
// that does not exist. The same applies to whatever keys a plugin expects under
// config:, which Finn forwards verbatim and must not rewrite.
func loadDatasourcesFromFile(path string) (DatasourcesConfig, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return DatasourcesConfig{}, err
	}
	var file struct {
		Datasources DatasourcesConfig `yaml:"datasources"`
	}
	if err := yaml.Unmarshal(contents, &file); err != nil {
		return DatasourcesConfig{}, err
	}
	return file.Datasources, nil
}

// Timeout is the wall clock a run gets before its process group is killed.
func (plugin DatasourcePlugin) Timeout() int {
	if plugin.TimeoutSeconds <= 0 {
		return defaultDatasourceTimeoutSeconds
	}
	if plugin.TimeoutSeconds > maxDatasourceTimeoutSeconds {
		return maxDatasourceTimeoutSeconds
	}
	return plugin.TimeoutSeconds
}

// Pinned reports whether the entry fixes the binary by hash. An unpinned plugin
// still runs, but the UI says so: without a hash, replacing the file behind the
// path is enough to change what Finn executes.
func (plugin DatasourcePlugin) Pinned() bool {
	return plugin.SHA256 != ""
}

// Plugin finds a configured entry by name.
func (config DatasourcesConfig) Plugin(name string) (DatasourcePlugin, bool) {
	for _, plugin := range config.Plugins {
		if plugin.Name == name {
			return plugin, true
		}
	}
	return DatasourcePlugin{}, false
}

// normalizeDatasourcesConfig expands paths and records what each entry got
// wrong. Validation never aborts startup: a typo in one plugin must not stop
// Finn from opening.
func normalizeDatasourcesConfig(config *DatasourcesConfig) {
	if len(config.Plugins) > maxDatasourcePlugins {
		log.Printf("⚠️  Datasources: config lists %d plugins, only the first %d are used.\n", len(config.Plugins), maxDatasourcePlugins)
		config.Plugins = config.Plugins[:maxDatasourcePlugins]
	}

	seenNames := make(map[string]struct{}, len(config.Plugins))
	for index := range config.Plugins {
		plugin := &config.Plugins[index]
		plugin.Name = strings.ToLower(strings.TrimSpace(plugin.Name))
		plugin.SHA256 = strings.ToLower(strings.TrimSpace(plugin.SHA256))
		plugin.Path = expandDatasourcePath(plugin.Path)

		plugin.ConfigError = validateDatasourcePlugin(*plugin, seenNames)
		if plugin.Name != "" {
			seenNames[plugin.Name] = struct{}{}
		}
		if plugin.ConfigError != "" {
			log.Printf("⚠️  Datasources: plugin %q is ignored: %s\n", plugin.Name, plugin.ConfigError)
		}
	}
}

func validateDatasourcePlugin(plugin DatasourcePlugin, seenNames map[string]struct{}) string {
	if plugin.Name == "" {
		return "name is required"
	}
	if !datasourceNamePattern.MatchString(plugin.Name) {
		return "name must be lowercase letters, digits, dash or underscore"
	}
	if _, duplicate := seenNames[plugin.Name]; duplicate {
		return "another plugin already uses this name"
	}
	if plugin.Path == "" {
		return "path is required"
	}
	// A relative path resolves against whatever directory Finn happens to have
	// been started from, so what runs would depend on the shell rather than on
	// the config. PATH lookup is refused for the same reason.
	if !filepath.IsAbs(plugin.Path) {
		return "path must be absolute, a bare command name is never looked up in PATH"
	}
	if strings.ContainsAny(plugin.Path, "\x00") {
		return "path contains a null byte"
	}
	if plugin.SHA256 != "" && !sha256Pattern.MatchString(plugin.SHA256) {
		return "sha256 must be 64 hexadecimal characters, run 'finn ds hash <path>' to get it"
	}
	for key := range plugin.Env {
		if strings.TrimSpace(key) == "" || strings.ContainsAny(key, "=\x00") {
			return fmt.Sprintf("env key %q is not a valid variable name", key)
		}
	}
	return ""
}

// expandDatasourcePath resolves $VARS and a leading ~ so the same config file
// works across machines. It deliberately does not consult PATH.
func expandDatasourcePath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	path = os.ExpandEnv(path)
	if path == "~" || strings.HasPrefix(path, "~/") {
		if homeDir, err := os.UserHomeDir(); err == nil {
			path = filepath.Join(homeDir, strings.TrimPrefix(path, "~"))
		}
	}
	return filepath.Clean(path)
}
