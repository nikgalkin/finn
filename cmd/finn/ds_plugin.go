package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Protocol constants Finn enforces on its side. They mirror the dsproto module
// that plugin authors compile against; dsproto is a separate module precisely so
// a plugin does not inherit Finn's dependencies, which is also why these few
// numbers are repeated here rather than imported.
const (
	dsProtocolVersion = 1
	dsCommandManifest = "manifest"
	dsCommandFetch    = "fetch"

	dsMaxItems        = 1000
	dsMaxStdoutBytes  = 8 << 20
	dsStderrTailBytes = 4096
)

var errDatasourceStdoutLimit = errors.New("plugin wrote more than the stdout limit")

// dsRequest is what Finn writes to the plugin's stdin. Reference lists let the
// plugin normalize what it recognized against the user's own settings; balances
// and movement history are never included.
type dsRequest struct {
	Protocol        int            `json:"protocol"`
	Command         string         `json:"command"`
	Source          string         `json:"source"`
	Cursor          string         `json:"cursor,omitempty"`
	Config          map[string]any `json:"config,omitempty"`
	TimeoutMS       int            `json:"timeout_ms"`
	Now             string         `json:"now"`
	KnownCurrencies []string       `json:"known_currencies,omitempty"`
	KnownAccounts   []string       `json:"known_accounts,omitempty"`
	KnownTags       []string       `json:"known_tags,omitempty"`
	KnownCategories []string       `json:"known_categories,omitempty"`
}

type dsConfigKey struct {
	Key      string `json:"key"`
	Required bool   `json:"required,omitempty"`
	Secret   bool   `json:"secret,omitempty"`
	Env      string `json:"env,omitempty"`
	Note     string `json:"note,omitempty"`
}

type dsItem struct {
	ExternalID string          `json:"external_id"`
	Kind       string          `json:"kind"`
	OccurredAt string          `json:"occurred_at"`
	Raw        string          `json:"raw"`
	Note       string          `json:"note"`
	Draft      json.RawMessage `json:"draft"`
}

// dsResponse decodes both commands. Nothing here is trusted: every field is
// re-checked before it reaches the database.
type dsResponse struct {
	Protocol int    `json:"protocol"`
	OK       bool   `json:"ok"`
	Error    string `json:"error"`

	Name       string        `json:"name"`
	Version    string        `json:"version"`
	Kinds      []string      `json:"kinds"`
	UsesCursor bool          `json:"uses_cursor"`
	ConfigKeys []dsConfigKey `json:"config_keys"`

	Cursor   string   `json:"cursor"`
	Warnings []string `json:"warnings"`
	Items    []dsItem `json:"items"`
}

// dsRunResult is one execution, successful or not. It is what ds_runs stores and
// what the UI shows as diagnostics.
type dsRunResult struct {
	Source      string
	Command     string
	StartedAt   time.Time
	FinishedAt  time.Time
	Duration    time.Duration
	ExitCode    int
	StdoutBytes int
	StderrTail  string
	Response    dsResponse
	Error       string
}

// verifiedBinary is what a plugin path turned out to be at the moment of the
// check: the hash is recomputed on every run, so a swapped binary is caught
// rather than assumed away.
type verifiedBinary struct {
	Path   string
	SHA256 string
	Size   int64
}

// datasourceBinaryHash is the value that goes into config.yml under sha256.
func datasourceBinaryHash(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	digest := sha256.New()
	if _, err := io.Copy(digest, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

// verifyDatasourceBinary decides whether Finn is allowed to execute this file.
//
// The honest boundary here is "you deliberately installed this binary and
// pinned its hash", not a sandbox: once started, a plugin is an ordinary process
// with the user's rights. What the checks do rule out is the file changing
// underneath a config entry that was reviewed once.
func verifyDatasourceBinary(plugin DatasourcePlugin) (verifiedBinary, error) {
	if plugin.ConfigError != "" {
		return verifiedBinary{}, errors.New(plugin.ConfigError)
	}
	if !filepath.IsAbs(plugin.Path) {
		return verifiedBinary{}, errors.New("path must be absolute")
	}

	info, err := os.Stat(plugin.Path)
	if err != nil {
		return verifiedBinary{}, fmt.Errorf("plugin binary is not readable: %w", err)
	}
	if info.IsDir() || !info.Mode().IsRegular() {
		return verifiedBinary{}, errors.New("plugin path is not a regular file")
	}
	if err := checkDatasourceBinaryOwnership(plugin.Path, info); err != nil {
		return verifiedBinary{}, err
	}

	hash, err := datasourceBinaryHash(plugin.Path)
	if err != nil {
		return verifiedBinary{}, fmt.Errorf("hash plugin binary: %w", err)
	}
	if plugin.SHA256 != "" && plugin.SHA256 != hash {
		return verifiedBinary{}, fmt.Errorf("sha256 mismatch: config pins %s, the file on disk is %s", plugin.SHA256, hash)
	}

	return verifiedBinary{Path: plugin.Path, SHA256: hash, Size: info.Size()}, nil
}

// datasourceEnvironment builds the child's whole environment. Inheriting Finn's
// would hand every plugin whatever secrets the user's shell exports, so only the
// keys the config names survive, plus the minimum a program needs to run.
func datasourceEnvironment(plugin DatasourcePlugin) []string {
	environment := baseDatasourceEnvironment()
	for key, value := range plugin.Env {
		environment = append(environment, key+"="+value)
	}
	return environment
}

// runDatasourcePlugin executes one command and returns what came back. Secrets
// travel in the environment and never in argv, which any process of the same
// user can read out of ps.
func runDatasourcePlugin(ctx context.Context, plugin DatasourcePlugin, request dsRequest) dsRunResult {
	result := dsRunResult{Source: plugin.Name, Command: request.Command, StartedAt: time.Now()}
	finish := func(message string) dsRunResult {
		result.FinishedAt = time.Now()
		result.Duration = result.FinishedAt.Sub(result.StartedAt)
		result.Error = message
		return result
	}

	binary, err := verifyDatasourceBinary(plugin)
	if err != nil {
		return finish(err.Error())
	}

	timeout := time.Duration(plugin.Timeout()) * time.Second
	request.Protocol = dsProtocolVersion
	request.TimeoutMS = int(timeout / time.Millisecond)
	if request.Now == "" {
		request.Now = time.Now().Format(time.RFC3339)
	}
	payload, err := json.Marshal(request)
	if err != nil {
		return finish(fmt.Sprintf("encode request: %v", err))
	}

	runContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	stdout := &cappedBuffer{limit: dsMaxStdoutBytes}
	stderr := &tailBuffer{limit: dsStderrTailBytes}

	command := exec.CommandContext(runContext, binary.Path, request.Command)
	command.Env = datasourceEnvironment(plugin)
	command.Dir = filepath.Dir(binary.Path)
	command.Stdin = bytes.NewReader(payload)
	command.Stdout = stdout
	command.Stderr = stderr
	// The plugin may start children of its own. The platform guard puts them in
	// one process group (unix) or Job Object (Windows), so a timeout cannot leave
	// descendants running or holding stdout open.
	process, err := newDatasourceProcess(command)
	if err != nil {
		return finish(fmt.Sprintf("prepare plugin process: %v", err))
	}
	defer process.Close()
	command.Cancel = func() error { return process.Kill(command) }
	command.WaitDelay = 2 * time.Second

	runError := process.Run(command)

	result.FinishedAt = time.Now()
	result.Duration = result.FinishedAt.Sub(result.StartedAt)
	result.StdoutBytes = stdout.written
	result.StderrTail = stderr.String()
	if command.ProcessState != nil {
		result.ExitCode = command.ProcessState.ExitCode()
	}

	switch {
	case stdout.overflow:
		return finish(fmt.Sprintf("plugin wrote more than %d bytes to stdout", dsMaxStdoutBytes))
	case errors.Is(runContext.Err(), context.DeadlineExceeded):
		return finish(fmt.Sprintf("plugin did not finish within %s", timeout))
	case errors.Is(ctx.Err(), context.Canceled):
		return finish("run was cancelled")
	}

	response, decodeError := decodeDatasourceResponse(stdout.Bytes(), request.Command)
	result.Response = response

	if decodeError != nil {
		if runError != nil {
			// A plugin that crashed before printing anything usable is better
			// described by its exit status than by a JSON parse error.
			return finish(fmt.Sprintf("plugin failed (exit %d): %v", result.ExitCode, runError))
		}
		return finish(decodeError.Error())
	}
	if !response.OK {
		message := strings.TrimSpace(response.Error)
		if message == "" {
			message = "plugin reported a failure without an error message"
		}
		return finish(message)
	}
	if runError != nil {
		return finish(fmt.Sprintf("plugin reported success but exited with an error: %v", runError))
	}
	return finish("")
}

// decodeDatasourceResponse turns stdout into a response, refusing anything that
// does not look like this protocol. A foreign protocol version is refused before
// the items are even looked at.
func decodeDatasourceResponse(stdout []byte, command string) (dsResponse, error) {
	trimmed := bytes.TrimSpace(stdout)
	if len(trimmed) == 0 {
		return dsResponse{}, errors.New("plugin produced no output")
	}

	var response dsResponse
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	if err := decoder.Decode(&response); err != nil {
		return dsResponse{}, fmt.Errorf("plugin response is not valid JSON: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return dsResponse{}, errors.New("plugin response must contain exactly one JSON value")
		}
		return dsResponse{}, fmt.Errorf("plugin wrote data after its JSON response: %w", err)
	}
	if response.Protocol != dsProtocolVersion {
		return response, fmt.Errorf("plugin speaks protocol %d, Finn speaks %d", response.Protocol, dsProtocolVersion)
	}
	if command == dsCommandFetch && len(response.Items) > dsMaxItems {
		return response, fmt.Errorf("plugin returned %d items, the limit is %d", len(response.Items), dsMaxItems)
	}
	return response, nil
}

func validateDatasourceManifest(response dsResponse) error {
	problems := []string{}
	if strings.TrimSpace(response.Name) == "" {
		problems = append(problems, "name is empty")
	}
	if strings.TrimSpace(response.Version) == "" {
		problems = append(problems, "version is empty")
	}
	if len(response.Kinds) == 0 {
		problems = append(problems, "kinds is empty")
	}
	seenKinds := map[string]struct{}{}
	for _, kind := range response.Kinds {
		if kind != dsKindFlow && kind != dsKindBalance && kind != dsKindRaw {
			problems = append(problems, fmt.Sprintf("unknown kind %q", kind))
		}
		if _, duplicate := seenKinds[kind]; duplicate {
			problems = append(problems, fmt.Sprintf("kind %q appears twice", kind))
		}
		seenKinds[kind] = struct{}{}
	}
	seenKeys := map[string]struct{}{}
	for _, key := range response.ConfigKeys {
		name := strings.TrimSpace(key.Key)
		if name == "" {
			problems = append(problems, "a config key has no name")
			continue
		}
		if _, duplicate := seenKeys[name]; duplicate {
			problems = append(problems, fmt.Sprintf("config key %q appears twice", name))
		}
		seenKeys[name] = struct{}{}
	}
	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	return nil
}

// cappedBuffer refuses to grow past its limit. Returning an error rather than
// discarding stops the copy, so a plugin that streams forever ends at the limit
// instead of at the timeout.
type cappedBuffer struct {
	limit    int
	written  int
	overflow bool
	buffer   bytes.Buffer
}

func (b *cappedBuffer) Write(chunk []byte) (int, error) {
	if b.overflow {
		return 0, errDatasourceStdoutLimit
	}
	remaining := b.limit - b.buffer.Len()
	if len(chunk) > remaining {
		b.overflow = true
		if remaining > 0 {
			_, _ = b.buffer.Write(chunk[:remaining])
			b.written += remaining
		}
		return 0, errDatasourceStdoutLimit
	}
	written, err := b.buffer.Write(chunk)
	b.written += written
	return written, err
}

func (b *cappedBuffer) Bytes() []byte { return b.buffer.Bytes() }

// tailBuffer keeps the last bytes of stderr. Diagnostics are most useful at the
// end, and the bound is what makes it safe to store the text in ds_runs.
type tailBuffer struct {
	limit     int
	data      []byte
	truncated bool
}

func (b *tailBuffer) Write(chunk []byte) (int, error) {
	b.data = append(b.data, chunk...)
	if len(b.data) > b.limit {
		b.truncated = true
		b.data = append([]byte(nil), b.data[len(b.data)-b.limit:]...)
	}
	return len(chunk), nil
}

func (b *tailBuffer) String() string {
	if len(b.data) == 0 {
		return ""
	}
	if b.truncated {
		return "…" + string(b.data)
	}
	return string(b.data)
}
