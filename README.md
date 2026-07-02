# 📈 Personal Net Worth Tracker

A lightweight, fast, and feature-rich personal finance dashboard to track your net worth over time. Built with **Go** and **React**, it supports multi-currency accounts, real-time exchange rates, and advanced financial metrics like FX Impact (Currency Translation Effect).

## ✨ Features

* **Monthly Snapshots:** Save the state of your balances across different organizations and accounts once a month.
* **Multi-Currency Support:** Keep balances in RUB, USD, EUR, TRY, UZS, etc., and see your total net worth unified in your base currency.
* **Auto-Fetch Rates:** Automatically pulls the latest exchange rates via API.
* **Advanced Analytics (FX Impact):** The dashboard separates organic growth (actual deposits/withdrawals) from paper growth (changes due to currency exchange rate fluctuations).
* **Interactive Charts:** Beautiful, collapsible area and line charts built with Recharts, with togglable legends to focus on specific data.
* **Local & Secure:** All data is stored locally in an SQLite database. No third-party cloud syncing.

## 🛠 Tech Stack

* **Backend:** Go, Gin framework, SQLite (using `json_extract` for advanced queries).
* **Frontend:** React, React Router, Recharts (for data visualization), Lucide React (icons).
* **Styling:** Custom Glassmorphism UI (Tailwind CSS).

## 📂 Project Structure

```text
.
├── bin/                  # Compiled binaries and startup scripts
│   └── run.sh            # Universal startup script
├── frontend/             # React SPA (Vite/CRA)
│   ├── src/              # Frontend source code
│   └── package.json      
├── main.go               # Go backend entry point
├── ...                   # Go backend logic & API handlers
└── README.md
```

## 🚀 Getting Started

### Prerequisites
Make sure you have the following installed on your machine:
* [Go](https://golang.org/dl/) (1.20+)
* [Node.js](https://nodejs.org/) & npm

### Running the App
We use a universal Bash script that automatically builds the React frontend, compiles the Go backend, and opens the app in your default browser.

1. Make the script executable (only needed once):
   ```shell
   chmod +x bin/run.sh
   ```

2. Start the application:
   ```shell
   ./bin/run.sh
   ```

The script features **smart caching**: it will only rebuild the frontend or recompile the backend if it detects changes in your source files, making subsequent startups lightning fast! ⚡️

## 📝 Usage Tips and screenshots

* **Adding a Snapshot:** Click "New Snapshot". You can automatically copy balances from your previous month to save time.
* **Exchange Rates:** Make sure to click "Fetch Rates" when creating a snapshot to get accurate conversions.
* **Math in Inputs:** The balance inputs support basic math! You can type `15000 + 5000` directly into the amount field, and it will calculate the total automatically when you press Enter or click away.

Overview:
![Overview](media/overview.jpg)
History:
![History](media/history.jpg)
