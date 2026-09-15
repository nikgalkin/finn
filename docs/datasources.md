# Datasources and the Inbox

A datasource lets Finn take data in from somewhere else - a chat bot, a bank statement, a synced folder - without giving up the three things the app is built on: everything stays local, nothing runs in the background, and data changes only when a person changes it.

The shape that satisfies all three is narrow on purpose:

1. You run a datasource by pressing a button. There is no schedule and no daemon.
2. The datasource is an external program. It writes JSON to stdout; it never touches the database.
3. What it returns lands in an **Inbox** as proposals. Cash Flow gets nothing until you accept it there.

Datasources are optional and off by default. Finn works exactly as before without them.

## Turning them on

The registry lives in `config.yml` and nowhere else:

```yaml
datasources:
  enabled: true
  plugins:
    - name: telegram
      path: "$HOME/.finn/plugins/finn-ds-telegram"
      sha256: "9f2b0c…c41a"
      timeout_seconds: 30
      env:
        FINN_DS_TELEGRAM_TOKEN: "123456:AA..."
      config:
        allowed_chat_ids: [12345678]
```

| Key | Meaning |
| --- | --- |
| `name` | How the source is referred to everywhere else. Lowercase letters, digits, `-` and `_`. |
| `path` | Absolute path to the binary. `$VARS` and a leading `~` are expanded; a bare command name is refused and never looked up in `PATH`. |
| `sha256` | Pins the exact binary. Optional but recommended - get it from `finn ds hash <path>`. |
| `timeout_seconds` | Wall clock for one run, default 30, capped at 300. |
| `disabled` | Keeps the entry in the file without letting it run. |
| `env` | The only variables the plugin receives, on top of a minimal `PATH`/`HOME`/`TMPDIR`. Secrets belong here. |
| `config` | Passed through to the plugin verbatim. Its keys are the plugin's business, so Finn does not rewrite them. |

A mistake in one entry does not stop Finn from starting. The entry is kept, marked as misconfigured, and the reason is shown on the Inbox page.

## Installing a plugin

Installation is deliberately manual, and there is no `finn ds install <url>`: downloading and running someone else's code on your machine is exactly what the rest of this page is about not doing by accident.

```bash
mkdir -p ~/.finn/plugins
# download the release binary for your platform, then:
chmod +x ~/.finn/plugins/finn-ds-telegram
finn ds hash ~/.finn/plugins/finn-ds-telegram
```

Paste the hash into `config.yml` under `sha256`, add the plugin's own `config` and `env` keys, and restart Finn.

## Using the Inbox

The **Inbox** page appears in the header once at least one datasource is registered, with a badge counting what is waiting.

* **Fetch** runs one source. Before the first fetch from a given binary, Finn asks for confirmation and shows you the path, the hash and what the plugin says it needs. The side-effect-free `manifest` command runs first so Finn can build that dialog.
* Items are grouped by month and read like the Cash Flow journal. A movement the plugin could not parse arrives as raw text with an empty editor rather than being dropped.
* **Editing** a row revalidates it immediately. An item that fails Finn's own rules is stored as *needs fixing* with the reason attached - the plugin never gets to write something invalid, and you never lose what it sent.
* **Accept** inserts the movement into Cash Flow. A proposal identical to a movement you already have is flagged as a duplicate, the same way CSV import flags one, and is skipped by bulk accept.
* **Reject** marks an item as unwanted and *keeps the row*. That row is what stops the next fetch from proposing the same thing again.

### Clearing the Inbox

Deleting rows is a separate, explicit action. Deduplication lives in the rows themselves, so anything you delete - including rejected items - can be proposed again by the next fetch. Finn says so before it does it.

### When a movement is deleted afterwards

If you accept an item and later delete the movement it created, the item shows up under the **Movement deleted** filter with a single button to put it back in the queue. Nothing is stored to make that happen: the state is derived on read from "this item points at a movement that no longer exists", so it is correct whether the movement was deleted from the journal directly or dropped while saving a month.

The other direction is deliberate too: **the proposal is never rewritten after it is accepted.** Correcting an amount in Cash Flow does not change what the Inbox says arrived. The item is a record of what the source proposed, not a mirror of your data.

## The security model, and its limits

The dangerous part of running external programs is not `exec` - it is being able to register an arbitrary path. So:

* **The registry is only in `config.yml`.** Neither the UI nor the HTTP API can add, edit or remove a plugin; they can only run one the file already describes. `/api/settings` writes JSON into the database and answers any caller on loopback, so a registry kept there would turn an XSS in the SPA, or any local process, into arbitrary code execution.
* **Absolute paths only**, with an explicit argv and no shell.
* **The hash is recomputed before every run.** A mismatch refuses the run and shows the hash actually on disk. Without `sha256` the plugin still runs, but the UI marks it unpinned.
* **File permissions are checked** on unix: a plugin that is group- or world-writable, or owned by another user, is refused.
* **The environment is scrubbed.** Only the keys under `env:` reach the plugin, plus a minimal `PATH`, `HOME` and `TMPDIR`. Secrets go through `env` and never through argv, which any process of your user can read out of `ps`.
* **Timeouts kill the whole process group**, and a response is capped at 1000 items and 8 MiB of stdout.
* **The plugin gets no database path, no connection and no API address.**
* **Demo mode never runs any of it.**

What this does **not** do is sandbox anything. A running plugin is an ordinary process with your rights: it can read your files and reach the network, and Finn does not restrict that. The honest boundary is "you deliberately installed this binary and pinned its hash", not isolation. A real sandbox means WebAssembly, and that is a separate piece of work - protocol v1 is defined so the runner can be replaced later without plugins changing.

There is also one gap worth naming: between hashing the file and executing it, a process running as you could swap it. Closing that needs execution by file descriptor, which is not portable enough to rely on today.

## Command line

Every command honours `--config`, and the ones that produce a report take `--json`.

| Command | What it does |
| --- | --- |
| `finn ds list` | Registered sources: path, hash, whether they are pinned, confirmed or orphaned, and how the last run went |
| `finn ds hash <path>` | The `sha256` to paste into `config.yml` |
| `finn ds manifest <name>` | Runs the plugin's `manifest` command and prints the raw answer |
| `finn ds fetch <name>` | Runs a source and files what it returns, exactly like the button |
| `finn ds fetch <name> --dry-run` | Runs it and prints the items without writing anything |
| `finn ds verify <path>` | Checks a binary against the protocol; see [the protocol document](plugin-protocol.md) |

Two things about these are worth stating outright:

* **`--dry-run` is a one-directional guarantee.** It promises only that *Finn* wrote nothing. By the time you see the output, the plugin has already talked to the outside world and may have acted there - replied in a chat, marked something as read.
* **These commands share the database with a running Finn.** WAL and a busy timeout are already configured, so concurrent writes do not fail, but a browser tab that is already open will not show new items until you reload the page.

## Writing your own

The contract is JSON, so a plugin can be written in any language. See [the plugin protocol](plugin-protocol.md); Go authors can use the dependency-free `dsproto` module and be done in about fifty lines.
