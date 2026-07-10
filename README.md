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
* **Advanced Analytics (FX Impact):** The analytics engine automatically separates organic growth (actual deposits/withdrawals) from paper growth (changes due to currency exchange rate fluctuations).
* **Asset Structure Breakdown by Tags:** A new interactive chart utilizing a mathematical Golden Ratio color-spacing framework for beautiful, high-contrast, macro-level asset allocation mapping.
* **Smart Relative Timeframes:** Clean timeframe presets (`6M`, `1Y`, `ALL`) along with a dynamic month-range input for flexible historical filtering.
* **Adaptive Currency Scaling:** Smart cross-rate rendering that automatically cross-converts and realigns low-nominal currencies (like UZS) relative to your asset base to avoid skewed flat-line visuals.
* **Math in Inputs:** Balance inputs support on-the-fly math evaluations. Type `15000 + 5000` directly into the input field, and it will compute the total instantly.
* **Local & Secure:** All data is stored locally in an SQLite database. No third-party cloud syncing, no telemetry.

## 🛠 Tech Stack

* **Backend:** Go, Gin framework, SQLite (using `json_extract` for advanced queries).
* **Frontend:** React, React Router, Recharts (for data visualization), Lucide React (icons).

## 📂 Project Structure

```text
.
├── bin/                  # Compiled binaries and startup scripts
│   ├── install.sh        # Linux/macOS install script
│   ├── install.ps1       # Windows PowerShell install script
│   └── up.sh             # Universal hot-rebuild startup script for dev purposes
│   └── gen-key.sh        # Generate secret for backup ciphering
├── frontend/             # React SPA (Vite ecosystem)
│   ├── src/              # Frontend source code (Pages, Components, Shared Hooks)
│   └── package.json      
├── main.go               # Go backend entry point
├── *.go                  # Go backend logic & API handlers
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
   ```

The script features **smart caching**: it will only rebuild the frontend or recompile the backend if it detects changes in your source files, making subsequent startups lightning fast! ⚡️

## 📝 Usage Tips and Screenshots

* **Currency Choice:** Be sure to configure your Base Currency before adding your first historical data point to sync and lock your historical exchange rates correctly.
* **Adding a Snapshot:** Click "New Snapshot". You can automatically copy balances from your previous month to save time. It also features automatic background session draft caching.
* **Isolating Legends:** Double-click on any item in the chart legends to instantly isolate that specific organization, currency, or asset tag. Single-click to toggle visibility.

Overview:
![Overview](media/overview.jpg)

History & Advanced Analytics:
![History](media/history.jpg)
