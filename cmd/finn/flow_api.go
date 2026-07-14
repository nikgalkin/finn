package main

import (
	"database/sql"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

var flowMonthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

type FlowEntry struct {
	ID           int64   `json:"id"`
	Month        string  `json:"month"`
	Direction    string  `json:"direction"`
	Counterparty string  `json:"counterparty"`
	Currency     string  `json:"currency"`
	Amount       float64 `json:"amount"`
	TaxRate      float64 `json:"taxRate"`
	Category     string  `json:"category"`
	Comment      string  `json:"comment"`
}

type FlowEntryRequest struct {
	Month        string  `json:"month"`
	Direction    string  `json:"direction"`
	Counterparty string  `json:"counterparty"`
	Currency     string  `json:"currency"`
	Amount       float64 `json:"amount"`
	TaxRate      float64 `json:"taxRate"`
	Category     string  `json:"category"`
	Comment      string  `json:"comment"`
}

type FlowPeriodEntryRequest struct {
	ID           int64   `json:"id"`
	Direction    string  `json:"direction"`
	Counterparty string  `json:"counterparty"`
	Currency     string  `json:"currency"`
	Amount       float64 `json:"amount"`
	TaxRate      float64 `json:"taxRate"`
	Category     string  `json:"category"`
	Comment      string  `json:"comment"`
}

type FlowPeriodRequest struct {
	Entries []FlowPeriodEntryRequest `json:"entries"`
}

type FlowImportRequest struct {
	Entries         []FlowEntryRequest `json:"entries"`
	AllowDuplicates bool               `json:"allowDuplicates"`
}

type FlowImportResult struct {
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"`
}

func normalizeFlowEntryRequest(request FlowEntryRequest) (FlowEntryRequest, string) {
	request.Month = strings.TrimSpace(request.Month)
	request.Direction = strings.TrimSpace(strings.ToLower(request.Direction))
	request.Counterparty = strings.TrimSpace(request.Counterparty)
	request.Currency = strings.TrimSpace(strings.ToUpper(request.Currency))
	request.Category = strings.TrimSpace(request.Category)
	request.Comment = strings.TrimSpace(request.Comment)

	if !flowMonthPattern.MatchString(request.Month) {
		return request, "month must use YYYY-MM format"
	}
	if request.Direction != "in" && request.Direction != "out" {
		return request, "direction must be in or out"
	}
	if request.Counterparty == "" {
		return request, "counterparty is required"
	}
	if request.Currency == "" {
		return request, "currency is required"
	}
	if request.Amount <= 0 || math.IsNaN(request.Amount) || math.IsInf(request.Amount, 0) {
		return request, "amount must be greater than zero"
	}
	if request.TaxRate < 0 || request.TaxRate > 100 || math.IsNaN(request.TaxRate) || math.IsInf(request.TaxRate, 0) {
		return request, "tax rate must be between 0 and 100"
	}
	if request.Direction == "out" {
		request.TaxRate = 0
	}
	return request, ""
}

func flowEntryID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow entry id"})
		return 0, false
	}
	return id, true
}

func flowEntryKey(entry FlowEntryRequest) string {
	return strings.Join([]string{
		entry.Month,
		entry.Direction,
		entry.Counterparty,
		entry.Currency,
		strconv.FormatFloat(entry.Amount, 'g', -1, 64),
		strconv.FormatFloat(entry.TaxRate, 'g', -1, 64),
		entry.Category,
		entry.Comment,
	}, "\x1f")
}

func setupFlowAPI(api *gin.RouterGroup, db *sql.DB) {
	api.GET("/flows", func(c *gin.Context) {
		rows, err := db.Query(`
			SELECT id, month, direction, counterparty, currency, amount, tax_rate, category, comment
			FROM flow_entries
			ORDER BY month DESC, id DESC
		`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		entries := make([]FlowEntry, 0)
		for rows.Next() {
			var entry FlowEntry
			if err := rows.Scan(&entry.ID, &entry.Month, &entry.Direction, &entry.Counterparty, &entry.Currency, &entry.Amount, &entry.TaxRate, &entry.Category, &entry.Comment); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			entries = append(entries, entry)
		}
		if err := rows.Err(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, entries)
	})

	api.POST("/flows", func(c *gin.Context) {
		var request FlowEntryRequest
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow entry"})
			return
		}
		request, validationError := normalizeFlowEntryRequest(request)
		if validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}

		result, err := db.Exec(`
			INSERT INTO flow_entries (month, direction, counterparty, currency, amount, tax_rate, category, comment)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, request.Month, request.Direction, request.Counterparty, request.Currency, request.Amount, request.TaxRate, request.Category, request.Comment)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		id, err := result.LastInsertId()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, FlowEntry{
			ID: id, Month: request.Month, Direction: request.Direction, Counterparty: request.Counterparty,
			Currency: request.Currency, Amount: request.Amount, TaxRate: request.TaxRate, Category: request.Category, Comment: request.Comment,
		})
	})

	api.POST("/flows/import", func(c *gin.Context) {
		var importRequest FlowImportRequest
		if err := c.ShouldBindJSON(&importRequest); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid Cash Flow import"})
			return
		}
		if len(importRequest.Entries) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "import must contain at least one entry"})
			return
		}
		if len(importRequest.Entries) > 5000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "import cannot contain more than 5000 entries"})
			return
		}

		normalizedEntries := make([]FlowEntryRequest, 0, len(importRequest.Entries))
		for index, entry := range importRequest.Entries {
			normalized, validationError := normalizeFlowEntryRequest(entry)
			if validationError != "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "row " + strconv.Itoa(index+2) + ": " + validationError})
				return
			}
			normalizedEntries = append(normalizedEntries, normalized)
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		rollbackWithError := func(status int, message string) {
			_ = tx.Rollback()
			c.JSON(status, gin.H{"error": message})
		}

		rows, err := tx.Query(`
			SELECT month, direction, counterparty, currency, amount, tax_rate, category, comment
			FROM flow_entries
		`)
		if err != nil {
			rollbackWithError(http.StatusInternalServerError, err.Error())
			return
		}
		existingKeys := make(map[string]struct{})
		for rows.Next() {
			var entry FlowEntryRequest
			if err := rows.Scan(&entry.Month, &entry.Direction, &entry.Counterparty, &entry.Currency, &entry.Amount, &entry.TaxRate, &entry.Category, &entry.Comment); err != nil {
				_ = rows.Close()
				rollbackWithError(http.StatusInternalServerError, err.Error())
				return
			}
			existingKeys[flowEntryKey(entry)] = struct{}{}
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			rollbackWithError(http.StatusInternalServerError, err.Error())
			return
		}
		_ = rows.Close()

		result := FlowImportResult{}
		for _, entry := range normalizedEntries {
			key := flowEntryKey(entry)
			if !importRequest.AllowDuplicates {
				if _, exists := existingKeys[key]; exists {
					result.Skipped++
					continue
				}
			}
			if _, err := tx.Exec(`
				INSERT INTO flow_entries (month, direction, counterparty, currency, amount, tax_rate, category, comment)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`, entry.Month, entry.Direction, entry.Counterparty, entry.Currency, entry.Amount, entry.TaxRate, entry.Category, entry.Comment); err != nil {
				rollbackWithError(http.StatusInternalServerError, err.Error())
				return
			}
			if !importRequest.AllowDuplicates {
				existingKeys[key] = struct{}{}
			}
			result.Imported++
		}

		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, result)
	})

	api.PUT("/flows/:id", func(c *gin.Context) {
		id, ok := flowEntryID(c)
		if !ok {
			return
		}
		var request FlowEntryRequest
		if err := c.ShouldBindJSON(&request); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid flow entry"})
			return
		}
		request, validationError := normalizeFlowEntryRequest(request)
		if validationError != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": validationError})
			return
		}

		result, err := db.Exec(`
			UPDATE flow_entries
			SET month = ?, direction = ?, counterparty = ?, currency = ?, amount = ?, tax_rate = ?, category = ?, comment = ?
			WHERE id = ?
		`, request.Month, request.Direction, request.Counterparty, request.Currency, request.Amount, request.TaxRate, request.Category, request.Comment, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		updated, err := result.RowsAffected()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if updated == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "flow entry not found"})
			return
		}
		c.JSON(http.StatusOK, FlowEntry{
			ID: id, Month: request.Month, Direction: request.Direction, Counterparty: request.Counterparty,
			Currency: request.Currency, Amount: request.Amount, TaxRate: request.TaxRate, Category: request.Category, Comment: request.Comment,
		})
	})

	api.PUT("/flows/months/:month", func(c *gin.Context) {
		month := strings.TrimSpace(c.Param("month"))
		if !flowMonthPattern.MatchString(month) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "month must use YYYY-MM format"})
			return
		}

		var periodRequest FlowPeriodRequest
		if err := c.ShouldBindJSON(&periodRequest); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid Cash Flow period"})
			return
		}
		if len(periodRequest.Entries) > 500 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "a Cash Flow period cannot contain more than 500 entries"})
			return
		}

		type normalizedPeriodEntry struct {
			id      int64
			request FlowEntryRequest
		}
		normalizedEntries := make([]normalizedPeriodEntry, 0, len(periodRequest.Entries))
		seenIDs := make(map[int64]struct{}, len(periodRequest.Entries))
		for index, entry := range periodRequest.Entries {
			if entry.ID < 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "entry id must be positive"})
				return
			}
			if entry.ID > 0 {
				if _, exists := seenIDs[entry.ID]; exists {
					c.JSON(http.StatusBadRequest, gin.H{"error": "duplicate entry id"})
					return
				}
				seenIDs[entry.ID] = struct{}{}
			}

			normalized, validationError := normalizeFlowEntryRequest(FlowEntryRequest{
				Month: month, Direction: entry.Direction, Counterparty: entry.Counterparty,
				Currency: entry.Currency, Amount: entry.Amount, TaxRate: entry.TaxRate, Category: entry.Category, Comment: entry.Comment,
			})
			if validationError != "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "entry " + strconv.Itoa(index+1) + ": " + validationError})
				return
			}
			normalizedEntries = append(normalizedEntries, normalizedPeriodEntry{id: entry.ID, request: normalized})
		}

		tx, err := db.Begin()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		rollbackWithError := func(status int, message string) {
			_ = tx.Rollback()
			c.JSON(status, gin.H{"error": message})
		}

		rows, err := tx.Query("SELECT id FROM flow_entries WHERE month = ?", month)
		if err != nil {
			rollbackWithError(http.StatusInternalServerError, err.Error())
			return
		}
		existingIDs := make(map[int64]struct{})
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				_ = rows.Close()
				rollbackWithError(http.StatusInternalServerError, err.Error())
				return
			}
			existingIDs[id] = struct{}{}
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			rollbackWithError(http.StatusInternalServerError, err.Error())
			return
		}
		_ = rows.Close()

		savedEntries := make([]FlowEntry, 0, len(normalizedEntries))
		for _, entry := range normalizedEntries {
			request := entry.request
			id := entry.id
			if id > 0 {
				if _, exists := existingIDs[id]; !exists {
					rollbackWithError(http.StatusBadRequest, "entry does not belong to this month")
					return
				}
				if _, err := tx.Exec(`
					UPDATE flow_entries
					SET direction = ?, counterparty = ?, currency = ?, amount = ?, tax_rate = ?, category = ?, comment = ?
					WHERE id = ? AND month = ?
				`, request.Direction, request.Counterparty, request.Currency, request.Amount, request.TaxRate, request.Category, request.Comment, id, month); err != nil {
					rollbackWithError(http.StatusInternalServerError, err.Error())
					return
				}
				delete(existingIDs, id)
			} else {
				result, err := tx.Exec(`
					INSERT INTO flow_entries (month, direction, counterparty, currency, amount, tax_rate, category, comment)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				`, month, request.Direction, request.Counterparty, request.Currency, request.Amount, request.TaxRate, request.Category, request.Comment)
				if err != nil {
					rollbackWithError(http.StatusInternalServerError, err.Error())
					return
				}
				id, err = result.LastInsertId()
				if err != nil {
					rollbackWithError(http.StatusInternalServerError, err.Error())
					return
				}
			}
			savedEntries = append(savedEntries, FlowEntry{
				ID: id, Month: month, Direction: request.Direction, Counterparty: request.Counterparty,
				Currency: request.Currency, Amount: request.Amount, TaxRate: request.TaxRate, Category: request.Category, Comment: request.Comment,
			})
		}

		for id := range existingIDs {
			if _, err := tx.Exec("DELETE FROM flow_entries WHERE id = ? AND month = ?", id, month); err != nil {
				rollbackWithError(http.StatusInternalServerError, err.Error())
				return
			}
		}
		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, savedEntries)
	})

	api.DELETE("/flows/:id", func(c *gin.Context) {
		id, ok := flowEntryID(c)
		if !ok {
			return
		}
		result, err := db.Exec("DELETE FROM flow_entries WHERE id = ?", id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		deleted, err := result.RowsAffected()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if deleted == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "flow entry not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
}
