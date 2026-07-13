package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	appassets "finn"
	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

func resolveDatabasePath(filename string) string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Printf("⚠️  DB: Failed to detect home directory: %v\n", err)
		homeDir = "."
	}

	searchPaths := []string{
		filepath.Join(homeDir, ".finn", filename),
		filepath.Join(".", filename),
	}

	for _, path := range searchPaths {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	defaultPath := searchPaths[0]
	dir := filepath.Dir(defaultPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Printf("⚠️  DB: Failed to create directory %s: %v. Using fallback.\n", dir, err)
		return filename
	}

	return defaultPath
}

func initDB(cfg *Config, isDemo bool) *sql.DB {
	dbFilename := cfg.Database.Filename
	if isDemo {
		dbFilename = cfg.Database.DemoFilename
		log.Println("ℹ️  DB: Running in isolated DEMO environment.")
	}

	dbPath := resolveDatabasePath(dbFilename)

	log.Printf("ℹ️  DB: Connecting to SQLite storage: %s\n", dbPath)
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("❌ DB CRITICAL: Failed to open attachment point: %v\n", err)
	}

	db.SetMaxOpenConns(1)

	// Enable WAL mode and set a busy timeout to prevent 'database is locked' errors
	if _, err := db.Exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;"); err != nil {
		log.Printf("⚠️  DB: Failed to set PRAGMAs (WAL/busy_timeout): %v\n", err)
	}

	createTableQuery := `
	CREATE TABLE IF NOT EXISTS snapshots (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		month TEXT UNIQUE NOT NULL,
		data TEXT NOT NULL,
		duration_seconds INTEGER DEFAULT 0
	);
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`
	_, err = db.Exec(createTableQuery)
	if err != nil {
		log.Fatalf("❌ DB CRITICAL: Migration failed: %v\n", err)
	}

	// Попытка добавить колонку в старую бд, если она была создана ранее без нее
	_, _ = db.Exec("ALTER TABLE snapshots ADD COLUMN duration_seconds INTEGER DEFAULT 0")

	if isDemo {
		var count int
		err := db.QueryRow("SELECT COUNT(*) FROM snapshots").Scan(&count)
		if err == nil && count == 0 {
			log.Println("🌱 DB: Populating fresh demo workspace from demo/demo.sql...")
			_, err = db.Exec(appassets.DemoSQL)
			if err != nil {
				log.Printf("⚠️  DB: Population failed: %v\n", err)
			} else {
				log.Println("✅ DB: Demo seed injector finalized!")
			}
		}
	}

	appliedMigrations, err := runMigrations(db)
	if err != nil {
		log.Fatalf("❌ DB CRITICAL: Migration failed: %v\n", err)
	}
	for _, migration := range appliedMigrations {
		log.Printf("✅ DB: Applied migration %03d (%s).\n", migration.version, migration.name)
	}

	return db
}

type appliedMigration struct {
	version int
	name    string
}

func migrationVersion(name string) (int, error) {
	separator := strings.IndexByte(name, '_')
	if separator <= 0 {
		return 0, fmt.Errorf("migration filename %q must start with a numeric version", name)
	}
	version, err := strconv.Atoi(name[:separator])
	if err != nil || version <= 0 {
		return 0, fmt.Errorf("migration filename %q has an invalid version", name)
	}
	return version, nil
}

func runMigrations(db *sql.DB) ([]appliedMigration, error) {
	entries, err := appassets.MigrationFiles.ReadDir("migrations")
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	seenVersions := make(map[int]string)
	var applied []appliedMigration
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		version, err := migrationVersion(entry.Name())
		if err != nil {
			return nil, err
		}
		if existing, duplicate := seenVersions[version]; duplicate {
			return nil, fmt.Errorf("migrations %q and %q use the same version", existing, entry.Name())
		}
		seenVersions[version] = entry.Name()

		var alreadyApplied int
		if err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = ?", version).Scan(&alreadyApplied); err != nil {
			return nil, err
		}
		if alreadyApplied > 0 {
			continue
		}

		migrationSQL, err := appassets.MigrationFiles.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return nil, err
		}
		tx, err := db.Begin()
		if err != nil {
			return nil, err
		}
		if _, err := tx.Exec(string(migrationSQL)); err != nil {
			_ = tx.Rollback()
			return nil, fmt.Errorf("apply %s: %w", entry.Name(), err)
		}
		if _, err := tx.Exec("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", version, entry.Name()); err != nil {
			_ = tx.Rollback()
			return nil, fmt.Errorf("record %s: %w", entry.Name(), err)
		}
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("commit %s: %w", entry.Name(), err)
		}
		applied = append(applied, appliedMigration{version: version, name: entry.Name()})
	}
	return applied, nil
}

func handleForceDemoCleanup() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}

	possiblePaths := []string{
		filepath.Join(homeDir, ".finn", "finn-demo.db"),
		filepath.Join(".", "finn-demo.db"),
	}

	for _, path := range possiblePaths {
		if _, err := os.Stat(path); err == nil {
			log.Printf("🔥 Force Demo: Erasing historical demo file: %s\n", path)
			_ = os.Remove(path)
		}
	}
}
