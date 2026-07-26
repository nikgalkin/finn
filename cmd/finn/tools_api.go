package main

import (
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type toolsAPI struct {
	cfg    *Config
	db     *sql.DB
	isDemo bool
}

func setupToolsAPI(api *gin.RouterGroup, cfg *Config, db *sql.DB, isDemo bool) {
	handler := &toolsAPI{cfg: cfg, db: db, isDemo: isDemo}
	group := api.Group("/tools")
	group.Use(func(c *gin.Context) {
		if !isLocalRequest(c.Request) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "tools are only available locally"})
			return
		}
		c.Next()
	})

	group.GET("/health", handler.handleHealth)
	group.GET("/backups", handler.handleBackupList)
	group.POST("/backups/run", handler.handleBackupRun)
	group.POST("/backups/verify", handler.handleBackupVerify)
	group.GET("/export", handler.handleExportMetadata)
	group.POST("/export", handler.handleExport)
}

func (api *toolsAPI) handleHealth(c *gin.Context) {
	report, err := runDataHealthCheck(api.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}

type backupInspectorFile struct {
	Name        string    `json:"name"`
	Size        int64     `json:"size"`
	ModifiedAt  time.Time `json:"modifiedAt"`
	Format      string    `json:"format"`
	Version     string    `json:"version,omitempty"`
	Fingerprint string    `json:"fingerprint,omitempty"`
	Current     bool      `json:"current"`
}

type backupInspectorTarget struct {
	Name      string                `json:"name"`
	Path      string                `json:"path"`
	Retention int                   `json:"retention"`
	Files     []backupInspectorFile `json:"files"`
	Error     string                `json:"error,omitempty"`
}

type backupInspectorResponse struct {
	Enabled             bool                    `json:"enabled"`
	Demo                bool                    `json:"demo"`
	Encrypted           bool                    `json:"encrypted"`
	OnlyIfChanged       bool                    `json:"onlyIfChanged"`
	IntervalHours       int                     `json:"intervalHours"`
	DatabaseFingerprint string                  `json:"databaseFingerprint,omitempty"`
	FingerprintError    string                  `json:"fingerprintError,omitempty"`
	Targets             []backupInspectorTarget `json:"targets"`
}

func backupVersionFromName(name, fingerprint string) string {
	extension := filepath.Ext(name)
	body := strings.TrimSuffix(strings.TrimPrefix(name, backupPrefix), extension)
	if fingerprint != "" {
		body = strings.TrimSuffix(body, "_"+fingerprint)
	}
	separator := strings.LastIndexByte(body, '_')
	if separator < 0 {
		return ""
	}
	return body[separator+1:]
}

func listBackupTarget(target BackupTarget, currentFingerprint string) backupInspectorTarget {
	result := backupInspectorTarget{
		Name:      target.Name,
		Path:      target.Path,
		Retention: target.Retention,
		Files:     make([]backupInspectorFile, 0),
	}
	entries, err := os.ReadDir(target.Path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			result.Error = err.Error()
		}
		return result
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), backupPrefix) {
			continue
		}
		extension := strings.ToLower(filepath.Ext(entry.Name()))
		if extension != "."+extEncrypted && extension != "."+extRaw {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		fingerprint := fingerprintFromBackupName(entry.Name())
		result.Files = append(result.Files, backupInspectorFile{
			Name:        entry.Name(),
			Size:        info.Size(),
			ModifiedAt:  info.ModTime(),
			Format:      strings.TrimPrefix(extension, "."),
			Version:     backupVersionFromName(entry.Name(), fingerprint),
			Fingerprint: fingerprint,
			Current: currentFingerprint != "" && fingerprint != "" &&
				strings.HasPrefix(currentFingerprint, fingerprint),
		})
	}
	sort.Slice(result.Files, func(i, j int) bool {
		if result.Files[i].ModifiedAt.Equal(result.Files[j].ModifiedAt) {
			return result.Files[i].Name > result.Files[j].Name
		}
		return result.Files[i].ModifiedAt.After(result.Files[j].ModifiedAt)
	})
	return result
}

func (api *toolsAPI) backupInspector() backupInspectorResponse {
	response := backupInspectorResponse{
		Enabled:       api.cfg.Backup.Enabled && !api.isDemo,
		Demo:          api.isDemo,
		Encrypted:     api.cfg.Backup.CipherKey != "",
		OnlyIfChanged: api.cfg.Backup.OnlyIfChanged,
		IntervalHours: api.cfg.Backup.IntervalHours,
		Targets:       make([]backupInspectorTarget, 0, len(api.cfg.Backup.Targets)),
	}
	fingerprint, err := databaseFingerprint(api.db)
	if err != nil {
		response.FingerprintError = err.Error()
	} else {
		response.DatabaseFingerprint = fingerprint
	}
	for _, target := range api.cfg.Backup.Targets {
		response.Targets = append(response.Targets, listBackupTarget(target, fingerprint))
	}
	return response
}

func (api *toolsAPI) handleBackupList(c *gin.Context) {
	c.JSON(http.StatusOK, api.backupInspector())
}

func (api *toolsAPI) handleBackupRun(c *gin.Context) {
	if api.isDemo {
		c.JSON(http.StatusBadRequest, BackupReport{
			Status: backupStatusDisabled,
			Error:  "backups are disabled in demo mode",
		})
		return
	}
	report := RunBackupJob(api.cfg, api.db)
	status := http.StatusOK
	if report.Status == backupStatusFailed {
		status = http.StatusServiceUnavailable
	} else if report.Status == backupStatusDisabled {
		status = http.StatusBadRequest
	}
	c.JSON(status, report)
}

type backupVerifyRequest struct {
	Target string `json:"target" binding:"required"`
	File   string `json:"file" binding:"required"`
}

type backupVerifyResponse struct {
	Status          string `json:"status"`
	Integrity       string `json:"integrity,omitempty"`
	Fingerprint     string `json:"fingerprint,omitempty"`
	NameFingerprint string `json:"nameFingerprint,omitempty"`
	MatchesName     bool   `json:"matchesName"`
	Error           string `json:"error,omitempty"`
}

func resolveBackupArtifact(cfg *Config, targetName, fileName string) (string, error) {
	if filepath.Base(fileName) != fileName || !strings.HasPrefix(fileName, backupPrefix) {
		return "", fmt.Errorf("invalid backup filename")
	}
	extension := strings.ToLower(filepath.Ext(fileName))
	if extension != "."+extEncrypted && extension != "."+extRaw {
		return "", fmt.Errorf("unsupported backup format")
	}
	for _, target := range cfg.Backup.Targets {
		if target.Name == targetName {
			return filepath.Join(target.Path, fileName), nil
		}
	}
	return "", fmt.Errorf("backup target not found")
}

func verifyBackupArtifact(cfg *Config, targetName, fileName string) backupVerifyResponse {
	response := backupVerifyResponse{
		Status:          "failed",
		NameFingerprint: fingerprintFromBackupName(fileName),
	}
	path, err := resolveBackupArtifact(cfg, targetName, fileName)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	if strings.EqualFold(filepath.Ext(path), "."+extEncrypted) {
		if cfg.Backup.CipherKey == "" {
			response.Error = "the backup is encrypted but no cipher key is configured"
			return response
		}
		payload, err = decryptData(payload, cfg.Backup.CipherKey)
		if err != nil {
			response.Error = err.Error()
			return response
		}
	}

	temp, err := os.CreateTemp("", "finn-verify-*.db")
	if err != nil {
		response.Error = err.Error()
		return response
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if _, err := temp.Write(payload); err != nil {
		temp.Close()
		response.Error = err.Error()
		return response
	}
	if err := temp.Close(); err != nil {
		response.Error = err.Error()
		return response
	}

	db, err := sql.Open("sqlite3", tempPath)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	if err := db.QueryRow("PRAGMA integrity_check").Scan(&response.Integrity); err != nil {
		response.Error = err.Error()
		return response
	}
	if !strings.EqualFold(response.Integrity, "ok") {
		response.Error = "SQLite integrity check failed"
		return response
	}

	fingerprint, fingerprintErr := databaseFingerprint(db)
	if fingerprintErr != nil {
		response.Status = "warning"
		response.Error = fmt.Sprintf("integrity is OK, but the logical fingerprint could not be calculated: %v", fingerprintErr)
		return response
	}
	response.Fingerprint = fingerprint
	response.MatchesName = response.NameFingerprint != "" &&
		strings.HasPrefix(response.Fingerprint, response.NameFingerprint)
	if response.NameFingerprint != "" && !response.MatchesName {
		response.Status = "warning"
		response.Error = "the database is valid, but its contents do not match the filename fingerprint"
		return response
	}
	response.Status = "verified"
	return response
}

func (api *toolsAPI) handleBackupVerify(c *gin.Context) {
	var request backupVerifyRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result := verifyBackupArtifact(api.cfg, request.Target, request.File)
	status := http.StatusOK
	if result.Status == "failed" {
		status = http.StatusUnprocessableEntity
	}
	c.JSON(status, result)
}

type exportMetadata struct {
	MinMonth      string   `json:"minMonth,omitempty"`
	MaxMonth      string   `json:"maxMonth,omitempty"`
	Months        []string `json:"months"`
	SnapshotCount int      `json:"snapshotCount"`
	FlowCount     int      `json:"flowCount"`
	SettingsCount int      `json:"settingsCount"`
}

func loadExportMetadata(db *sql.DB) (exportMetadata, error) {
	metadata := exportMetadata{Months: make([]string, 0)}
	rows, err := db.Query(`
		SELECT month FROM snapshots
		UNION
		SELECT month FROM flow_entries
		ORDER BY month
	`)
	if err != nil {
		return metadata, err
	}
	for rows.Next() {
		var month string
		if err := rows.Scan(&month); err != nil {
			rows.Close()
			return metadata, err
		}
		metadata.Months = append(metadata.Months, month)
	}
	if err := rows.Close(); err != nil {
		return metadata, err
	}
	if len(metadata.Months) > 0 {
		metadata.MinMonth = metadata.Months[0]
		metadata.MaxMonth = metadata.Months[len(metadata.Months)-1]
	}
	if err := db.QueryRow("SELECT count(*) FROM snapshots").Scan(&metadata.SnapshotCount); err != nil {
		return metadata, err
	}
	if err := db.QueryRow("SELECT count(*) FROM flow_entries").Scan(&metadata.FlowCount); err != nil {
		return metadata, err
	}
	if err := db.QueryRow("SELECT count(*) FROM settings").Scan(&metadata.SettingsCount); err != nil {
		return metadata, err
	}
	return metadata, nil
}

func (api *toolsAPI) handleExportMetadata(c *gin.Context) {
	metadata, err := loadExportMetadata(api.db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, metadata)
}

type exportRequest struct {
	Format           string `json:"format"`
	FromMonth        string `json:"fromMonth"`
	ToMonth          string `json:"toMonth"`
	IncludeSnapshots bool   `json:"includeSnapshots"`
	IncludeSettings  bool   `json:"includeSettings"`
	IncludeCashFlow  bool   `json:"includeCashFlow"`
}

type portableSnapshot struct {
	ID              int64  `json:"id"`
	Month           string `json:"month"`
	Data            any    `json:"data"`
	DurationSeconds int64  `json:"durationSeconds"`
}

type portableSetting struct {
	Key   string `json:"key"`
	Value any    `json:"value"`
}

type portableFlowEntry struct {
	ID           int64   `json:"id"`
	Month        string  `json:"month"`
	EntryType    string  `json:"entryType"`
	Direction    string  `json:"direction"`
	Counterparty string  `json:"counterparty"`
	Account      string  `json:"account"`
	Tag          string  `json:"tag"`
	Currency     string  `json:"currency"`
	Amount       float64 `json:"amount"`
	TaxRate      float64 `json:"taxRate"`
	Category     string  `json:"category"`
	Comment      string  `json:"comment"`
	ToAccount    string  `json:"toAccount"`
	ToTag        string  `json:"toTag"`
	ToCurrency   string  `json:"toCurrency"`
	ToAmount     float64 `json:"toAmount"`
}

type portableExport struct {
	Format        string              `json:"format"`
	FormatVersion int                 `json:"formatVersion"`
	FinnVersion   string              `json:"finnVersion"`
	ExportedAt    time.Time           `json:"exportedAt"`
	FromMonth     string              `json:"fromMonth,omitempty"`
	ToMonth       string              `json:"toMonth,omitempty"`
	Snapshots     []portableSnapshot  `json:"snapshots,omitempty"`
	Settings      []portableSetting   `json:"settings,omitempty"`
	CashFlow      []portableFlowEntry `json:"cashFlow,omitempty"`
}

func exportMonthClause(fromMonth, toMonth string) (string, []any) {
	return ` WHERE (? = '' OR month >= ?) AND (? = '' OR month <= ?)`,
		[]any{fromMonth, fromMonth, toMonth, toMonth}
}

func exportJSONValue(raw string) any {
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return raw
	}
	return value
}

func loadPortableSnapshots(db *sql.DB, fromMonth, toMonth string) ([]portableSnapshot, error) {
	clause, args := exportMonthClause(fromMonth, toMonth)
	rows, err := db.Query(
		"SELECT id, month, data, duration_seconds FROM snapshots"+clause+" ORDER BY month, id",
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]portableSnapshot, 0)
	for rows.Next() {
		var row portableSnapshot
		var raw string
		var duration sql.NullInt64
		if err := rows.Scan(&row.ID, &row.Month, &raw, &duration); err != nil {
			return nil, err
		}
		row.Data = exportJSONValue(raw)
		if duration.Valid {
			row.DurationSeconds = duration.Int64
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func loadPortableSettings(db *sql.DB) ([]portableSetting, error) {
	rows, err := db.Query("SELECT key, value FROM settings ORDER BY key")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]portableSetting, 0)
	for rows.Next() {
		var row portableSetting
		var raw string
		if err := rows.Scan(&row.Key, &raw); err != nil {
			return nil, err
		}
		row.Value = exportJSONValue(raw)
		result = append(result, row)
	}
	return result, rows.Err()
}

func loadPortableFlow(db *sql.DB, fromMonth, toMonth string) ([]portableFlowEntry, error) {
	clause, args := exportMonthClause(fromMonth, toMonth)
	rows, err := db.Query(`
		SELECT id, month, entry_type, direction, counterparty, account, tag, currency,
		       amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount
		FROM flow_entries`+clause+" ORDER BY month, id", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]portableFlowEntry, 0)
	for rows.Next() {
		var row portableFlowEntry
		if err := rows.Scan(
			&row.ID, &row.Month, &row.EntryType, &row.Direction, &row.Counterparty,
			&row.Account, &row.Tag, &row.Currency, &row.Amount, &row.TaxRate,
			&row.Category, &row.Comment, &row.ToAccount, &row.ToTag,
			&row.ToCurrency, &row.ToAmount,
		); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func buildPortableExport(db *sql.DB, request exportRequest) (portableExport, error) {
	result := portableExport{
		Format:        "finn-portable-export",
		FormatVersion: 1,
		FinnVersion:   version,
		ExportedAt:    time.Now(),
		FromMonth:     request.FromMonth,
		ToMonth:       request.ToMonth,
	}
	var err error
	if request.IncludeSnapshots {
		result.Snapshots, err = loadPortableSnapshots(db, request.FromMonth, request.ToMonth)
		if err != nil {
			return result, err
		}
	}
	if request.IncludeSettings {
		result.Settings, err = loadPortableSettings(db)
		if err != nil {
			return result, err
		}
	}
	if request.IncludeCashFlow {
		result.CashFlow, err = loadPortableFlow(db, request.FromMonth, request.ToMonth)
		if err != nil {
			return result, err
		}
	}
	return result, nil
}

func writeZipJSON(archive *zip.Writer, name string, value any) error {
	file, err := archive.Create(name)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(file)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func writeZipCSV(archive *zip.Writer, name string, rows [][]string) error {
	file, err := archive.Create(name)
	if err != nil {
		return err
	}
	writer := csv.NewWriter(file)
	if err := writer.WriteAll(rows); err != nil {
		return err
	}
	return writer.Error()
}

func csvText(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case json.Number:
		return typed.String()
	default:
		return fmt.Sprint(typed)
	}
}

func buildCSVArchive(data portableExport, request exportRequest) ([]byte, error) {
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	closeWithError := func(err error) ([]byte, error) {
		_ = archive.Close()
		return nil, err
	}

	manifest := map[string]any{
		"format":        "finn-csv-export",
		"formatVersion": 1,
		"finnVersion":   data.FinnVersion,
		"exportedAt":    data.ExportedAt,
		"fromMonth":     data.FromMonth,
		"toMonth":       data.ToMonth,
	}
	if err := writeZipJSON(archive, "manifest.json", manifest); err != nil {
		return closeWithError(err)
	}

	if request.IncludeSnapshots {
		snapshotRows := [][]string{{"id", "month", "duration_seconds", "comment", "data_json"}}
		organizationRows := [][]string{{"snapshot_month", "id", "name", "country", "comment"}}
		balanceRows := [][]string{{"snapshot_month", "organization_id", "organization_name", "currency", "amount", "tags", "comment"}}
		rateRows := [][]string{{"snapshot_month", "currency", "rate"}}

		for _, snapshot := range data.Snapshots {
			raw, _ := json.Marshal(snapshot.Data)
			root, _ := snapshot.Data.(map[string]any)
			comment, _ := root["comment"].(string)
			snapshotRows = append(snapshotRows, []string{
				strconv.FormatInt(snapshot.ID, 10),
				snapshot.Month,
				strconv.FormatInt(snapshot.DurationSeconds, 10),
				comment,
				string(raw),
			})

			if rates, ok := root["rates"].(map[string]any); ok {
				currencies := make([]string, 0, len(rates))
				for currency := range rates {
					currencies = append(currencies, currency)
				}
				sort.Strings(currencies)
				for _, currency := range currencies {
					rateRows = append(rateRows, []string{snapshot.Month, currency, csvText(rates[currency])})
				}
			}

			organizations, _ := root["organizations"].([]any)
			for _, rawOrganization := range organizations {
				organization, _ := rawOrganization.(map[string]any)
				id := csvText(organization["id"])
				name := csvText(organization["name"])
				organizationRows = append(organizationRows, []string{
					snapshot.Month,
					id,
					name,
					csvText(organization["country"]),
					csvText(organization["comment"]),
				})
				balances, _ := organization["balances"].([]any)
				for _, rawBalance := range balances {
					balance, _ := rawBalance.(map[string]any)
					tags := ""
					if rawTags, ok := balance["tags"].([]any); ok {
						values := make([]string, 0, len(rawTags))
						for _, tag := range rawTags {
							values = append(values, csvText(tag))
						}
						tags = strings.Join(values, "|")
					}
					balanceRows = append(balanceRows, []string{
						snapshot.Month,
						id,
						name,
						csvText(balance["currency"]),
						csvText(balance["amount"]),
						tags,
						csvText(balance["comment"]),
					})
				}
			}
		}
		for name, rows := range map[string][][]string{
			"snapshots.csv":     snapshotRows,
			"organizations.csv": organizationRows,
			"balances.csv":      balanceRows,
			"rates.csv":         rateRows,
		} {
			if err := writeZipCSV(archive, name, rows); err != nil {
				return closeWithError(err)
			}
		}
	}

	if request.IncludeSettings {
		if err := writeZipJSON(archive, "settings.json", data.Settings); err != nil {
			return closeWithError(err)
		}
	}
	if request.IncludeCashFlow {
		rows := [][]string{{
			"id", "month", "entry_type", "direction", "counterparty", "account", "tag",
			"currency", "amount", "tax_rate", "category", "comment", "to_account",
			"to_tag", "to_currency", "to_amount",
		}}
		for _, entry := range data.CashFlow {
			rows = append(rows, []string{
				strconv.FormatInt(entry.ID, 10),
				entry.Month,
				entry.EntryType,
				entry.Direction,
				entry.Counterparty,
				entry.Account,
				entry.Tag,
				entry.Currency,
				strconv.FormatFloat(entry.Amount, 'f', -1, 64),
				strconv.FormatFloat(entry.TaxRate, 'f', -1, 64),
				entry.Category,
				entry.Comment,
				entry.ToAccount,
				entry.ToTag,
				entry.ToCurrency,
				strconv.FormatFloat(entry.ToAmount, 'f', -1, 64),
			})
		}
		if err := writeZipCSV(archive, "cash_flow.csv", rows); err != nil {
			return closeWithError(err)
		}
	}

	if err := archive.Close(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func validateExportRequest(request exportRequest) error {
	if request.Format != "json" && request.Format != "csv" {
		return fmt.Errorf("format must be json or csv")
	}
	if !request.IncludeSnapshots && !request.IncludeSettings && !request.IncludeCashFlow {
		return fmt.Errorf("select at least one section to export")
	}
	if request.FromMonth != "" && !validHealthMonth(request.FromMonth) {
		return fmt.Errorf("fromMonth must use YYYY-MM")
	}
	if request.ToMonth != "" && !validHealthMonth(request.ToMonth) {
		return fmt.Errorf("toMonth must use YYYY-MM")
	}
	if request.FromMonth != "" && request.ToMonth != "" && request.FromMonth > request.ToMonth {
		return fmt.Errorf("fromMonth must not be after toMonth")
	}
	return nil
}

func (api *toolsAPI) handleExport(c *gin.Context) {
	var request exportRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateExportRequest(request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	data, err := buildPortableExport(api.db, request)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	timestamp := time.Now().Format("20060102_150405")
	if request.Format == "json" {
		var buffer bytes.Buffer
		encoder := json.NewEncoder(&buffer)
		encoder.SetEscapeHTML(false)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(data); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="finn_export_%s.json"`, timestamp))
		c.Data(http.StatusOK, "application/json; charset=utf-8", buffer.Bytes())
		return
	}

	archive, err := buildCSVArchive(data, request)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="finn_export_%s.zip"`, timestamp))
	c.Data(http.StatusOK, "application/zip", archive)
}
