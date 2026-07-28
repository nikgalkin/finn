# 📈 Finn — Personal Net Worth Tracker

Finn is a local-first net worth tracker built around monthly snapshots. Think of it as Git for your net worth: capture your financial state once a month and see how it evolves over time

No daily expense tracking. No budgets. No mandatory transaction history. Just snapshots.

## Why Finn exists

Finn grew out of the friction of maintaining an increasingly complex financial setup in Google Sheets. Each new financial organization or currency made the spreadsheet harder to extend, so Finn was created as a simple, local alternative that can adapt as financial needs change

## ✨ Features

* **Monthly snapshots:** Save balances across your organizations and accounts once a month
* **Multi-currency tracking:** Choose base and secondary currencies and track global assets without forcing every account into the same currency
* **Balance tags:** Label balances with tags such as `cash`, `checking`, `stocks`, or `deposit` to understand your asset allocation
* **Advanced analytics:** Separate actual balance growth from the paper impact of exchange-rate changes
* **Asset structure:** Explore an interactive breakdown of your portfolio by balance tag
* **Flexible timeframes:** Switch between `6M`, `1Y`, `ALL`, or a custom month range
* **Adaptive currency scaling:** Automatically cross-convert low-nominal currencies so charts remain readable
* **Math in inputs:** Enter expressions such as `15000 + 5000` directly in a balance field
* **Local and private:** Store all data locally in SQLite, with no cloud sync or telemetry. The only outbound request is the optional exchange-rate fetch, which asks a public currency API for the rates of the currencies you track and never sends your balances
* **Multi-target backups:** Create raw backups or ones encrypted with quantum-resistant AES-256-GCM in multiple local or cloud-synced folders, each with its own retention policy
* **Local AI assistant:** Analyze selected snapshots and precomputed metrics with a local model, or copy the prepared prompt to another AI tool
* **Data utilities:** Scan data health, inspect and verify restore points, and export selected periods as portable JSON or a CSV bundle
* **SQL editor:** Fix data directly when the UI is the long way round — click any result cell to build an `UPDATE` for it, including ranges and JSON fields, then dry run it to see what would change before anything is saved

### Optional Cash Flow

> [!NOTE]
> Cash Flow is an additional, optional feature. It complements monthly snapshots with a journal of incoming, outgoing, and internal movements, but it is not required: Finn's core net worth tracking works without enabling or maintaining cash flow data

When enabled, Cash Flow also provides:

* **Transfers and currency exchanges:** Record separate sent and received amounts between your accounts without treating them as income or spending
* **Estimated capital return:** Reconcile balance changes, external flows, and FX impact into an approximate earnings amount and rate, including breakdowns by balance tag. Movements participate through either a tag set directly on the movement or the balance tags of its assigned account
* **Earnings or unrecorded spending:** Mark tags such as `cash` or `checking` as non-yielding, and analytics reads their unexplained change as estimated spending instead of capital earnings
* **CSV import:** Import existing movements through a validated preview with duplicate detection

## 📚 Documentation

* [Installation](docs/installation.md) — install Finn on Linux, macOS, or Windows
* [Example configuration](demo/config.yml) — use the sample app, database, and backup settings as a starting point
* [Usage guide and screenshots](docs/usage.md) — configure currencies, create snapshots, and work with charts
* [Optional Cash Flow](docs/cash-flow.md) — enable the journal and import movements from CSV
* [Backups and recovery](docs/backups.md) — configure targets, encryption, retention, and restore a backup
* [Local AI Assistant](docs/local-ai.md) — connect a local model or prepare a prompt for another AI tool
* [Tools](docs/tools.md) — run data-health checks, inspect backups, export data, or make protected direct fixes with the SQL editor
* [Development](docs/development.md) — prerequisites, project structure, tech stack, and local startup
* [Release pipeline](docs/releases.md) — CI checks, automatic versioning, tags, artifacts, and release publication
