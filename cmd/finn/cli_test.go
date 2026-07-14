package main

import (
	"bytes"
	"encoding/base64"
	"runtime"
	"strings"
	"testing"
)

func executeCLI(t *testing.T, args ...string) (string, error) {
	t.Helper()
	cmd := newRootCommand()
	var output bytes.Buffer
	cmd.SetOut(&output)
	cmd.SetErr(&output)
	cmd.SetArgs(args)
	err := cmd.Execute()
	return output.String(), err
}

func TestBackupGenerateKeyCommand(t *testing.T) {
	output, err := executeCLI(t, "backup", "generate-key")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output, "Finn Backup Key Generator") ||
		!strings.Contains(output, "backup:\n    cipher_key:") ||
		!strings.Contains(output, "chmod 600 ~/.finn/config.yaml") {
		t.Fatalf("command output is missing setup instructions: %q", output)
	}
	if strings.Contains(output, "\x1b[") {
		t.Fatalf("redirected command output contains terminal color codes: %q", output)
	}
}

func TestBackupGenerateKeyRawOutput(t *testing.T) {
	output, err := executeCLI(t, "backup", "generate-key", "--raw")
	if err != nil {
		t.Fatal(err)
	}
	key := strings.TrimSpace(output)
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		t.Fatalf("command output is not a Base64 key: %q: %v", output, err)
	}
	if len(decoded) != 32 {
		t.Fatalf("generated key contains %d bytes, want 32", len(decoded))
	}
}

func TestVersionCommand(t *testing.T) {
	output, err := executeCLI(t, "version")
	if err != nil {
		t.Fatal(err)
	}
	want := "finn version " + version + " (" + runtime.GOOS + "/" + runtime.GOARCH + ")"
	if strings.TrimSpace(output) != want {
		t.Fatalf("version output = %q, want %q", strings.TrimSpace(output), want)
	}
}
