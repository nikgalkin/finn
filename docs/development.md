# Development

## Tech stack

* **Backend:** Go, Gin, and SQLite.
* **Frontend:** React, React Router, Recharts, and Lucide React.

## Prerequisites

Install:

* [Go](https://go.dev/dl/) 1.25 or newer.
* [Node.js](https://nodejs.org/) and npm.

## Run locally

The universal startup script builds the React frontend, compiles the Go backend, and opens the application with the demo dataset in your default browser:

```shell
./bin/up.sh --demo
```

Use `--force-build` to rebuild both the frontend and backend even when no changes are detected. Other flags are still forwarded to Finn.

```shell
./bin/up.sh --force-build --demo
```

The script caches build results and rebuilds only when it detects relevant source changes.

## Releases

Successful pushes to `master` are tested, versioned, tagged, and published automatically. Prefer a source branch such as `feat-v1.8.1` when the release version is known; otherwise, use `#major`, `#minor`, or `#bugfix` in the final commit message.

See [Release Pipeline](releases.md) for the complete workflow, version precedence, artifacts, manual releases, and retry behavior.

## Project structure

```text
.
├── bin/                  # Installers and development startup scripts
│   ├── install.sh        # Linux/macOS installer
│   ├── install.ps1       # Windows PowerShell installer
│   ├── next-version.sh   # Semantic version calculation for releases
│   └── up.sh             # Local hot-rebuild startup script
├── cmd/finn/             # Go entry point, backend logic, API handlers, and tests
├── demo/                 # Demo dataset embedded into the application
├── docs/                 # User and developer documentation
├── frontend/             # React SPA
│   ├── src/              # Pages, components, and shared hooks
│   └── package.json
├── migrations/           # Embedded SQL database migrations
├── assets.go             # Embedded frontend, demo data, and migrations
└── README.md
```

[Back to the README](../README.md)
