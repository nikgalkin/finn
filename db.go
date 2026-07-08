package main

import (
	"database/sql"
	_ "embed"
	"log"
	"os"
	"path/filepath"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

//go:embed demo/demo.sql
var demoSQL string

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

	createTableQuery := `
	CREATE TABLE IF NOT EXISTS snapshots (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		month TEXT UNIQUE NOT NULL,
		data TEXT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
	`
	_, err = db.Exec(createTableQuery)
	if err != nil {
		log.Fatalf("❌ DB CRITICAL: Migration failed: %v\n", err)
	}

	if isDemo {
		var count int
		err := db.QueryRow("SELECT COUNT(*) FROM snapshots").Scan(&count)
		if err == nil && count == 0 {
			log.Println("🌱 DB: Populating fresh demo workspace from demo/demo.sql...")
			_, err = db.Exec(demoSQL)
			if err != nil {
				log.Printf("⚠️  DB: Population failed: %v\n", err)
			} else {
				log.Println("✅ DB: Demo seed injector finalized!")
			}
		}
	}

	return db
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
