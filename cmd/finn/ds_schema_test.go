package main

import (
	"encoding/json"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// docs/ds-protocol.schema.json is the normative contract for plugin authors who
// are not writing Go, so it has to describe exactly what Finn accepts. These
// tests compare it against the structs the runner actually decodes into: the two
// drifting apart is the failure that would otherwise go unnoticed for a release.

const schemaPath = "../../docs/ds-protocol.schema.json"

type jsonSchemaDefinition struct {
	Type       string                          `json:"type"`
	Required   []string                        `json:"required"`
	Properties map[string]json.RawMessage      `json:"properties"`
	Defs       map[string]jsonSchemaDefinition `json:"$defs"`
}

func loadProtocolSchema(t *testing.T) jsonSchemaDefinition {
	t.Helper()
	contents, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read the protocol schema: %v", err)
	}
	var schema jsonSchemaDefinition
	if err := json.Unmarshal(contents, &schema); err != nil {
		t.Fatalf("the protocol schema is not valid JSON: %v", err)
	}
	return schema
}

// jsonFieldNames lists the wire names of a struct, which is what the schema has
// to match property for property.
func jsonFieldNames(value any) []string {
	structType := reflect.TypeOf(value)
	names := make([]string, 0, structType.NumField())
	for index := 0; index < structType.NumField(); index++ {
		tag := structType.Field(index).Tag.Get("json")
		name, _, _ := strings.Cut(tag, ",")
		if name == "" || name == "-" {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func schemaPropertyNames(t *testing.T, definition jsonSchemaDefinition, name string) []string {
	t.Helper()
	if len(definition.Properties) == 0 {
		t.Fatalf("schema definition %q has no properties", name)
	}
	names := make([]string, 0, len(definition.Properties))
	for property := range definition.Properties {
		names = append(names, property)
	}
	sort.Strings(names)
	return names
}

func TestProtocolSchemaMatchesTheWireTypes(t *testing.T) {
	schema := loadProtocolSchema(t)

	cases := []struct {
		definition string
		value      any
	}{
		{"request", dsRequest{}},
		{"response", dsResponse{}},
		{"item", dsItem{}},
		{"configKey", dsConfigKey{}},
		{"flowDraft", FlowEntryRequest{}},
	}

	for _, testCase := range cases {
		definition, found := schema.Defs[testCase.definition]
		if !found {
			t.Fatalf("the schema has no $defs/%s", testCase.definition)
		}

		want := jsonFieldNames(testCase.value)
		got := schemaPropertyNames(t, definition, testCase.definition)
		if !reflect.DeepEqual(want, got) {
			t.Fatalf("$defs/%s describes %v, the Go type carries %v", testCase.definition, got, want)
		}
	}
}

func TestProtocolSchemaRequiredFieldsExist(t *testing.T) {
	schema := loadProtocolSchema(t)

	for name, definition := range schema.Defs {
		for _, required := range definition.Required {
			if _, found := definition.Properties[required]; !found {
				t.Fatalf("$defs/%s requires %q, which it does not define", name, required)
			}
		}
	}
}

// The fixtures are the ones the runner tests drive a fake plugin with, so a
// change to either side shows up here.
func TestProtocolFixturesDecodeIntoTheWireTypes(t *testing.T) {
	fixtures := map[string]string{
		"manifest": `{"protocol":1,"ok":true,"name":"fake","version":"1.0.0","kinds":["flow","raw"],"uses_cursor":true,
			"config_keys":[{"key":"token","required":true,"secret":true,"env":"FINN_DS_FAKE_TOKEN"}]}`,
		"fetch": `{"protocol":1,"ok":true,"cursor":"42","warnings":["1 message was not parsed"],"items":[
			{"external_id":"a","kind":"flow","occurred_at":"2026-08-11T09:41:00Z","raw":"-3500 Shop","note":"",
			 "draft":{"month":"2026-08","entryType":"external","direction":"out","counterparty":"Shop","currency":"RUB","amount":3500,"category":"groceries"}},
			{"external_id":"b","kind":"raw","occurred_at":"2026-08-11T10:00:00Z","raw":"could not parse this"}
		]}`,
		"failure": `{"protocol":1,"ok":false,"error":"telegram api: 401 unauthorized"}`,
	}

	for name, fixture := range fixtures {
		response, err := decodeDatasourceResponse([]byte(fixture), dsCommandFetch)
		if err != nil {
			t.Fatalf("%s fixture: %v", name, err)
		}
		if response.Protocol != dsProtocolVersion {
			t.Fatalf("%s fixture: protocol = %d", name, response.Protocol)
		}
	}

	// And the flow draft in the fetch fixture has to survive Finn's own rules,
	// otherwise the documented example proposes something it would reject.
	var draft FlowEntryRequest
	if err := json.Unmarshal([]byte(`{"month":"2026-08","entryType":"external","direction":"out","counterparty":"Shop","currency":"RUB","amount":3500,"category":"groceries"}`), &draft); err != nil {
		t.Fatal(err)
	}
	if _, validationError := normalizeFlowEntryRequest(draft); validationError != "" {
		t.Fatalf("the documented flow draft does not validate: %s", validationError)
	}
}
