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
	EntryType    string  `json:"entryType"`
	Direction    string  `json:"direction"`
	Counterparty string  `json:"counterparty"`
	Account      string  `json:"account"`
	Currency     string  `json:"currency"`
	Amount       float64 `json:"amount"`
	TaxRate      float64 `json:"taxRate"`
	Category     string  `json:"category"`
	Comment      string  `json:"comment"`
	ToAccount    string  `json:"toAccount"`
	ToCurrency   string  `json:"toCurrency"`
	ToAmount     float64 `json:"toAmount"`
}

type FlowEntryRequest struct {
	Month        string  `json:"month"`
	EntryType    string  `json:"entryType"`
	Direction    string  `json:"direction"`
	Counterparty string  `json:"counterparty"`
	Account      string  `json:"account"`
	Currency     string  `json:"currency"`
	Amount       float64 `json:"amount"`
	TaxRate      float64 `json:"taxRate"`
	Category     string  `json:"category"`
	Comment      string  `json:"comment"`
	ToAccount    string  `json:"toAccount"`
	ToCurrency   string  `json:"toCurrency"`
	ToAmount     float64 `json:"toAmount"`
}

type FlowPeriodEntryRequest struct {
	ID           int64   `json:"id"`
	EntryType    string  `json:"entryType"`
	Direction    string  `json:"direction"`
	Counterparty string  `json:"counterparty"`
	Account      string  `json:"account"`
	Currency     string  `json:"currency"`
	Amount       float64 `json:"amount"`
	TaxRate      float64 `json:"taxRate"`
	Category     string  `json:"category"`
	Comment      string  `json:"comment"`
	ToAccount    string  `json:"toAccount"`
	ToCurrency   string  `json:"toCurrency"`
	ToAmount     float64 `json:"toAmount"`
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
	request.EntryType = strings.TrimSpace(strings.ToLower(request.EntryType))
	request.Direction = strings.TrimSpace(strings.ToLower(request.Direction))
	request.Counterparty = strings.TrimSpace(request.Counterparty)
	request.Account = strings.TrimSpace(request.Account)
	request.Currency = strings.TrimSpace(strings.ToUpper(request.Currency))
	request.Category = strings.TrimSpace(request.Category)
	request.Comment = strings.TrimSpace(request.Comment)
	request.ToAccount = strings.TrimSpace(request.ToAccount)
	request.ToCurrency = strings.TrimSpace(strings.ToUpper(request.ToCurrency))
	if request.EntryType == "" {
		request.EntryType = "external"
	}

	if !flowMonthPattern.MatchString(request.Month) {
		return request, "month must use YYYY-MM format"
	}
	if request.EntryType != "external" && request.EntryType != "transfer" {
		return request, "entry type must be external or transfer"
	}
	if request.EntryType == "transfer" {
		if request.Account == "" || request.ToAccount == "" {
			return request, "source and destination accounts are required"
		}
		if request.Currency == "" || request.ToCurrency == "" {
			return request, "source and destination currencies are required"
		}
		if request.Amount <= 0 || math.IsNaN(request.Amount) || math.IsInf(request.Amount, 0) ||
			request.ToAmount <= 0 || math.IsNaN(request.ToAmount) || math.IsInf(request.ToAmount, 0) {
			return request, "sent and received amounts must be greater than zero"
		}
		if request.Account == request.ToAccount && request.Currency == request.ToCurrency {
			return request, "source and destination must differ"
		}
		request.Direction = "out"
		request.Counterparty = ""
		request.TaxRate = 0
		request.Category = ""
		return request, ""
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
	request.ToAccount = ""
	request.ToCurrency = ""
	request.ToAmount = 0
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
	if entry.EntryType == "transfer" {
		return strings.Join([]string{
			entry.Month, entry.EntryType, entry.Account, entry.Currency,
			strconv.FormatFloat(entry.Amount, 'g', -1, 64), entry.ToAccount, entry.ToCurrency,
			strconv.FormatFloat(entry.ToAmount, 'g', -1, 64), entry.Comment,
		}, "\x1f")
	}
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
			SELECT id, month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount
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
			if err := rows.Scan(&entry.ID, &entry.Month, &entry.EntryType, &entry.Direction, &entry.Counterparty, &entry.Account, &entry.Currency, &entry.Amount, &entry.TaxRate, &entry.Category, &entry.Comment, &entry.ToAccount, &entry.ToCurrency, &entry.ToAmount); err != nil {
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
			INSERT INTO flow_entries (month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, request.Month, request.EntryType, request.Direction, request.Counterparty, request.Account, request.Currency, request.Amount, request.TaxRate, request.Category, request.Comment, request.ToAccount, request.ToCurrency, request.ToAmount)
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
			ID: id, Month: request.Month, EntryType: request.EntryType, Direction: request.Direction, Counterparty: request.Counterparty, Account: request.Account,
			Currency: request.Currency, Amount: request.Amount, TaxRate: request.TaxRate, Category: request.Category, Comment: request.Comment,
			ToAccount: request.ToAccount, ToCurrency: request.ToCurrency, ToAmount: request.ToAmount,
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
			SELECT month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount
			FROM flow_entries
		`)
		if err != nil {
			rollbackWithError(http.StatusInternalServerError, err.Error())
			return
		}
		existingKeys := make(map[string]struct{})
		for rows.Next() {
			var entry FlowEntryRequest
			if err := rows.Scan(&entry.Month, &entry.EntryType, &entry.Direction, &entry.Counterparty, &entry.Account, &entry.Currency, &entry.Amount, &entry.TaxRate, &entry.Category, &entry.Comment, &entry.ToAccount, &entry.ToCurrency, &entry.ToAmount); err != nil {
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
				INSERT INTO flow_entries (month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`, entry.Month, entry.EntryType, entry.Direction, entry.Counterparty, entry.Account, entry.Currency, entry.Amount, entry.TaxRate, entry.Category, entry.Comment, entry.ToAccount, entry.ToCurrency, entry.ToAmount); err != nil {
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
			SET month = ?, entry_type = ?, direction = ?, counterparty = ?, account = ?, currency = ?, amount = ?, tax_rate = ?, category = ?, comment = ?, to_account = ?, to_currency = ?, to_amount = ?
			WHERE id = ?
		`, request.Month, request.EntryType, request.Direction, request.Counterparty, request.Account, request.Currency, request.Amount, request.TaxRate, request.Category, request.Comment, request.ToAccount, request.ToCurrency, request.ToAmount, id)
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
			ID: id, Month: request.Month, EntryType: request.EntryType, Direction: request.Direction, Counterparty: request.Counterparty, Account: request.Account,
			Currency: request.Currency, Amount: request.Amount, TaxRate: request.TaxRate, Category: request.Category, Comment: request.Comment,
			ToAccount: request.ToAccount, ToCurrency: request.ToCurrency, ToAmount: request.ToAmount,
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
				Month: month, EntryType: entry.EntryType, Direction: entry.Direction, Counterparty: entry.Counterparty, Account: entry.Account,
				Currency: entry.Currency, Amount: entry.Amount, TaxRate: entry.TaxRate, Category: entry.Category, Comment: entry.Comment,
				ToAccount: entry.ToAccount, ToCurrency: entry.ToCurrency, ToAmount: entry.ToAmount,
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
					SET entry_type = ?, direction = ?, counterparty = ?, account = ?, currency = ?, amount = ?, tax_rate = ?, category = ?, comment = ?, to_account = ?, to_currency = ?, to_amount = ?
					WHERE id = ? AND month = ?
				`, request.EntryType, request.Direction, request.Counterparty, request.Account, request.Currency, request.Amount, request.TaxRate, request.Category, request.Comment, request.ToAccount, request.ToCurrency, request.ToAmount, id, month); err != nil {
					rollbackWithError(http.StatusInternalServerError, err.Error())
					return
				}
				delete(existingIDs, id)
			} else {
				result, err := tx.Exec(`
					INSERT INTO flow_entries (month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`, month, request.EntryType, request.Direction, request.Counterparty, request.Account, request.Currency, request.Amount, request.TaxRate, request.Category, request.Comment, request.ToAccount, request.ToCurrency, request.ToAmount)
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
				ID: id, Month: month, EntryType: request.EntryType, Direction: request.Direction, Counterparty: request.Counterparty, Account: request.Account,
				Currency: request.Currency, Amount: request.Amount, TaxRate: request.TaxRate, Category: request.Category, Comment: request.Comment,
				ToAccount: request.ToAccount, ToCurrency: request.ToCurrency, ToAmount: request.ToAmount,
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
