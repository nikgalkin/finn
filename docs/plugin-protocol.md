# Datasource plugin protocol, version 1

A plugin is a one-shot program. Finn runs `<binary> <command>`, writes a JSON request to stdin and reads a JSON response from stdout. Diagnostics go to stderr and end up in the run log. There are no daemons, no sockets, and no access to Finn's database.

The contract is JSON, so any language works. Two things make it concrete:

* [`docs/ds-protocol.schema.json`](ds-protocol.schema.json) — the schema, published as a release asset.
* `finn ds verify <path>` — the arbiter. It runs your binary through the checks Finn itself would apply and prints a report. Compatibility is decided by behaviour, not by declaration, which is why this works regardless of language.

## Commands

| Command | Purpose |
| --- | --- |
| `manifest` | Describe the plugin. **No side effects and no network.** Finn calls it to show what a plugin is and what it asks for, before any confirmation. |
| `fetch` | Do the actual work and return items. |

Anything else must exit non-zero and print the error form.

## Request

Written to stdin for every command:

```json
{
  "protocol": 1,
  "command": "fetch",
  "source": "telegram",
  "cursor": "884213551",
  "config": { "allowed_chat_ids": [12345] },
  "timeout_ms": 30000,
  "now": "2026-08-11T10:00:00+03:00",
  "known_currencies": ["RUB", "USD", "EUR"],
  "known_accounts": ["Bank", "Broker"],
  "known_tags": ["cash", "stocks"],
  "known_categories": ["salary", "purchase"]
}
```

`config` is the plugin's own block from `config.yml`, passed through unchanged.

The `known_*` lists exist so a plugin can normalize what it recognized against the user's settings — turning `bank` into the account they actually configured — instead of guessing. `known_currencies` leads with the base currency, which is the sensible default when a message does not name one. **Balances and movement history are never sent.**

`now` is the clock Finn stamped the request with; prefer it over your own so a dry run and a real run agree on what "this month" means. `timeout_ms` is how long you have before Finn kills your process group.

## Manifest response

```json
{
  "protocol": 1,
  "ok": true,
  "name": "telegram",
  "version": "1.0.0",
  "kinds": ["flow", "raw"],
  "uses_cursor": true,
  "config_keys": [
    { "key": "allowed_chat_ids", "required": true, "secret": false },
    { "key": "token", "required": true, "secret": true, "env": "FINN_DS_TELEGRAM_TOKEN" }
  ]
}
```

`config_keys` is what the confirmation dialog shows before the first run, so list everything you read — including anything you expect through `env`.

## Fetch response

```json
{
  "protocol": 1,
  "ok": true,
  "cursor": "884213599",
  "warnings": ["2 messages were not parsed"],
  "items": [
    {
      "external_id": "tg:12345:884213552",
      "kind": "flow",
      "occurred_at": "2026-08-11T09:41:00+03:00",
      "raw": "-3500 Pyaterochka #groceries",
      "note": "",
      "draft": {
        "month": "2026-08",
        "entryType": "external",
        "direction": "out",
        "counterparty": "Pyaterochka",
        "currency": "RUB",
        "amount": 3500,
        "category": "groceries"
      }
    }
  ]
}
```

A source with nothing new returns `ok` with no items. `items` may be omitted entirely.

### Item kinds

| Kind | Meaning |
| --- | --- |
| `flow` | A proposed movement. `draft` uses the same field names as Finn's flow entry API. |
| `raw` | Something you could not parse. Send the text in `raw` and say why in `note` — the person finishes it in the Inbox editor. **Never drop a message silently.** |
| `balance` | A balance reading. Protocol v1 carries it so plugins can be written against a stable shape; Finn 1.10 stores and displays these but does not apply them to a snapshot yet. |

### `external_id` is the idempotency key

Finn stores it with a unique index per source, so re-fetching the same thing changes nothing. Make it stable and unique for all time — `tg:<chat>:<update>` rather than a row number. It must be at most 512 characters and unique within a single response too; surrounding whitespace is ignored when Finn compares IDs.

This is also what makes rejection stick: a rejected item stays in the Inbox precisely so its key keeps the next fetch from proposing it again.

## Errors

```json
{ "protocol": 1, "ok": false, "error": "telegram api: 401 unauthorized" }
```

Print this **and exit non-zero.** A failed run does not move the cursor, and the message is what the user sees.

## What Finn checks itself

Nothing a plugin sends is trusted:

* An unknown `protocol` value is refused outright; nothing is written.
* An item with an empty `external_id`, an unknown `kind`, or a duplicate key inside one response is dropped with a warning.
* A `flow` draft is revalidated by Finn's own rules. **An invalid draft is not dropped** — it is stored as *needs fixing* with the reason attached, so the person can repair it.
* An `occurred_at` that is not RFC3339 is cleared, with a note; the item survives.
* Items and the cursor are written in **one transaction**. A cursor never gets committed without the items it stands for, because a source usually cannot hand them over twice.
* Limits: 1000 items and 8 MiB of stdout per response, and the timeout from the config. Exceeding any of them fails the run without writing anything.

## Cursors

The cursor is an opaque string Finn stores and hands back on the next call. What it means is entirely yours — an update id, a timestamp, an ETag.

Two rules: an error must not advance it, and after Finn returns a cursor to you, items already covered by it must not come back. `finn ds verify` checks the second one by fetching twice.

## Writing one in Go

The `dsproto` module is the contract as Go types, with **no dependencies** beyond the standard library — which is the point: a plugin author should not inherit gin, viper and sqlite for three structs.

```bash
go get github.com/nikgalkin/finn/dsproto
```

```go
package main

import "github.com/nikgalkin/finn/dsproto"

type telegram struct{}

func (telegram) Manifest(dsproto.Request) (dsproto.Manifest, error) {
	return dsproto.Manifest{
		Name:    "telegram",
		Version: "1.0.0",
		Kinds:   []string{dsproto.KindFlow, dsproto.KindRaw},
		UsesCursor: true,
		ConfigKeys: []dsproto.ConfigKey{
			{Key: "token", Required: true, Secret: true, Env: "FINN_DS_TELEGRAM_TOKEN"},
		},
	}, nil
}

func (telegram) Fetch(request dsproto.Request) (dsproto.FetchResult, error) {
	var config struct {
		AllowedChatIDs []int64 `json:"allowed_chat_ids"`
	}
	if err := request.DecodeConfig(&config); err != nil {
		return dsproto.FetchResult{}, err
	}

	item, err := dsproto.NewFlowItem("tg:12345:884213552", request.NowTime(), "-3500 Pyaterochka", dsproto.FlowDraft{
		Month: "2026-08", Direction: "out", Counterparty: "Pyaterochka", Currency: "RUB", Amount: 3500,
	})
	if err != nil {
		return dsproto.FetchResult{}, err
	}
	return dsproto.FetchResult{Cursor: "884213599", Items: []dsproto.Item{item}}, nil
}

func main() { dsproto.Serve(telegram{}) }
```

`dsproto.Serve` handles argv, the request, the response envelope and the exit codes. Everything left is your own logic.

Finn's own runner does not import `dsproto`: it decodes the wire format with its own permissive types, because it must treat every field as untrusted input. The schema and `finn ds verify` are what keep the two sides honest — which is also why they, not the Go types, are the normative contract.

## Verifying

```bash
finn ds verify ./dist/finn-ds-telegram
```

```
🔍 Conformance report for /path/to/finn-ds-telegram
   sha256: f2e87a12…

✅ binary is runnable — sha256 f2e87a12…
✅ manifest answers — telegram 1.0.0
✅ manifest is complete
✅ manifest is repeatable
✅ unknown command is refused — exit 2, unknown command "definitely-not-a-command"
✅ fetch with an empty cursor — 2 item(s), 470 bytes
✅ every item is storable
✅ external_id is unique in one response
✅ response fits the limits
✅ drafts pass Finn's validation
✅ fetch respects its timeout — took 25ms
✅ fetch accepts its own cursor back — 0 new item(s) after the cursor
```

It exits non-zero if any check fails, so it belongs in your CI. `--source <name>` runs a plugin exactly as `config.yml` describes it, with its env and config, when the bare binary would have nothing to talk to.

Two caveats. Verification runs the plugin for real: `fetch` reaches whatever the plugin reaches. And "no side effects, no network" in `manifest` cannot be observed from outside, so the check stands in for it by calling `manifest` twice and comparing — a manifest that reads the world tends to answer differently.
