package finn

import "embed"

// FrontendFS contains the compiled web interface served by the application.
//
//go:embed frontend/dist
var FrontendFS embed.FS

// DemoSQL contains the initial dataset for demo mode.
//
//go:embed demo/demo.sql
var DemoSQL string

// MigrationFiles contains ordered database migrations.
//
//go:embed migrations/*.sql
var MigrationFiles embed.FS
