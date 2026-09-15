package dsproto

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func runCommand(t *testing.T, handler Handler, args []string, request string) (Response, int) {
	t.Helper()
	stdout := &bytes.Buffer{}
	code := Run(handler, args, strings.NewReader(request), stdout)
	var response Response
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		t.Fatalf("response is not valid JSON: %v (%q)", err, stdout.String())
	}
	return response, code
}

func testHandler() HandlerFuncs {
	return HandlerFuncs{
		ManifestFunc: func(Request) (Manifest, error) {
			return Manifest{Name: "sample", Version: "1.0.0", Kinds: []string{KindFlow}, UsesCursor: true}, nil
		},
		FetchFunc: func(request Request) (FetchResult, error) {
			item, err := NewFlowItem("sample:1", time.Date(2026, 8, 11, 9, 41, 0, 0, time.UTC), "-3500 shop", FlowDraft{
				Month: "2026-08", Direction: "out", Counterparty: "shop", Currency: "RUB", Amount: 3500,
			})
			if err != nil {
				return FetchResult{}, err
			}
			return FetchResult{Cursor: request.Cursor + "+1", Items: []Item{item}}, nil
		},
	}
}

func TestServeManifest(t *testing.T) {
	response, code := runCommand(t, testHandler(), []string{CommandManifest}, `{"protocol":1,"command":"manifest","source":"sample"}`)
	if code != ExitOK {
		t.Fatalf("expected exit %d, got %d", ExitOK, code)
	}
	if !response.OK || response.Protocol != Protocol {
		t.Fatalf("unexpected response envelope: %+v", response)
	}
	if manifest := response.Manifest(); manifest.Name != "sample" || !manifest.UsesCursor {
		t.Fatalf("unexpected manifest: %+v", manifest)
	}
}

func TestServeFetchCarriesCursorAndItems(t *testing.T) {
	response, code := runCommand(t, testHandler(), []string{CommandFetch}, `{"protocol":1,"command":"fetch","source":"sample","cursor":"7"}`)
	if code != ExitOK {
		t.Fatalf("expected exit %d, got %d", ExitOK, code)
	}
	result := response.Fetch()
	if result.Cursor != "7+1" {
		t.Fatalf("expected the handler cursor, got %q", result.Cursor)
	}
	if len(result.Items) != 1 || result.Items[0].ExternalID != "sample:1" {
		t.Fatalf("unexpected items: %+v", result.Items)
	}
	draft, err := result.Items[0].FlowDraft()
	if err != nil {
		t.Fatalf("decode draft: %v", err)
	}
	if draft.Month != "2026-08" || draft.Amount != 3500 {
		t.Fatalf("unexpected draft: %+v", draft)
	}
}

func TestServeRejectsForeignProtocol(t *testing.T) {
	response, code := runCommand(t, testHandler(), []string{CommandFetch}, `{"protocol":99,"command":"fetch"}`)
	if code == ExitOK {
		t.Fatal("a foreign protocol version must fail")
	}
	if response.OK || !strings.Contains(response.Error, "unsupported protocol") {
		t.Fatalf("unexpected response: %+v", response)
	}
}

func TestServeRejectsUnknownCommand(t *testing.T) {
	response, code := runCommand(t, testHandler(), []string{"drop-database"}, `{"protocol":1}`)
	if code == ExitOK {
		t.Fatal("an unknown command must fail")
	}
	if response.OK || !strings.Contains(response.Error, "unknown command") {
		t.Fatalf("unexpected response: %+v", response)
	}
}

func TestServeRejectsCommandMismatch(t *testing.T) {
	_, code := runCommand(t, testHandler(), []string{CommandManifest}, `{"protocol":1,"command":"fetch"}`)
	if code == ExitOK {
		t.Fatal("argv and the request must agree on the command")
	}
}

func TestServeReportsHandlerFailureWithNonZeroExit(t *testing.T) {
	handler := HandlerFuncs{FetchFunc: func(Request) (FetchResult, error) {
		return FetchResult{}, errors.New("telegram api: 401 unauthorized")
	}}
	response, code := runCommand(t, handler, []string{CommandFetch}, `{"protocol":1,"command":"fetch"}`)
	if code == ExitOK {
		t.Fatal("a handler error must exit non-zero")
	}
	if response.OK || response.Error != "telegram api: 401 unauthorized" {
		t.Fatalf("unexpected response: %+v", response)
	}
}

func TestServeRejectsDuplicateExternalIDs(t *testing.T) {
	handler := HandlerFuncs{FetchFunc: func(Request) (FetchResult, error) {
		return FetchResult{Items: []Item{
			{ExternalID: "same", Kind: KindRaw, Raw: "first"},
			{ExternalID: " same ", Kind: KindRaw, Raw: "second"},
		}}, nil
	}}
	response, code := runCommand(t, handler, []string{CommandFetch}, `{"protocol":1,"command":"fetch"}`)
	if code == ExitOK {
		t.Fatal("duplicate external ids in one response must fail")
	}
	if !strings.Contains(response.Error, "appears twice") {
		t.Fatalf("unexpected response: %+v", response)
	}
}

func TestServeAcceptsEmptyFetch(t *testing.T) {
	handler := HandlerFuncs{FetchFunc: func(Request) (FetchResult, error) { return FetchResult{Cursor: "7"}, nil }}
	response, code := runCommand(t, handler, []string{CommandFetch}, `{"protocol":1,"command":"fetch","cursor":"7"}`)
	if code != ExitOK {
		t.Fatalf("expected success, got exit %d (%+v)", code, response)
	}
	if !response.OK || len(response.Fetch().Items) != 0 {
		t.Fatalf("a source with nothing new is a successful empty fetch: %+v", response)
	}
}

func TestRequestHelpers(t *testing.T) {
	request := Request{Now: "2026-08-11T10:00:00+03:00", TimeoutMS: 5000, Config: json.RawMessage(`{"allowed_chat_ids":[12345]}`)}
	if got := request.NowTime().Format("2006-01"); got != "2026-08" {
		t.Fatalf("unexpected now: %s", got)
	}
	if request.Deadline() != 5*time.Second {
		t.Fatalf("unexpected deadline: %s", request.Deadline())
	}
	var config struct {
		AllowedChatIDs []int64 `json:"allowed_chat_ids"`
	}
	if err := request.DecodeConfig(&config); err != nil {
		t.Fatalf("decode config: %v", err)
	}
	if len(config.AllowedChatIDs) != 1 || config.AllowedChatIDs[0] != 12345 {
		t.Fatalf("unexpected config: %+v", config)
	}
}

func TestItemValidateRejectsBadInput(t *testing.T) {
	cases := map[string]Item{
		"empty external id":  {Kind: KindRaw},
		"unknown kind":       {ExternalID: "a", Kind: "guess"},
		"flow without draft": {ExternalID: "a", Kind: KindFlow},
		"bad occurred_at":    {ExternalID: "a", Kind: KindRaw, OccurredAt: "11.08.2026"},
	}
	for name, item := range cases {
		if err := item.Validate(); err == nil {
			t.Fatalf("%s: expected a validation error", name)
		}
	}
}

func TestItemValidateMatchesFinnStorageLimits(t *testing.T) {
	tests := []Item{
		{ExternalID: "raw-without-text", Kind: KindRaw},
		{ExternalID: strings.Repeat("я", MaxExternalIDLength+1), Kind: KindRaw, Raw: "text"},
	}
	for _, item := range tests {
		if err := item.Validate(); err == nil {
			t.Fatalf("item %+v should be rejected", item)
		}
	}

	valid := Item{ExternalID: strings.Repeat("я", MaxExternalIDLength), Kind: KindRaw, Raw: "text"}
	if err := valid.Validate(); err != nil {
		t.Fatalf("a %d-character id should remain valid: %v", MaxExternalIDLength, err)
	}
}
