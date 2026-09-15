package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// The fake plugin is this very test binary re-executed with a script in its
// environment. Finn runs a plugin as `<binary> <command>` with a scrubbed
// environment, so the script has to arrive through the plugin's own env: block —
// which is also what makes this a real test of that scrubbing.
const (
	testPluginScriptEnv = "FINN_DS_TEST_PLUGIN"
	testPluginEchoEnv   = "FINN_DS_TEST_ECHO"
)

func TestMain(m *testing.M) {
	if script := os.Getenv(testPluginScriptEnv); script != "" {
		os.Exit(runTestPlugin(script, os.Args[1:]))
	}
	os.Exit(m.Run())
}

func runTestPlugin(script string, args []string) int {
	command := ""
	if len(args) > 0 {
		command = args[0]
	}
	request, _ := os.ReadFile("/dev/stdin")

	switch script {
	case "manifest-only":
		if command != "manifest" {
			fmt.Println(`{"protocol":1,"ok":false,"error":"only manifest is implemented"}`)
			return 1
		}
		fmt.Println(`{"protocol":1,"ok":true,"name":"fake","version":"1.0.0","kinds":["flow","raw"],"uses_cursor":true}`)
		return 0

	case "empty-manifest":
		if command == "manifest" {
			fmt.Println(`{"protocol":1,"ok":true,"name":"","version":"","kinds":[]}`)
			return 0
		}
		fmt.Println(`{"protocol":1,"ok":true,"items":[]}`)
		return 0

	case "two-items":
		if command == "manifest" {
			fmt.Println(`{"protocol":1,"ok":true,"name":"fake","version":"1.0.0","kinds":["flow","raw"],"uses_cursor":true}`)
			return 0
		}
		fmt.Println(`{"protocol":1,"ok":true,"cursor":"42","items":[
			{"external_id":"a","kind":"flow","occurred_at":"2026-08-11T09:41:00Z","raw":"-3500 Shop","draft":{"month":"2026-08","direction":"out","counterparty":"Shop","currency":"RUB","amount":3500,"category":"groceries"}},
			{"external_id":"b","kind":"raw","occurred_at":"2026-08-11T10:00:00Z","raw":"could not parse this"}
		]}`)
		return 0

	case "invalid-draft":
		if command == "manifest" {
			fmt.Println(`{"protocol":1,"ok":true,"name":"fake","version":"1.0.0","kinds":["flow"],"uses_cursor":false}`)
			return 0
		}
		fmt.Println(`{"protocol":1,"ok":true,"cursor":"1","items":[
			{"external_id":"broken","kind":"flow","raw":"-3500","draft":{"month":"not-a-month","direction":"out","counterparty":"Shop","currency":"RUB","amount":3500}}
		]}`)
		return 0

	case "duplicate-ids":
		if command == "manifest" {
			fmt.Println(`{"protocol":1,"ok":true,"name":"fake","version":"1.0.0","kinds":["raw"],"uses_cursor":false}`)
			return 0
		}
		fmt.Println(`{"protocol":1,"ok":true,"cursor":"9","items":[
			{"external_id":"same","kind":"raw","raw":"first"},
			{"external_id":"same","kind":"raw","raw":"second"}
		]}`)
		return 0

	case "bad-json":
		fmt.Println("this is not JSON at all")
		return 0

	case "foreign-protocol":
		fmt.Println(`{"protocol":7,"ok":true,"items":[]}`)
		return 0

	case "reports-error":
		if command == "manifest" {
			fmt.Println(`{"protocol":1,"ok":true,"name":"fake","version":"1.0.0","kinds":["flow","raw"],"uses_cursor":true}`)
			return 0
		}
		fmt.Println(`{"protocol":1,"ok":false,"error":"telegram api: 401 unauthorized"}`)
		fmt.Fprintln(os.Stderr, "GET /getUpdates -> 401")
		return 1

	case "silent-crash":
		fmt.Fprintln(os.Stderr, "panic: something went wrong")
		return 3

	case "hangs":
		time.Sleep(60 * time.Second)
		return 0

	case "floods-stdout":
		chunk := strings.Repeat("x", 64*1024)
		for {
			if _, err := fmt.Println(chunk); err != nil {
				return 1
			}
		}

	case "echo-environment":
		environment := map[string]string{}
		for _, entry := range os.Environ() {
			key, value, _ := strings.Cut(entry, "=")
			environment[key] = value
		}
		encoded, _ := json.Marshal(environment)
		fmt.Printf(`{"protocol":1,"ok":true,"cursor":"","items":[{"external_id":"env","kind":"raw","raw":%s}]}`+"\n", string(mustJSONString(string(encoded))))
		return 0

	case "echo-request":
		fmt.Printf(`{"protocol":1,"ok":true,"cursor":"","items":[{"external_id":"request","kind":"raw","raw":%s}]}`+"\n", string(mustJSONString(string(request))))
		return 0

	case "cursor-aware":
		if command == "manifest" {
			fmt.Println(`{"protocol":1,"ok":true,"name":"fake","version":"1.0.0","kinds":["raw"],"uses_cursor":true}`)
			return 0
		}
		if command != "fetch" {
			fmt.Printf(`{"protocol":1,"ok":false,"error":"unknown command %q"}`+"\n", command)
			return 2
		}
		var decoded struct {
			Cursor string `json:"cursor"`
		}
		_ = json.Unmarshal(request, &decoded)
		if decoded.Cursor == "" {
			fmt.Println(`{"protocol":1,"ok":true,"cursor":"1","items":[{"external_id":"first","kind":"raw","raw":"first"}]}`)
			return 0
		}
		fmt.Println(`{"protocol":1,"ok":true,"cursor":"2","items":[]}`)
		return 0

	case "replays-after-cursor":
		if command == "manifest" {
			fmt.Println(`{"protocol":1,"ok":true,"name":"fake","version":"1.0.0","kinds":["raw"],"uses_cursor":true}`)
			return 0
		}
		fmt.Println(`{"protocol":1,"ok":true,"cursor":"1","items":[{"external_id":"first","kind":"raw","raw":"first"}]}`)
		return 0

	case "unstable-manifest":
		if command == "manifest" {
			fmt.Printf(`{"protocol":1,"ok":true,"name":"fake","version":"%d","kinds":["raw"],"uses_cursor":false}`+"\n", time.Now().UnixNano())
			return 0
		}
		fmt.Println(`{"protocol":1,"ok":true,"cursor":"","items":[]}`)
		return 0

	case "exit-zero-on-anything":
		fmt.Println(`{"protocol":1,"ok":true,"name":"fake","version":"1.0.0","kinds":["raw"],"uses_cursor":false}`)
		return 0
	}

	fmt.Printf(`{"protocol":1,"ok":false,"error":"unknown script %q"}`+"\n", script)
	return 2
}

func mustJSONString(value string) []byte {
	encoded, _ := json.Marshal(value)
	return encoded
}

// testPlugin points a config entry at the test binary itself.
func testPlugin(t *testing.T, script string) DatasourcePlugin {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the fake plugin relies on unix process behaviour")
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("locate the test binary: %v", err)
	}
	return DatasourcePlugin{
		Name:           "fake",
		Path:           executable,
		TimeoutSeconds: 5,
		Env:            map[string]string{testPluginScriptEnv: script},
	}
}

func runScript(t *testing.T, script, command string) dsRunResult {
	t.Helper()
	return runDatasourcePlugin(context.Background(), testPlugin(t, script), dsRequest{Command: command, Source: "fake"})
}

func TestPluginRunnerReadsItems(t *testing.T) {
	result := runScript(t, "two-items", dsCommandFetch)
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if result.Response.Cursor != "42" || len(result.Response.Items) != 2 {
		t.Fatalf("unexpected response: %+v", result.Response)
	}
	if result.ExitCode != 0 {
		t.Fatalf("exit code = %d, want 0", result.ExitCode)
	}
}

func TestPluginRunnerRejectsInvalidJSON(t *testing.T) {
	result := runScript(t, "bad-json", dsCommandFetch)
	if !strings.Contains(result.Error, "not valid JSON") {
		t.Fatalf("expected a JSON error, got %q", result.Error)
	}
}

func TestPluginRunnerRejectsTrailingOutput(t *testing.T) {
	_, err := decodeDatasourceResponse([]byte(`{"protocol":1,"ok":true,"items":[]} trailing log`), dsCommandFetch)
	if err == nil || !strings.Contains(err.Error(), "after its JSON response") {
		t.Fatalf("expected trailing stdout to be refused, got %v", err)
	}

	_, err = decodeDatasourceResponse([]byte(`{"protocol":1,"ok":true,"items":[]} {"another":true}`), dsCommandFetch)
	if err == nil || !strings.Contains(err.Error(), "exactly one JSON value") {
		t.Fatalf("expected a second JSON value to be refused, got %v", err)
	}
}

func TestPluginRunnerRejectsForeignProtocol(t *testing.T) {
	result := runScript(t, "foreign-protocol", dsCommandFetch)
	if !strings.Contains(result.Error, "protocol") {
		t.Fatalf("expected a protocol error, got %q", result.Error)
	}
}

func TestPluginRunnerSurfacesPluginError(t *testing.T) {
	result := runScript(t, "reports-error", dsCommandFetch)
	if result.Error != "telegram api: 401 unauthorized" {
		t.Fatalf("expected the plugin's own message, got %q", result.Error)
	}
	if !strings.Contains(result.StderrTail, "401") {
		t.Fatalf("stderr should reach the run record, got %q", result.StderrTail)
	}
	if result.ExitCode == 0 {
		t.Fatal("a failed run must carry a non-zero exit code")
	}
}

func TestPluginRunnerReportsCrashWithoutOutput(t *testing.T) {
	result := runScript(t, "silent-crash", dsCommandFetch)
	if !strings.Contains(result.Error, "exit 3") {
		t.Fatalf("expected the exit status in the error, got %q", result.Error)
	}
	if !strings.Contains(result.StderrTail, "panic") {
		t.Fatalf("stderr tail = %q, want the panic text", result.StderrTail)
	}
}

func TestPluginRunnerEnforcesTimeout(t *testing.T) {
	plugin := testPlugin(t, "hangs")
	plugin.TimeoutSeconds = 1

	started := time.Now()
	result := runDatasourcePlugin(context.Background(), plugin, dsRequest{Command: dsCommandFetch, Source: "fake"})
	if !strings.Contains(result.Error, "did not finish") {
		t.Fatalf("expected a timeout error, got %q", result.Error)
	}
	if elapsed := time.Since(started); elapsed > 10*time.Second {
		t.Fatalf("the timeout did not stop the plugin, it took %s", elapsed)
	}
}

func TestPluginRunnerEnforcesStdoutLimit(t *testing.T) {
	plugin := testPlugin(t, "floods-stdout")
	plugin.TimeoutSeconds = 20

	result := runDatasourcePlugin(context.Background(), plugin, dsRequest{Command: dsCommandFetch, Source: "fake"})
	if !strings.Contains(result.Error, "stdout") {
		t.Fatalf("expected a stdout limit error, got %q", result.Error)
	}
	if result.StdoutBytes > dsMaxStdoutBytes {
		t.Fatalf("captured %d bytes, the limit is %d", result.StdoutBytes, dsMaxStdoutBytes)
	}
}

func TestPluginRunnerRefusesRelativePath(t *testing.T) {
	plugin := DatasourcePlugin{Name: "fake", Path: "finn-ds-telegram"}
	result := runDatasourcePlugin(context.Background(), plugin, dsRequest{Command: dsCommandFetch, Source: "fake"})
	if !strings.Contains(result.Error, "absolute") {
		t.Fatalf("expected a path error, got %q", result.Error)
	}
}

func TestPluginRunnerRefusesHashMismatch(t *testing.T) {
	plugin := testPlugin(t, "two-items")
	plugin.SHA256 = strings.Repeat("0", 64)

	result := runDatasourcePlugin(context.Background(), plugin, dsRequest{Command: dsCommandFetch, Source: "fake"})
	if !strings.Contains(result.Error, "sha256 mismatch") {
		t.Fatalf("expected a hash mismatch, got %q", result.Error)
	}
	if !strings.Contains(result.Error, "the file on disk is") {
		t.Fatalf("the error should show the actual hash so it can be pinned, got %q", result.Error)
	}
}

func TestPluginRunnerRefusesWorldWritableBinary(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix permission bits only")
	}
	path := filepath.Join(t.TempDir(), "plugin")
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	// WriteFile is subject to the umask, so the mode has to be set explicitly to
	// produce the file this check is about.
	if err := os.Chmod(path, 0o777); err != nil {
		t.Fatal(err)
	}

	result := runDatasourcePlugin(context.Background(), DatasourcePlugin{Name: "fake", Path: path}, dsRequest{Command: dsCommandFetch})
	if !strings.Contains(result.Error, "writable") {
		t.Fatalf("expected a permission refusal, got %q", result.Error)
	}
}

func TestPluginRunnerScrubsTheEnvironment(t *testing.T) {
	t.Setenv("FINN_BACKUP_CIPHER_KEY", "this must not reach a plugin")

	plugin := testPlugin(t, "echo-environment")
	plugin.Env[testPluginEchoEnv] = "visible"

	result := runDatasourcePlugin(context.Background(), plugin, dsRequest{Command: dsCommandFetch, Source: "fake"})
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}

	environment := map[string]string{}
	if err := json.Unmarshal([]byte(result.Response.Items[0].Raw), &environment); err != nil {
		t.Fatalf("decode the plugin environment: %v", err)
	}
	if _, leaked := environment["FINN_BACKUP_CIPHER_KEY"]; leaked {
		t.Fatal("Finn's own environment must not reach a plugin")
	}
	if environment[testPluginEchoEnv] != "visible" {
		t.Fatal("keys from the plugin's env: block must reach it")
	}
	if environment["PATH"] == "" {
		t.Fatal("a plugin still needs a minimal PATH")
	}
}

func TestPluginRunnerKeepsSecretsOutOfArgv(t *testing.T) {
	plugin := testPlugin(t, "echo-request")
	plugin.Env["FINN_DS_FAKE_TOKEN"] = "super-secret"

	result := runDatasourcePlugin(context.Background(), plugin, dsRequest{Command: dsCommandFetch, Source: "fake", Cursor: "7"})
	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}

	var request dsRequest
	if err := json.Unmarshal([]byte(result.Response.Items[0].Raw), &request); err != nil {
		t.Fatalf("decode the request the plugin received: %v", err)
	}
	if request.Protocol != dsProtocolVersion || request.Command != dsCommandFetch || request.Cursor != "7" {
		t.Fatalf("unexpected request: %+v", request)
	}
	if request.TimeoutMS <= 0 || request.Now == "" {
		t.Fatalf("the request must carry a deadline and a clock: %+v", request)
	}
}

func TestPrepareInboxRowDropsUnusableItems(t *testing.T) {
	cases := map[string]dsItem{
		"no external id":     {Kind: dsKindRaw, Raw: "text"},
		"unknown kind":       {ExternalID: "a", Kind: "guess"},
		"raw with no text":   {ExternalID: "a", Kind: dsKindRaw},
		"flow with no draft": {ExternalID: "a", Kind: dsKindFlow},
	}
	for name, item := range cases {
		if _, warning := prepareInboxRow("fake", item, "now", 0); warning == "" {
			t.Fatalf("%s: expected the item to be dropped with a warning", name)
		}
	}
}

func TestPrepareInboxRowKeepsInvalidDraftForRepair(t *testing.T) {
	item := dsItem{
		ExternalID: "broken",
		Kind:       dsKindFlow,
		Raw:        "-3500",
		Draft:      json.RawMessage(`{"month":"not-a-month","direction":"out","counterparty":"Shop","currency":"RUB","amount":3500}`),
	}
	row, warning := prepareInboxRow("fake", item, "now", 0)
	if warning != "" {
		t.Fatalf("an invalid draft must be kept, not dropped: %s", warning)
	}
	if row.Status != dsStatusInvalid {
		t.Fatalf("status = %q, want invalid", row.Status)
	}
	if !strings.Contains(row.Note, "month") {
		t.Fatalf("note = %q, want the validation reason", row.Note)
	}
}

func TestPrepareInboxRowDropsUnparsableOccurredAt(t *testing.T) {
	item := dsItem{ExternalID: "a", Kind: dsKindRaw, Raw: "text", OccurredAt: "11.08.2026"}
	row, warning := prepareInboxRow("fake", item, "now", 0)
	if warning != "" {
		t.Fatalf("unexpected drop: %s", warning)
	}
	if row.OccurredAt != "" {
		t.Fatalf("occurred_at = %q, want it dropped", row.OccurredAt)
	}
	if !strings.Contains(row.Note, "RFC3339") {
		t.Fatalf("note = %q, want an explanation", row.Note)
	}
}

func TestDatasourceConformanceAcceptsAWellBehavedPlugin(t *testing.T) {
	report := runDatasourceConformance(context.Background(), testPlugin(t, "cursor-aware"))
	if report.Failed != 0 {
		t.Fatalf("a conforming plugin must pass every check: %+v", report.Checks)
	}
}

func TestDatasourceConformanceCatchesAReplayingCursor(t *testing.T) {
	report := runDatasourceConformance(context.Background(), testPlugin(t, "replays-after-cursor"))
	if !conformanceFailed(report, "fetch accepts its own cursor back") {
		t.Fatalf("a plugin that ignores its own cursor must fail: %+v", report.Checks)
	}
}

func TestDatasourceConformanceCatchesADuplicateExternalID(t *testing.T) {
	report := runDatasourceConformance(context.Background(), testPlugin(t, "duplicate-ids"))
	if !conformanceFailed(report, "external_id is unique in one response") {
		t.Fatalf("duplicate ids must fail: %+v", report.Checks)
	}
}

func TestDatasourceConformanceCatchesASilentUnknownCommand(t *testing.T) {
	report := runDatasourceConformance(context.Background(), testPlugin(t, "exit-zero-on-anything"))
	if !conformanceFailed(report, "unknown command is refused") {
		t.Fatalf("exiting 0 for an unknown command must fail: %+v", report.Checks)
	}
}

func TestDatasourceConformanceWarnsOnAnUnstableManifest(t *testing.T) {
	report := runDatasourceConformance(context.Background(), testPlugin(t, "unstable-manifest"))
	for _, check := range report.Checks {
		if check.Name == "manifest is repeatable" && check.Result == dsCheckWarn {
			return
		}
	}
	t.Fatalf("a manifest that changes between calls must be reported: %+v", report.Checks)
}

func conformanceFailed(report dsVerifyReport, name string) bool {
	for _, check := range report.Checks {
		if check.Name == name {
			return check.Result == dsCheckFail
		}
	}
	return false
}
