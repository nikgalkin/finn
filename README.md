# 📈 Finn — Personal Net Worth Tracker

Finn is a net worth tracker for people with accounts in multiple countries and currencies. Think of it as Git for your net worth: take a snapshot of your financial state once a month and see how it evolves over time

No daily expense tracking. No budgets. No mandatory transaction history. Just snapshots.

## Why Finn exists

Finn is for people whose finances span accounts in several countries and currencies. As this setup grows, adding new financial organizations and currencies to Google Sheets becomes increasingly difficult. Finn was created as a simple, local, and easily extensible alternative that can adapt as financial needs change

## ✨ Features

* **Monthly snapshots:** Save balances across your organizations and accounts once a month
* **Multi-currency tracking:** Choose base and secondary currencies and track global assets without forcing every account into the same currency
* **Balance tags:** Label balances with tags such as `cash`, `checking`, `stocks`, or `deposit` to understand your asset allocation
* **Advanced analytics:** Separate actual balance growth from the paper impact of exchange-rate changes
* **Asset structure:** Explore an interactive breakdown of your portfolio by balance tag
* **Flexible timeframes:** Switch between `6M`, `1Y`, `ALL`, or a custom month range
* **Adaptive currency scaling:** Automatically cross-convert low-nominal currencies so charts remain readable
* **Math in inputs:** Enter expressions such as `15000 + 5000` directly in a balance field
* **Local and private:** Store all data locally in SQLite, with no cloud sync or telemetry
* **Multi-target backups:** Create encrypted or raw backups in multiple local or cloud-synced folders, each with its own retention policy
* **Local AI assistant:** Analyze selected snapshots and precomputed metrics with a local model, or copy the prepared prompt to another AI tool

### Optional Cash Flow

> [!NOTE]
> Cash Flow is an additional, optional feature. It complements monthly snapshots with a journal of incoming, outgoing, and internal movements, but it is not required: Finn's core net worth tracking works without enabling or maintaining cash flow data

When enabled, Cash Flow also provides:

* **Transfers and currency exchanges:** Record separate sent and received amounts between your accounts without treating them as income or spending
* **Estimated capital return:** Reconcile balance changes, external flows, and FX impact into an approximate earnings amount and rate, including breakdowns by balance tag when movements are assigned to accounts
* **CSV import:** Import existing movements through a validated preview with duplicate detection

## 📚 Documentation

* [Installation](docs/installation.md) — install Finn on Linux, macOS, or Windows
* [Example configuration](demo/config.yml) — use the sample app, database, and backup settings as a starting point
* [Usage guide and screenshots](docs/usage.md) — configure currencies, create snapshots, and work with charts
* [Optional Cash Flow](docs/cash-flow.md) — enable the journal and import movements from CSV
* [Backups and recovery](docs/backups.md) — configure targets, encryption, retention, and restore a backup
* [Local AI Assistant](docs/local-ai.md) — connect a local model or prepare a prompt for another AI tool
* [Development](docs/development.md) — prerequisites, project structure, tech stack, and local startup
* [Release pipeline](docs/releases.md) — CI checks, automatic versioning, tags, artifacts, and release publication
