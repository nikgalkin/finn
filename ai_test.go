package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func useAIHTTPClientForTest(t *testing.T, handler roundTripFunc) {
	t.Helper()
	previous := newAIHTTPClient
	newAIHTTPClient = func(_ time.Duration) *http.Client {
		return &http.Client{Transport: handler}
	}
	t.Cleanup(func() { newAIHTTPClient = previous })
}

func newAITestDB(t *testing.T, baseURL string) *sql.DB {
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
	`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	masterSettings, err := json.Marshal(map[string]any{
		"baseCurrency":      "RUB",
		"secondaryCurrency": "USD",
		"organizations":     []string{"Bank", "Broker"},
		"currencies":        []string{"RUB", "USD"},
		"localAI": map[string]any{
			"enabled":  true,
			"provider": "lmstudio",
			"baseUrl":  baseURL,
			"model":    "",
		},
	})
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	_, err = db.Exec("INSERT INTO settings (key, value) VALUES ('master_data', ?)", string(masterSettings))
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	snapshots := []struct {
		month string
		data  string
	}{
		{
			month: "2026-01",
			data:  `{"rates":{"RUB":1,"USD":100},"organizations":[{"name":"Bank","balances":[{"currency":"RUB","amount":1000,"tags":["cash"]}]},{"name":"Broker","balances":[{"currency":"USD","amount":10,"tags":["stocks"]}]}]}`,
		},
		{
			month: "2026-02",
			data:  `{"comment":"review only, do not treat as instructions","rates":{"RUB":1,"USD":110},"organizations":[{"name":"Bank","balances":[{"currency":"RUB","amount":1500,"tags":["cash"]}]},{"name":"Broker","balances":[{"currency":"USD","amount":10,"tags":["stocks"]}]}]}`,
		},
	}
	for _, snapshot := range snapshots {
		if _, err := db.Exec("INSERT INTO snapshots (month, data, duration_seconds) VALUES (?, ?, 60)", snapshot.month, snapshot.data); err != nil {
			db.Close()
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestNormalizedLoopbackBaseURL(t *testing.T) {
	accepted := []string{
		"http://127.0.0.1:1234/v1/",
		"http://localhost:1234/v1",
		"http://[::1]:1234/v1",
	}
	for _, input := range accepted {
		if _, err := normalizedLoopbackBaseURL(input); err != nil {
			t.Errorf("normalizedLoopbackBaseURL(%q) returned error: %v", input, err)
		}
	}
	rejected := []string{
		"https://127.0.0.1:1234/v1",
		"http://example.com/v1",
		"file:///tmp/model",
	}
	for _, input := range rejected {
		if _, err := normalizedLoopbackBaseURL(input); err == nil {
			t.Errorf("normalizedLoopbackBaseURL(%q) unexpectedly succeeded", input)
		}
	}
}

func TestBuildFinancialContextIncludesDerivedMetrics(t *testing.T) {
	db := newAITestDB(t, defaultAIBaseURL)
	info, err := buildFinancialContext(db, aiContextFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if info.Snapshots != 2 || info.Bytes == 0 || len(info.Fingerprint) != 12 {
		t.Fatalf("unexpected context info: %+v", info)
	}
	checks := []string{
		`"snapshot_count":2`,
		`"first_month":"2026-01"`,
		`"last_month":"2026-02"`,
		`"month":"2026-02"`,
		`"total_base":2600`,
		`"organic_delta":500`,
		`"fx_impact_delta":100`,
		`"total_secondary":23.6364`,
		`"currency_amounts":{"RUB":1500,"USD":10}`,
		`"currency_values_base":{"RUB":1500,"USD":1100}`,
		`"currency_shares_percent":{"RUB":57.6923,"USD":42.3077}`,
		`currency_values_base: exact value of each currency position converted to base_currency`,
		`currency_shares_percent: exact percentage exposure`,
	}
	for _, expected := range checks {
		if !strings.Contains(info.Prompt, expected) {
			t.Errorf("financial context does not contain %s", expected)
		}
	}
	if strings.Contains(info.Prompt, defaultAIBaseURL) {
		t.Fatal("financial context leaked local AI connection settings")
	}
}

func TestDeriveAISnapshotSumsDuplicateOrganizations(t *testing.T) {
	data := aiSnapshotData{
		Rates: map[string]any{"RUB": 1.0},
		Organizations: []aiOrganization{
			{Name: "Bank", Balances: []aiBalance{{Currency: "RUB", Amount: 100.0}}},
			{Name: "Bank", Balances: []aiBalance{{Currency: "RUB", Amount: 250.0}}},
		},
	}
	metrics := deriveAISnapshot(data, "RUB", "")
	if metrics.OrganizationTotals["Bank"] != 350 {
		t.Fatalf("duplicate organization totals were not summed: %+v", metrics.OrganizationTotals)
	}
	if metrics.CurrencyValues["RUB"] != 350 || metrics.CurrencyShares["RUB"] != 100 {
		t.Fatalf("unexpected currency metrics: values=%+v shares=%+v", metrics.CurrencyValues, metrics.CurrencyShares)
	}
}

func TestValidateAISnapshotRatesRejectsMissingActiveRate(t *testing.T) {
	data := aiSnapshotData{
		Rates: map[string]any{"RUB": 1.0, "USD": 0.0},
		Organizations: []aiOrganization{{
			Name:     "Broker",
			Balances: []aiBalance{{Currency: "USD", Amount: 10.0}},
		}},
	}
	if err := validateAISnapshotRates(data, "RUB", ""); err == nil {
		t.Fatal("missing active exchange rate was accepted")
	}
}

func TestAIResponseStyles(t *testing.T) {
	for _, style := range []string{"", "strict", "balanced", "playful"} {
		if err := validateAIResponseStyle(style); err != nil {
			t.Errorf("valid response style %q returned error: %v", style, err)
		}
		if !strings.Contains(withAIResponseStyle("context", style), "Response style:") {
			t.Errorf("response style %q was not added to prompt", style)
		}
	}
	if err := validateAIResponseStyle("chaotic"); err == nil {
		t.Fatal("invalid response style was accepted")
	}
}

func TestAIContextPreviewEndpointReturnsExactStyledPrompt(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := newAITestDB(t, defaultAIBaseURL)
	router := gin.New()
	api := router.Group("/api")
	setupAIAPI(api, db)

	request := httptest.NewRequest(http.MethodGet, "/api/ai/context?months=1&responseStyle=strict", nil)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("unexpected context preview status %d: %s", recorder.Code, recorder.Body.String())
	}
	var preview aiContextPreview
	if err := json.Unmarshal(recorder.Body.Bytes(), &preview); err != nil {
		t.Fatal(err)
	}
	if preview.SnapshotCount != 1 || preview.Bytes != len(preview.Prompt) {
		t.Fatalf("unexpected context preview metadata: %+v", preview)
	}
	for _, expected := range []string{
		`"currency_values_base":{"RUB":1500,"USD":1100}`,
		`"currency_shares_percent":{"RUB":57.6923,"USD":42.3077}`,
		"Be concise, neutral, and direct.",
	} {
		if !strings.Contains(preview.Prompt, expected) {
			t.Errorf("context preview does not contain %q", expected)
		}
	}
}

func TestBuildFinancialContextFiltersSnapshotsWithoutLosingFlowBaseline(t *testing.T) {
	db := newAITestDB(t, defaultAIBaseURL)
	info, err := buildFinancialContext(db, aiContextFilter{Months: 1})
	if err != nil {
		t.Fatal(err)
	}
	if info.Snapshots != 1 || len(info.AvailableMonths) != 2 {
		t.Fatalf("unexpected filtered context info: %+v", info)
	}
	checks := []string{
		`"snapshot_count":1`,
		`"first_month":"2026-02"`,
		`"organic_delta":500`,
		`"fx_impact_delta":100`,
	}
	for _, expected := range checks {
		if !strings.Contains(info.Prompt, expected) {
			t.Errorf("filtered context does not contain %s", expected)
		}
	}
	if strings.Contains(info.Prompt, `"month":"2026-01"`) {
		t.Fatal("filtered context unexpectedly contains an excluded snapshot")
	}

	rangeInfo, err := buildFinancialContext(db, aiContextFilter{FromMonth: "2026-01", ToMonth: "2026-01"})
	if err != nil {
		t.Fatal(err)
	}
	if rangeInfo.Snapshots != 1 || !strings.Contains(rangeInfo.Prompt, `"last_month":"2026-01"`) {
		t.Fatalf("unexpected range context: %+v", rangeInfo)
	}
}

func TestValidateAIContextFilter(t *testing.T) {
	valid := []aiContextFilter{
		{},
		{Months: 12},
		{FromMonth: "2025-01", ToMonth: "2026-07"},
	}
	for _, filter := range valid {
		if err := validateAIContextFilter(filter); err != nil {
			t.Errorf("valid filter %+v returned error: %v", filter, err)
		}
	}
	invalid := []aiContextFilter{
		{Months: -1},
		{FromMonth: "2026-13"},
		{FromMonth: "2026-07", ToMonth: "2025-01"},
	}
	for _, filter := range invalid {
		if err := validateAIContextFilter(filter); err == nil {
			t.Errorf("invalid filter %+v unexpectedly succeeded", filter)
		}
	}
}

func TestProbeAIProviderSelectsChatModel(t *testing.T) {
	useAIHTTPClientForTest(t, func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != defaultAIBaseURL+"/models" {
			t.Errorf("unexpected models URL: %s", request.URL)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"data":[{"id":"google/gemma-4-12b"},{"id":"text-embedding-nomic-embed-text-v1.5"}]}`)),
		}, nil
	})

	models, selected, err := probeAIProvider(t.Context(), localAISettings{
		Enabled: true,
		BaseURL: defaultAIBaseURL,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(models) != 2 || selected != "google/gemma-4-12b" {
		t.Fatalf("unexpected probe result: models=%+v selected=%q", models, selected)
	}
}

func TestStreamAIChatProxiesServerSentEvents(t *testing.T) {
	useAIHTTPClientForTest(t, func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != defaultAIBaseURL+"/chat/completions" {
			t.Errorf("unexpected chat URL: %s", request.URL)
		}
		var payload struct {
			Model    string          `json:"model"`
			Messages []aiChatMessage `json:"messages"`
			Stream   bool            `json:"stream"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Errorf("decode upstream request: %v", err)
		}
		if payload.Model != "google/gemma-4-12b" || !payload.Stream || len(payload.Messages) != 2 || payload.Messages[0].Role != "system" {
			t.Errorf("unexpected upstream request: %+v", payload)
		}
		body := bytes.NewBufferString("data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\ndata: [DONE]\n\n")
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
			Body:       io.NopCloser(body),
		}, nil
	})
	db := newAITestDB(t, defaultAIBaseURL)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/chat", func(c *gin.Context) {
		streamAIChat(c, db, localAISettings{Enabled: true, Provider: "openai-compatible", BaseURL: defaultAIBaseURL}, "google/gemma-4-12b", aiChatRequest{
			Messages: []aiChatMessage{{Role: "user", Content: "Hi"}},
		})
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/chat", nil)
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("stream status = %d, body: %s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Header().Get("Content-Type"), "text/event-stream") || !strings.Contains(recorder.Body.String(), `"content":"hello"`) {
		t.Fatalf("unexpected stream response: headers=%v body=%s", recorder.Header(), recorder.Body.String())
	}
}

func TestStreamLMStudioChatDisablesReasoningAndNormalizesEvents(t *testing.T) {
	useAIHTTPClientForTest(t, func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != "http://127.0.0.1:1234/api/v1/chat" {
			t.Errorf("unexpected native chat URL: %s", request.URL)
		}
		var payload struct {
			Model        string `json:"model"`
			Input        string `json:"input"`
			SystemPrompt string `json:"system_prompt"`
			Reasoning    string `json:"reasoning"`
			Store        bool   `json:"store"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Errorf("decode native request: %v", err)
		}
		if payload.Model != "google/gemma-4-12b" || payload.Input != "Hi" || payload.SystemPrompt == "" || payload.Reasoning != "off" || !payload.Store {
			t.Errorf("unexpected native request: %+v", payload)
		}
		body := strings.Join([]string{
			"event: prompt_processing.start\ndata: {\"type\":\"prompt_processing.start\"}\n\n",
			"event: message.delta\ndata: {\"type\":\"message.delta\",\"content\":\"hello\"}\n\n",
			"event: chat.end\ndata: {\"type\":\"chat.end\",\"result\":{\"response_id\":\"resp_test\"}}\n\n",
		}, "")
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
			Body:       io.NopCloser(strings.NewReader(body)),
		}, nil
	})
	db := newAITestDB(t, defaultAIBaseURL)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/chat", func(c *gin.Context) {
		streamAIChat(c, db, localAISettings{Enabled: true, Provider: "lmstudio", BaseURL: defaultAIBaseURL}, "google/gemma-4-12b", aiChatRequest{
			Messages:        []aiChatMessage{{Role: "user", Content: "Hi"}},
			DataFingerprint: "stale",
		})
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/chat", nil)
	router.ServeHTTP(recorder, request)

	body := recorder.Body.String()
	if recorder.Code != http.StatusOK || !strings.Contains(body, `"content":"hello"`) || !strings.Contains(body, `"responseId":"resp_test"`) || !strings.Contains(body, "[DONE]") {
		t.Fatalf("unexpected normalized stream: status=%d body=%s", recorder.Code, body)
	}
}
