// Package dsproto describes the wire contract between Finn and a datasource
// plugin. It has no dependencies beyond the standard library so that a plugin
// can adopt it without inheriting anything else Finn happens to use.
//
// A plugin is a one-shot program: Finn runs `<binary> <command>`, writes a JSON
// request to stdin and reads a JSON response from stdout. Diagnostics go to
// stderr. The plugin never touches Finn's database.
package dsproto

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// Protocol is the wire version this package implements. Finn refuses a response
// carrying any other number.
const Protocol = 1

// Commands Finn may ask for.
const (
	CommandManifest = "manifest"
	CommandFetch    = "fetch"
)

// Item kinds. A plugin that cannot parse something reports KindRaw rather than
// dropping it: the text still reaches the Inbox and the person fixes it there.
const (
	KindFlow    = "flow"
	KindBalance = "balance"
	KindRaw     = "raw"
)

// Limits Finn enforces on a fetch response. A plugin that exceeds either one
// fails the whole run, so paginate instead of returning everything at once.
const (
	MaxItems            = 1000
	MaxStdoutBytes      = 8 << 20
	MaxExternalIDLength = 512
)

// Request is what Finn writes to stdin for every command.
//
// The known* lists let a plugin normalize what it recognized against the user's
// own settings instead of guessing. Balances and movement history are never
// passed.
type Request struct {
	Protocol        int             `json:"protocol"`
	Command         string          `json:"command"`
	Source          string          `json:"source"`
	Cursor          string          `json:"cursor,omitempty"`
	Config          json.RawMessage `json:"config,omitempty"`
	TimeoutMS       int             `json:"timeout_ms,omitempty"`
	Now             string          `json:"now,omitempty"`
	KnownCurrencies []string        `json:"known_currencies,omitempty"`
	KnownAccounts   []string        `json:"known_accounts,omitempty"`
	KnownTags       []string        `json:"known_tags,omitempty"`
	KnownCategories []string        `json:"known_categories,omitempty"`
}

// DecodeConfig unpacks the plugin-specific config block from config.yml.
func (r Request) DecodeConfig(target any) error {
	if len(r.Config) == 0 {
		return nil
	}
	return json.Unmarshal(r.Config, target)
}

// NowTime parses the timestamp Finn stamped the request with, falling back to
// the local clock. A plugin should prefer it so that a dry run and a real run
// agree on what "this month" means.
func (r Request) NowTime() time.Time {
	parsed, err := time.Parse(time.RFC3339, r.Now)
	if err != nil {
		return time.Now()
	}
	return parsed
}

// Deadline is how long the plugin has before Finn kills its process group.
func (r Request) Deadline() time.Duration {
	if r.TimeoutMS <= 0 {
		return 30 * time.Second
	}
	return time.Duration(r.TimeoutMS) * time.Millisecond
}

// ConfigKey documents one entry a plugin expects under `config:` in config.yml.
// Finn shows the list in the confirmation dialog before the first run.
type ConfigKey struct {
	Key      string `json:"key"`
	Required bool   `json:"required,omitempty"`
	Secret   bool   `json:"secret,omitempty"`
	Env      string `json:"env,omitempty"`
	Note     string `json:"note,omitempty"`
}

// Manifest answers "what is this program and what does it want". It must have
// no side effects and touch no network: Finn calls it just to describe the
// plugin in the UI.
type Manifest struct {
	Name       string      `json:"name"`
	Version    string      `json:"version"`
	Kinds      []string    `json:"kinds"`
	UsesCursor bool        `json:"uses_cursor"`
	ConfigKeys []ConfigKey `json:"config_keys,omitempty"`
}

// FlowDraft is a proposed cash flow movement. The field names match Finn's own
// flow entry API, and Finn revalidates every one of them before anything is
// written.
type FlowDraft struct {
	Month        string  `json:"month"`
	EntryType    string  `json:"entryType,omitempty"`
	Direction    string  `json:"direction,omitempty"`
	Counterparty string  `json:"counterparty,omitempty"`
	Account      string  `json:"account,omitempty"`
	Tag          string  `json:"tag,omitempty"`
	Currency     string  `json:"currency,omitempty"`
	Amount       float64 `json:"amount,omitempty"`
	TaxRate      float64 `json:"taxRate,omitempty"`
	Category     string  `json:"category,omitempty"`
	Comment      string  `json:"comment,omitempty"`
	ToAccount    string  `json:"toAccount,omitempty"`
	ToTag        string  `json:"toTag,omitempty"`
	ToCurrency   string  `json:"toCurrency,omitempty"`
	ToAmount     float64 `json:"toAmount,omitempty"`
}

// BalanceDraft is a proposed balance reading. Protocol 1 carries it so plugins
// can be written against a stable shape; Finn 1.10 stores and shows such items
// but does not apply them to a snapshot.
type BalanceDraft struct {
	Month        string  `json:"month"`
	Organization string  `json:"organization"`
	Currency     string  `json:"currency"`
	Amount       float64 `json:"amount"`
	Tag          string  `json:"tag,omitempty"`
	Comment      string  `json:"comment,omitempty"`
}

// Item is one proposal. ExternalID is the idempotency key: Finn stores it with
// a unique index per source, so re-fetching the same thing changes nothing.
type Item struct {
	ExternalID string          `json:"external_id"`
	Kind       string          `json:"kind"`
	OccurredAt string          `json:"occurred_at,omitempty"`
	Raw        string          `json:"raw,omitempty"`
	Note       string          `json:"note,omitempty"`
	Draft      json.RawMessage `json:"draft,omitempty"`
}

// FetchResult is what a fetch produced. Finn writes Items and Cursor in one
// transaction, so a cursor never runs ahead of the data it stands for.
type FetchResult struct {
	Cursor   string   `json:"cursor,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
	Items    []Item   `json:"items"`
}

// Response is the wire shape of everything a plugin prints to stdout. Manifest
// and fetch share it, which keeps the failure form identical for both.
type Response struct {
	Protocol int    `json:"protocol"`
	OK       bool   `json:"ok"`
	Error    string `json:"error,omitempty"`

	Name       string      `json:"name,omitempty"`
	Version    string      `json:"version,omitempty"`
	Kinds      []string    `json:"kinds,omitempty"`
	UsesCursor bool        `json:"uses_cursor,omitempty"`
	ConfigKeys []ConfigKey `json:"config_keys,omitempty"`

	Cursor   string   `json:"cursor,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
	Items    []Item   `json:"items,omitempty"`
}

// Manifest reads the manifest half of a response.
func (r Response) Manifest() Manifest {
	return Manifest{Name: r.Name, Version: r.Version, Kinds: r.Kinds, UsesCursor: r.UsesCursor, ConfigKeys: r.ConfigKeys}
}

// Fetch reads the fetch half of a response.
func (r Response) Fetch() FetchResult {
	return FetchResult{Cursor: r.Cursor, Warnings: r.Warnings, Items: r.Items}
}

// NewManifestResponse builds a successful manifest response.
func NewManifestResponse(manifest Manifest) Response {
	return Response{
		Protocol: Protocol, OK: true,
		Name: manifest.Name, Version: manifest.Version, Kinds: manifest.Kinds,
		UsesCursor: manifest.UsesCursor, ConfigKeys: manifest.ConfigKeys,
	}
}

// NewFetchResponse builds a successful fetch response. A source with nothing
// new omits `items` entirely, which Finn reads as an empty run.
func NewFetchResponse(result FetchResult) Response {
	return Response{
		Protocol: Protocol, OK: true,
		Cursor: result.Cursor, Warnings: result.Warnings, Items: result.Items,
	}
}

// NewErrorResponse builds the failure form. Finn also expects a non-zero exit
// code alongside it, which Serve takes care of.
func NewErrorResponse(err error) Response {
	message := "unknown error"
	if err != nil {
		message = err.Error()
	}
	return Response{Protocol: Protocol, OK: false, Error: message}
}

// NewFlowItem proposes a movement. A zero occurredAt is written as an empty
// string, which Finn accepts and sorts last.
func NewFlowItem(externalID string, occurredAt time.Time, raw string, draft FlowDraft) (Item, error) {
	encoded, err := json.Marshal(draft)
	if err != nil {
		return Item{}, fmt.Errorf("encode flow draft: %w", err)
	}
	return Item{ExternalID: externalID, Kind: KindFlow, OccurredAt: formatTime(occurredAt), Raw: raw, Draft: encoded}, nil
}

// NewRawItem hands over something the plugin could not parse. Note explains why,
// and the person finishes the job in the Inbox editor.
func NewRawItem(externalID string, occurredAt time.Time, raw, note string) Item {
	return Item{ExternalID: externalID, Kind: KindRaw, OccurredAt: formatTime(occurredAt), Raw: raw, Note: note}
}

// NewBalanceItem proposes a balance reading.
func NewBalanceItem(externalID string, occurredAt time.Time, raw string, draft BalanceDraft) (Item, error) {
	encoded, err := json.Marshal(draft)
	if err != nil {
		return Item{}, fmt.Errorf("encode balance draft: %w", err)
	}
	return Item{ExternalID: externalID, Kind: KindBalance, OccurredAt: formatTime(occurredAt), Raw: raw, Draft: encoded}, nil
}

// FlowDraft decodes a flow item's draft.
func (i Item) FlowDraft() (FlowDraft, error) {
	var draft FlowDraft
	if len(i.Draft) == 0 {
		return draft, errors.New("item carries no draft")
	}
	return draft, json.Unmarshal(i.Draft, &draft)
}

// Validate applies the rules Finn checks itself. Running it inside the plugin
// turns a rejected item into a fixable error at the source.
func (i Item) Validate() error {
	externalID := strings.TrimSpace(i.ExternalID)
	if externalID == "" {
		return errors.New("external_id is required")
	}
	if utf8.RuneCountInString(externalID) > MaxExternalIDLength {
		return fmt.Errorf("external_id is longer than %d characters", MaxExternalIDLength)
	}
	switch i.Kind {
	case KindFlow, KindBalance, KindRaw:
	default:
		return fmt.Errorf("unknown kind %q", i.Kind)
	}
	if i.OccurredAt != "" {
		if _, err := time.Parse(time.RFC3339, i.OccurredAt); err != nil {
			return fmt.Errorf("occurred_at must be RFC3339: %w", err)
		}
	}
	if i.Kind != KindRaw && len(i.Draft) == 0 {
		return fmt.Errorf("kind %q requires a draft", i.Kind)
	}
	if i.Kind == KindRaw && i.Raw == "" {
		return errors.New("kind \"raw\" requires the original text")
	}
	return nil
}

// Validate reports the response-level rules: unique keys and the size limit.
func (r FetchResult) Validate() error {
	if len(r.Items) > MaxItems {
		return fmt.Errorf("fetch returned %d items, the limit is %d", len(r.Items), MaxItems)
	}
	seen := make(map[string]struct{}, len(r.Items))
	for index, item := range r.Items {
		if err := item.Validate(); err != nil {
			return fmt.Errorf("item %d: %w", index, err)
		}
		externalID := strings.TrimSpace(item.ExternalID)
		if _, duplicate := seen[externalID]; duplicate {
			return fmt.Errorf("item %d: external_id %q appears twice in one response", index, externalID)
		}
		seen[externalID] = struct{}{}
	}
	return nil
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format(time.RFC3339)
}
