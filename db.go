package main

import (
	"database/sql"
	"log"

	// Добавляем github.com в начале путей импорта
	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

func initDB() *sql.DB {
	// Имя драйвера остается прежним — "sqlite3"
	db, err := sql.Open("sqlite3", "./budget.db")
	if err != nil {
		log.Fatal(err)
	}

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
		log.Fatal(err)
	}

	return db
}
