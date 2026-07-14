package main

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestSettingsWithDefaultsAddsMissingLists(t *testing.T) {
	value, err := settingsWithDefaults(`{"organizations":[]}`)
	if err != nil {
		t.Fatal(err)
	}

	var settings map[string]any
	if err := json.Unmarshal([]byte(value), &settings); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(settings["currencies"], []any{"RUB", "USD", "EUR"}) {
		t.Fatalf("currencies = %#v", settings["currencies"])
	}
	if !reflect.DeepEqual(settings["tags"], []any{"deposit", "cash", "stocks", "checking"}) {
		t.Fatalf("tags = %#v", settings["tags"])
	}
	cashFlow, ok := settings["cashFlow"].(map[string]any)
	if !ok {
		t.Fatalf("cashFlow = %#v", settings["cashFlow"])
	}
	if !reflect.DeepEqual(cashFlow["categories"], []any{"salary", "other income", "purchase", "rent expense", "loan given", "loan returned"}) {
		t.Fatalf("categories = %#v", cashFlow["categories"])
	}
}

func TestSettingsWithDefaultsPreservesExplicitLists(t *testing.T) {
	value, err := settingsWithDefaults(`{"currencies":[],"tags":[],"cashFlow":{"enabled":true,"categories":[]}}`)
	if err != nil {
		t.Fatal(err)
	}

	var settings map[string]any
	if err := json.Unmarshal([]byte(value), &settings); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(settings["currencies"], []any{}) {
		t.Fatalf("currencies = %#v, want explicit empty list", settings["currencies"])
	}
	if !reflect.DeepEqual(settings["tags"], []any{}) {
		t.Fatalf("tags = %#v, want explicit empty list", settings["tags"])
	}
	cashFlow := settings["cashFlow"].(map[string]any)
	if !reflect.DeepEqual(cashFlow["categories"], []any{}) {
		t.Fatalf("categories = %#v, want explicit empty list", cashFlow["categories"])
	}
	if cashFlow["enabled"] != true {
		t.Fatalf("cashFlow enabled = %#v, want preserved value", cashFlow["enabled"])
	}
}
