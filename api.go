package main

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

type SnapshotRequest struct {
	Month string `json:"month" binding:"required"`
	Data  string `json:"data" binding:"required"`
}

func setupAPI(r *gin.Engine, db *sql.DB) {
	api := r.Group("/api")

	api.GET("/snapshots", func(c *gin.Context) {
		rows, err := db.Query("SELECT id, month, data FROM snapshots ORDER BY month DESC")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var snapshots []gin.H
		for rows.Next() {
			var id int
			var month string
			var data string
			if err := rows.Scan(&id, &month, &data); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			snapshots = append(snapshots, gin.H{"id": id, "month": month, "data": data})
		}
		c.JSON(http.StatusOK, snapshots)
	})

	api.GET("/snapshots/:month", func(c *gin.Context) {
		month := c.Param("month")
		var id int
		var data string
		err := db.QueryRow("SELECT id, data FROM snapshots WHERE month = ?", month).Scan(&id, &data)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			}
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": id, "month": month, "data": data})
	})

	api.PUT("/snapshots/:month", func(c *gin.Context) {
		origMonth := c.Param("month")
		var req struct {
			Month string `json:"month" binding:"required"`
			Data  string `json:"data" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		// If month changed, check there's no conflict
		if req.Month != origMonth {
			var exists int
			db.QueryRow("SELECT COUNT(*) FROM snapshots WHERE month = ?", req.Month).Scan(&exists)
			if exists > 0 {
				c.JSON(http.StatusConflict, gin.H{"error": "snapshot with this month already exists"})
				return
			}
		}
		_, err := db.Exec("UPDATE snapshots SET month=?, data=? WHERE month=?", req.Month, req.Data, origMonth)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api.POST("/snapshots", func(c *gin.Context) {
		var req SnapshotRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Check for existing snapshot with same month
		var exists int
		db.QueryRow("SELECT COUNT(*) FROM snapshots WHERE month = ?", req.Month).Scan(&exists)
		if exists > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "snapshot for this month already exists"})
			return
		}

		_, err := db.Exec("INSERT INTO snapshots (month, data) VALUES (?, ?)", req.Month, req.Data)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api.DELETE("/snapshots/:month", func(c *gin.Context) {
		month := c.Param("month")
		_, err := db.Exec("DELETE FROM snapshots WHERE month = ?", month)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api.GET("/settings", func(c *gin.Context) {
		var value string
		err := db.QueryRow("SELECT value FROM settings WHERE key = 'master_data'").Scan(&value)
		if err != nil {
			if err == sql.ErrNoRows {
				value = `{"organizations":["T-Bank","Alfabank","Anorbank","Sberbank","Cash"],
        "currencies":["RUB","USD","EUR","USDT","UZS","BTC"],"autoFetchCurrencies":["USD","EUR","USDT","","UZS","BTC"]}`
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"value": value})
	})

	api.POST("/settings", func(c *gin.Context) {
		var req struct {
			Value string `json:"value" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		_, err := db.Exec("INSERT INTO settings (key, value) VALUES ('master_data', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", req.Value)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	api.GET("/rates", func(c *gin.Context) {
		rows, err := db.Query("SELECT month, json_extract(data, '$.rates') as rates FROM snapshots ORDER BY month ASC")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var ratesHistory []gin.H
		for rows.Next() {
			var month string
			var ratesJson string // SQLite вернет строку с JSON
			if err := rows.Scan(&month, &ratesJson); err != nil {
				continue // пропускаем ошибки сканирования
			}
			ratesHistory = append(ratesHistory, gin.H{"month": month, "rates": ratesJson})
		}
		c.JSON(http.StatusOK, ratesHistory)
	})
}
