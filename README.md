# 📈 Finn - Personal Net Worth Tracker

A net worth tracker for people with multiple accounts and currencies. Like Git, but for your net worth.

Take monthly snapshots of your financial state and watch your wealth evolve over time.

No expense tracking.
No budgets.
No transaction imports.

Just snapshots.

## Installation

### Quick Install (Linux & macOS)

You can install the latest version of `finn` automatically using the one-liner command below. It detects your operating system and CPU architecture, downloads the correct executable, bypasses macOS Gatekeeper quarantine attributes, and moves it to your local path:

```bash
curl -fsSL https://raw.githubusercontent.com/nikgalkin/finn/master/bin/install.sh | sh
```

### Quick Install (Windows PowerShell)

Open your PowerShell terminal and run the following command to download and install the latest Windows binary:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/nikgalkin/finn/master/bin/install.ps1 | iex"
```

## ✨ Features

* **Monthly Snapshots:** Save the state of your balances across different organizations and accounts once a month.
* **Flexible Multi-Currency Architecture:** Completely redesigned currency system. Set your preferred **Base** and **Secondary** currencies during initial setup to track your global assets seamlessly.
* **Balance Tagging:** Label individual balances with custom tags (`cash`, `checking`, `stocks`, `deposit`) to categorize your portfolio by asset type or purpose.
* **Optional Cash Flow Journal:** Keep incoming, outgoing, and internal transfer movements in one monthly journal. External movements can optionally be assigned to one of your own accounts, and existing data can be imported from a validated CSV preview.
* **Integrated Transfers & Currency Exchanges:** A Cash Flow movement can move separate sent and received amounts between your accounts, so P2P exchanges remain visible without becoming income or spending.
* **Estimated Capital Return:** Analytics reconciles balance change, recorded external flow, and FX impact into an approximate earnings amount and rate. Account-assigned movements also enable a breakdown by balance tags such as `deposit` and `stocks`.
* **Advanced Analytics (FX Impact):** The analytics engine automatically separates organic growth (actual deposits/withdrawals) from paper growth (changes due to currency exchange rate fluctuations).
* **Asset Structure Breakdown by Tags:** A new interactive chart utilizing a mathematical Golden Ratio color-spacing framework for beautiful, high-contrast, macro-level asset allocation mapping.
* **Smart Relative Timeframes:** Clean timeframe presets (`6M`, `1Y`, `ALL`) along with a dynamic month-range input for flexible historical filtering.
* **Adaptive Currency Scaling:** Smart cross-rate rendering that automatically cross-converts and realigns low-nominal currencies (like UZS) relative to your asset base to avoid skewed flat-line visuals.
* **Math in Inputs:** Balance inputs support on-the-fly math evaluations. Type `15000 + 5000` directly into the input field, and it will compute the total instantly.
* **Local & Secure:** All data is stored locally in an SQLite database. No third-party cloud syncing, no telemetry.
* **Multi-Target Backups:** Create encrypted or raw backups in independent local and cloud-synced folders, with per-target retention and status reporting.
* **Local AI Assistant with Prompt Fallback:** Chat with a local model through LM Studio or another loopback OpenAI-compatible server. If no model is connected, Finn can prepare and copy the same request with selected snapshots and precomputed metrics for use elsewhere.

## 🛠 Tech Stack

* **Backend:** Go, Gin framework, SQLite (using `json_extract` for advanced queries).
* **Frontend:** React, React Router, Recharts (for data visualization), Lucide React (icons).

## Cash Flow CSV format

Cash Flow accepts UTF-8 CSV files separated with semicolons (`;`). Decimal values may use either a dot or a comma. Each row is one movement. The preview marks rows that already exist or repeat inside the file; exact duplicates are skipped by default and can be explicitly included with the import checkbox.

```csv
month;entry_type;direction;counterparty;account;amount;currency;tax_rate;category;comment;to_account;to_amount;to_currency
2026-01;external;in;Acme;Broker;5000;USD;6;Salary;January salary;;;
2026-01;external;out;Landlord;Bank;85000;RUB;0;Rent;;;;
2026-01;transfer;;;Bank;116850.77;RUB;;;Exchange to USD;Broker;1500.258;USD
```

Every row requires `month`, `amount`, and `currency`; months use `YYYY-MM` and amounts are positive. `entry_type` is optional and defaults to `external`.

For an external movement, `direction` must be `in` or `out` and `counterparty` is required. `account` is optional and should match an organization name when the movement needs to participate in return estimates by balance tag. `tax_rate` is a percentage from `0` to `100` that only applies to incoming entries; `category` and `comment` are optional.

For a transfer, set `entry_type` to `transfer`. The `account`, `amount`, and `currency` fields describe what was sent; `to_account`, `to_amount`, and `to_currency` describe what was received. Source and destination must differ by account or currency. Leave `direction`, `counterparty`, `tax_rate`, and `category` empty; `comment` remains optional. Transfers stay in the journal but are excluded from income and spending.

## 📂 Project Structure

```text
.
├── bin/                  # Compiled binaries and startup scripts
│   ├── install.sh        # Linux/macOS install script
│   ├── install.ps1       # Windows PowerShell install script
│   └── up.sh             # Universal hot-rebuild startup script for dev purposes
├── frontend/             # React SPA (Vite ecosystem)
│   ├── src/              # Frontend source code (Pages, Components, Shared Hooks)
│   └── package.json      
├── cmd/finn/             # Go entry point, backend logic, API handlers, and tests
├── demo/                 # Demo dataset embedded into the application
├── migrations/           # Embedded SQL database migrations
├── assets.go             # Embedded frontend, demo data, and migrations
└── README.md
```

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed on your machine:

* [Go](https://golang.org/dl/) (1.20+)
* [Node.js](https://nodejs.org/) & npm

### Run debug

We use a universal Bash script that automatically builds the React frontend, compiles the Go backend, and opens the app in your default browser with demo dataset

1. Start the application:

   ```shell
   ./bin/up.sh --demo

   # Rebuild both frontend and backend even when no changes are detected.
   # Other flags are still forwarded to finn.
   ./bin/up.sh --force-build --demo
   ```

The script features **smart caching**: it will only rebuild the frontend or recompile the backend if it detects changes in your source files, making subsequent startups lightning fast! ⚡️

## 💾 Backups

Backups are disabled by default and Finn does not create a default target automatically. To enable them, create `~/.finn/config.yaml` (or `config.yaml` in the current working directory) and configure at least one target:

```yaml
backup:
  enabled: true
  only_if_changed: true
  interval_hours: 12
  targets:
    - name: local_storage
      path: "$HOME/.finn/backups"
      retention: 10
```

Each target is independent, so a local directory can be combined with Google Drive or another synced folder:

```yaml
    - name: google_drive
      path: "$HOME/Library/CloudStorage/GoogleDrive-account/My Drive/FinnBackups"
      retention: 10
```

* `only_if_changed` avoids creating another file when the logical database contents have not changed.
* `interval_hours` controls scheduled backups while Finn is running. Finn also runs a synchronized backup during normal shutdown.
* `retention` is applied per target and defaults to `10` when omitted or set to a non-positive value.
* Target paths support environment variables such as `$HOME`.

Backup filenames include the Finn version that created them without dots, for example `finn_backup_2026_07_20_183000_v140_<fingerprint>.enc`. Local development builds use `vdev`.

Finn reports each target separately:

* **Green — Backup created:** the file was written, read back successfully, and retention completed.
* **Blue — Already up to date:** the existing backup matches the current database.
* **Orange — Backup created with warnings:** the file was written, but Finn could not verify it or inspect/rotate the directory. The new copy exists, but old backups may not be cleaned up.
* **Red — Failed:** Finn could not write a backup file to that target.

For cloud-backed folders, the process that launches Finn needs both read and write access. On macOS, Terminal and the VS Code integrated terminal can have different privacy permissions. If reading is denied but writing is allowed, Finn still attempts to create the backup and reports the target in orange.

### Encryption and recovery

Set `backup.cipher_key` in `~/.finn/config.yaml` to encrypt new backups with AES-256-GCM. Generate a 256-bit random key directly with Finn:

```shell
finn backup generate-key
```

The command prints the generated key together with a ready-to-copy configuration snippet. Copy the value into the persistent configuration rather than a shell session:

```yaml
backup:
  enabled: true
  cipher_key: "paste-the-generated-key-here"
```

Restrict access to the configuration file because it contains the key:

```shell
chmod 600 ~/.finn/config.yaml
```

For automation, `finn backup generate-key --raw` prints only the Base64 key.

Keep this key somewhere safe: encrypted backups cannot be recovered without it. Without `backup.cipher_key`, Finn writes unencrypted `.db` files and logs a warning.

List configured targets and their readable backup files:

```shell
finn backup list
```

Restore an encrypted `.enc` or unencrypted `.db` backup before starting Finn normally:

```shell
finn backup restore /path/to/finn_backup_file.enc
```

## 🤖 Local AI Assistant (Experimental)

Finn can connect to a model served locally by [LM Studio](https://lmstudio.ai/). Download and load an instruction-tuned model, then start the local server:

```shell
lms server start
lms load <model-key> --context-length 32768 --gpu max
```

The familiar chat interface also works without a connected model: choose the context and tone, write a request, then preview and copy the prepared prompt to any AI tool.

Open the optional **Local AI** section at the bottom of Settings to configure the connection and select a chat model. The default endpoint is `http://127.0.0.1:1234/v1`. For privacy, Finn only accepts loopback server addresses.

LM Studio mode uses its native stateful chat API with reasoning disabled for responsive everyday analysis. The first message processes the complete financial context; subsequent messages reuse the local conversation state. Finn automatically starts a new context when the financial dataset changes.

The Assistant page lets you limit context to the latest 1, 2, 3, 6, 12, or 24 months, use the complete history, or select an exact month range. You can choose a strict, balanced, or playful response tone. Connected local models answer directly in the existing Markdown chat; without one, the composer opens the same context plus request as a copyable prompt.

## 📝 Usage Tips and Screenshots

* **Currency Choice:** Be sure to configure your Base Currency before adding your first historical data point to sync and lock your historical exchange rates correctly.
* **Adding a Snapshot:** Click "New Snapshot". You can automatically copy balances from your previous month to save time. It also features automatic background session draft caching.
* **Cash Flow:** Enable the optional section in Settings to add incoming, outgoing, and transfer movements by month. Transfers live in the same journal but are excluded from income and spending. Assign external movements to an own account when you want return estimates for a specific `deposit`, `stocks`, or other balance tag.
* **Isolating Legends:** Double-click on any item in the chart legends to instantly isolate that specific organization, currency, or asset tag. Single-click to toggle visibility.

Overview:
![Overview](media/overview.jpg)

History & Advanced Analytics:
![History](media/history.jpg)
