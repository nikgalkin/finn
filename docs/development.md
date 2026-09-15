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
├── dsproto/              # Datasource plugin contract, a separate zero-dependency module
├── frontend/             # React SPA
│   ├── src/              # Pages, components, and shared hooks
│   └── package.json
├── migrations/           # Embedded SQL database migrations
├── assets.go             # Embedded frontend, demo data, and migrations
├── go.work               # Wires dsproto in for local development
└── README.md
```

## The dsproto module

`dsproto/` is the datasource plugin contract, published as `github.com/nikgalkin/finn/dsproto` with its own `go.mod` and no dependencies at all. It is separate so a plugin author does not inherit gin, viper and sqlite for three structs. The dependency direction is one-way:

```text
finn (root module)  ──▶ dsproto ◀── finn-ds-telegram (someone else's repository)
```

`./...` in the repository root does not reach a nested module, so its tests run on their own:

```shell
go test ./dsproto/...
```

Local development goes through `go.work` rather than a `replace` directive: `go.work` is ignored once a module is downloaded, so it cannot follow the module into anyone else's build. Releases are tagged as `dsproto/v1.0.0`, which is how Go versions a nested module.

Finn's own runner deliberately does not import `dsproto`. It decodes the wire format into its own permissive structs, because everything a plugin sends is untrusted input. What keeps the two sides from drifting is `docs/ds-protocol.schema.json`, checked against the runner's types in `ds_schema_test.go`, and `finn ds verify`, which decides compatibility by behaviour.

[Back to the README](../README.md)
