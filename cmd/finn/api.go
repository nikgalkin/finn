package main

import (
	"database/sql"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type SnapshotRequest struct {
	Month           string `json:"month" binding:"required"`
	Data            string `json:"data" binding:"required"`
	DurationSeconds int    `json:"duration_seconds"`
}

func isLocalShutdownRequest(r *http.Request) bool {
	remoteHost, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || !net.ParseIP(remoteHost).IsLoopback() {
		return false
	}

	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}

	parsedOrigin, err := url.Parse(origin)
	if err != nil {
		return false
	}

	originHost := strings.ToLower(parsedOrigin.Hostname())
	if originHost == "localhost" {
		return true
	}

	originIP := net.ParseIP(originHost)
	return originIP != nil && originIP.IsLoopback()
}

func setupAPI(r *gin.Engine, db *sql.DB, requestShutdown func(), runShutdownBackup func() BackupReport) {
	r.GET("/api/version", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"version": version})
	})

	api := r.Group("/api")
	setupAIAPI(api, db)

	api.POST("/shutdown", func(c *gin.Context) {
		if !isLocalShutdownRequest(c.Request) {
			c.JSON(http.StatusForbidden, gin.H{"error": "shutdown is only available locally"})
			return
		}

		if c.Query("skip_backup") == "true" {
			c.JSON(http.StatusAccepted, gin.H{"status": "shutting_down", "backup": gin.H{"status": "bypassed"}})
			c.Writer.Flush()
			go func() {
				time.Sleep(200 * time.Millisecond)
				requestShutdown()
			}()
			return
		}

		backupReport := runShutdownBackup()
		if backupReport.Status == backupStatusFailed || backupReport.Status == backupStatusPartial {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "backup_failed", "backup": backupReport})
			return
		}

		c.JSON(http.StatusAccepted, gin.H{"status": "shutting_down", "backup": backupReport})
		c.Writer.Flush()

		go func() {
			time.Sleep(200 * time.Millisecond)
			requestShutdown()
		}()
	})

	api.GET("/snapshots", func(c *gin.Context) {
		rows, err := db.Query("SELECT id, month, data, duration_seconds FROM snapshots ORDER BY month DESC")
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
			var durationSeconds int
			if err := rows.Scan(&id, &month, &data, &durationSeconds); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			snapshots = append(snapshots, gin.H{"id": id, "month": month, "data": data, "duration_seconds": durationSeconds})
		}
		c.JSON(http.StatusOK, snapshots)
	})

	api.GET("/snapshots/:month", func(c *gin.Context) {
		month := c.Param("month")
		var id int
		var data string
		var durationSeconds int
		err := db.QueryRow("SELECT id, data, duration_seconds FROM snapshots WHERE month = ?", month).Scan(&id, &data, &durationSeconds)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			}
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": id, "month": month, "data": data, "duration_seconds": durationSeconds})
	})

	api.PUT("/snapshots/:month", func(c *gin.Context) {
		origMonth := c.Param("month")
		var req SnapshotRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Валидация времени (не может быть отрицательным)
		if req.DurationSeconds < 0 {
			req.DurationSeconds = 0
		}

		if req.Month != origMonth {
			var exists int
			db.QueryRow("SELECT COUNT(*) FROM snapshots WHERE month = ?", req.Month).Scan(&exists)
			if exists > 0 {
				c.JSON(http.StatusConflict, gin.H{"error": "snapshot with this month already exists"})
				return
			}
		}
		_, err := db.Exec("UPDATE snapshots SET month=?, data=?, duration_seconds=? WHERE month=?", req.Month, req.Data, req.DurationSeconds, origMonth)
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

		// Валидация времени
		if req.DurationSeconds < 0 {
			req.DurationSeconds = 0
		}

		var exists int
		db.QueryRow("SELECT COUNT(*) FROM snapshots WHERE month = ?", req.Month).Scan(&exists)
		if exists > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "snapshot for this month already exists"})
			return
		}

		_, err := db.Exec("INSERT INTO snapshots (month, data, duration_seconds) VALUES (?, ?, ?)", req.Month, req.Data, req.DurationSeconds)
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
			var ratesJson string
			if err := rows.Scan(&month, &ratesJson); err != nil {
				continue
			}
			ratesHistory = append(ratesHistory, gin.H{"month": month, "rates": ratesJson})
		}
		c.JSON(http.StatusOK, ratesHistory)
	})
}
