package main

import (
	"encoding/json"
	"math"
	"net/http"
	"testing"
	"time"
)

func TestJSONSafeSQLValueKeepsEveryDriverTypeSerializable(t *testing.T) {
	moment := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

	tests := []struct {
		name  string
		value any
		want  any
	}{
		{name: "null", value: nil, want: nil},
		{name: "text", value: "hello", want: "hello"},
		{name: "integer", value: int64(42), want: int64(42)},
		{name: "real", value: 1.5, want: 1.5},
		{name: "utf8 blob", value: []byte("hello"), want: "hello"},
		{name: "binary blob", value: []byte{0x00, 0xff, 0xfe}, want: "0x00fffe"},
		{name: "time", value: moment, want: "2026-01-02T03:04:05Z"},
		{name: "nan", value: math.NaN(), want: "NaN"},
		{name: "positive infinity", value: math.Inf(1), want: "+Inf"},
		{name: "negative infinity", value: math.Inf(-1), want: "-Inf"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := jsonSafeSQLValue(tt.value)
			if got != tt.want {
				t.Fatalf("jsonSafeSQLValue(%#v) = %#v, want %#v", tt.value, got, tt.want)
			}
			if _, err := json.Marshal(got); err != nil {
				t.Fatalf("value is not serializable: %v", err)
			}
		})
	}
}

func TestSQLConsoleSerializesValuesTheDriverReturns(t *testing.T) {
	console := newTestSQLConsole(t)

	payload, _ := json.Marshal(map[string]any{
		"sql":  `SELECT 42 AS whole, 1.5 AS fraction, 'text' AS words, x'00fffe' AS binary_blob, NULL AS empty_value, json_extract('{"a":7}', '$.a') AS from_json`,
		"mode": "dry-run",
	})
	response := execSQLConsole(t, console, string(payload))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body: %s", response.Code, response.Body.String())
	}

	var decoded struct {
		Statements []struct {
			Columns []string `json:"columns"`
			Rows    [][]any  `json:"rows"`
		} `json:"statements"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded.Statements) != 1 || len(decoded.Statements[0].Rows) != 1 {
		t.Fatalf("unexpected result shape: %s", response.Body.String())
	}

	row := decoded.Statements[0].Rows[0]
	columns := decoded.Statements[0].Columns
	if len(row) != 6 {
		t.Fatalf("row holds %d values, want 6", len(row))
	}

	values := map[string]any{}
	for index, column := range columns {
		values[column] = row[index]
	}

	if whole, ok := values["whole"].(float64); !ok || whole != 42 {
		t.Fatalf("whole = %#v, want the number 42", values["whole"])
	}
	if fraction, ok := values["fraction"].(float64); !ok || fraction != 1.5 {
		t.Fatalf("fraction = %#v, want the number 1.5", values["fraction"])
	}
	if values["words"] != "text" {
		t.Fatalf("words = %#v, want \"text\"", values["words"])
	}
	if values["binary_blob"] != "0x00fffe" {
		t.Fatalf("binary_blob = %#v, want the hex rendering of a non-UTF8 blob", values["binary_blob"])
	}
	if values["empty_value"] != nil {
		t.Fatalf("empty_value = %#v, want null", values["empty_value"])
	}
	if fromJSON, ok := values["from_json"].(float64); !ok || fromJSON != 7 {
		t.Fatalf("from_json = %#v, want the number 7", values["from_json"])
	}
}
