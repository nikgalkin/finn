package main

import (
	"context"
	"database/sql"
	"encoding/hex"
	"fmt"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/ncruces/go-sqlite3"
	sqlitedriver "github.com/ncruces/go-sqlite3/driver"
)

const (
	// sqlConsoleRowLimit caps the rows a single SELECT may stream back to the browser.
	sqlConsoleRowLimit = 500
	// sqlConsoleTimeout stops a runaway statement from pinning the database connection.
	sqlConsoleTimeout = 15 * time.Second
	// sqlConsoleMaxLength rejects oversized payloads before they reach SQLite.
	sqlConsoleMaxLength = 100_000
)

// sqlConsoleProtectedTables are readable but never writable: they hold database
// bookkeeping rather than user data, and corrupting them breaks startup.
var sqlConsoleProtectedTables = map[string]bool{
	"schema_migrations": true,
}

// sqlConsoleBlockedFunctions can touch the filesystem or load native code.
var sqlConsoleBlockedFunctions = map[string]bool{
	"load_extension": true,
	"readfile":       true,
	"writefile":      true,
	"edit":           true,
	"fts3_tokenizer": true,
	"zipfile":        true,
	"fsdir":          true,
}

// sqlConsoleDriverPragmas are issued by the SQLite driver itself on every new
// connection. Denying them makes the connection fail to open at all.
var sqlConsoleDriverPragmas = map[string]bool{
	"query_only":   true,
	"busy_timeout": true,
}

// sqlConsoleAllowedKeywords is the second enforcement layer. It exists because a
// bare REINDEX/VACUUM/ANALYZE never reaches the authorizer callback, and because
// it produces far better error messages than "authorization denied".
var sqlConsoleAllowedKeywords = map[string]bool{
	"select":  true,
	"with":    true,
	"values":  true,
	"explain": true,
	"insert":  true,
	"update":  true,
	"delete":  true,
	"replace": true,
}

var sqlConsoleWriteKeywords = map[string]bool{
	"insert":  true,
	"update":  true,
	"delete":  true,
	"replace": true,
}

// sqlConsoleAuthorizer is the real security boundary. SQLite invokes it while
// compiling every statement, so it cannot be bypassed by comments, nested
// queries, CTEs or chained statements the way a regexp validator can.
func sqlConsoleAuthorizer(action sqlite3.AuthorizerActionCode, name3rd, name4th, schema, inner string) sqlite3.AuthorizerReturnCode {
	switch action {
	case sqlite3.AUTH_SELECT, sqlite3.AUTH_READ, sqlite3.AUTH_TRANSACTION, sqlite3.AUTH_SAVEPOINT, sqlite3.AUTH_RECURSIVE:
		return sqlite3.AUTH_OK

	case sqlite3.AUTH_FUNCTION:
		if sqlConsoleBlockedFunctions[strings.ToLower(name4th)] {
			return sqlite3.AUTH_DENY
		}
		return sqlite3.AUTH_OK

	case sqlite3.AUTH_PRAGMA:
		if sqlConsoleDriverPragmas[strings.ToLower(name3rd)] {
			return sqlite3.AUTH_OK
		}
		return sqlite3.AUTH_DENY

	case sqlite3.AUTH_INSERT, sqlite3.AUTH_UPDATE, sqlite3.AUTH_DELETE:
		if schema != "" && schema != "main" {
			return sqlite3.AUTH_DENY
		}
		table := strings.ToLower(name3rd)
		if strings.HasPrefix(table, "sqlite_") || sqlConsoleProtectedTables[table] {
			return sqlite3.AUTH_DENY
		}
		return sqlite3.AUTH_OK
	}

	// Everything else (DDL, ATTACH/DETACH, VACUUM, REINDEX, ANALYZE, vtables) is denied.
	return sqlite3.AUTH_DENY
}

// leadingSQLKeyword returns the first keyword of a statement, ignoring leading comments.
func leadingSQLKeyword(statement string) string {
	trimmed := strings.TrimSpace(statement)
	for {
		switch {
		case strings.HasPrefix(trimmed, "--"):
			newline := strings.IndexByte(trimmed, '\n')
			if newline < 0 {
				return ""
			}
			trimmed = strings.TrimSpace(trimmed[newline+1:])
		case strings.HasPrefix(trimmed, "/*"):
			end := strings.Index(trimmed, "*/")
			if end < 0 {
				return ""
			}
			trimmed = strings.TrimSpace(trimmed[end+2:])
		default:
			word := trimmed
			cut := strings.IndexFunc(word, func(r rune) bool {
				return r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '(' || r == ';'
			})
			if cut >= 0 {
				word = word[:cut]
			}
			return strings.ToLower(word)
		}
	}
}

// stripSQLNoise removes string literals, quoted identifiers and comments so that
// keyword scanning cannot be fooled by data that merely looks like SQL.
func stripSQLNoise(statement string) string {
	var builder strings.Builder
	builder.Grow(len(statement))
	for index := 0; index < len(statement); index++ {
		switch current := statement[index]; current {
		case '\'', '"', '`':
			quote := current
			index++
			for index < len(statement) {
				if statement[index] == quote {
					if index+1 < len(statement) && statement[index+1] == quote {
						index++
					} else {
						break
					}
				}
				index++
			}
			builder.WriteByte(' ')
		case '[':
			for index < len(statement) && statement[index] != ']' {
				index++
			}
			builder.WriteByte(' ')
		case '-':
			if index+1 < len(statement) && statement[index+1] == '-' {
				for index < len(statement) && statement[index] != '\n' {
					index++
				}
				builder.WriteByte(' ')
				continue
			}
			builder.WriteByte(current)
		case '/':
			if index+1 < len(statement) && statement[index+1] == '*' {
				index += 2
				for index+1 < len(statement) && !(statement[index] == '*' && statement[index+1] == '/') {
					index++
				}
				index++
				builder.WriteByte(' ')
				continue
			}
			builder.WriteByte(current)
		default:
			builder.WriteByte(current)
		}
	}
	return builder.String()
}

// statementIsWrite reports whether a statement mutates rows. A leading WITH may
// still front an INSERT/UPDATE/DELETE, so the CTE body is scanned as well.
func statementIsWrite(statement string) bool {
	keyword := leadingSQLKeyword(statement)
	if sqlConsoleWriteKeywords[keyword] {
		return true
	}
	if keyword != "with" {
		return false
	}
	for _, field := range strings.Fields(strings.ToLower(stripSQLNoise(statement))) {
		if sqlConsoleWriteKeywords[strings.Trim(field, "(),;")] {
			return true
		}
	}
	return false
}

// sqlConsoleColumnSource traces a result column back to the table column it came
// from, so the UI can offer to build an UPDATE for it. Both fields are empty for
// computed columns such as count(*), which belong to no table.
type sqlConsoleColumnSource struct {
	Table  string `json:"table"`
	Column string `json:"column"`
}

type sqlConsoleStatement struct {
	Index         int                      `json:"index"`
	SQL           string                   `json:"sql"`
	Kind          string                   `json:"kind"`
	Columns       []string                 `json:"columns,omitempty"`
	ColumnSources []sqlConsoleColumnSource `json:"columnSources,omitempty"`
	Rows          [][]any                  `json:"rows,omitempty"`
	RowCount      int                      `json:"rowCount"`
	RowsAffected  int64                    `json:"rowsAffected"`
	Truncated     bool                     `json:"truncated"`
	DurationMs    int64                    `json:"durationMs"`
}

type sqlConsoleRequest struct {
	SQL        string `json:"sql"`
	Mode       string `json:"mode"`
	SkipBackup bool   `json:"skipBackup"`
}

type sqlConsoleResponse struct {
	Mode        string                `json:"mode"`
	Committed   bool                  `json:"committed"`
	Statements  []sqlConsoleStatement `json:"statements"`
	TotalWrites int64                 `json:"totalWrites"`
	DurationMs  int64                 `json:"durationMs"`
	Backup      *BackupReport         `json:"backup,omitempty"`
}

type sqlConsoleColumn struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	NotNull    bool   `json:"notNull"`
	PrimaryKey bool   `json:"primaryKey"`
}

type sqlConsoleTable struct {
	Name     string             `json:"name"`
	ReadOnly bool               `json:"readOnly"`
	RowCount int64              `json:"rowCount"`
	Columns  []sqlConsoleColumn `json:"columns"`
}

// SQLConsole exposes a restricted SQL surface over the application database.
//
// It deliberately holds its own *sql.DB: the authorizer is installed per
// connection, and the application's shared handle must stay unrestricted.
type SQLConsole struct {
	restricted *sql.DB
	appDB      *sql.DB
	cfg        *Config
	isDemo     bool

	backupMutex sync.Mutex
	backupTaken bool
}

func newSQLConsole(cfg *Config, appDB *sql.DB, databasePath string, isDemo bool) (*SQLConsole, error) {
	restricted, err := sqlitedriver.Open(databasePath, func(conn *sqlite3.Conn) error {
		return conn.SetAuthorizer(sqlConsoleAuthorizer)
	})
	if err != nil {
		return nil, fmt.Errorf("open restricted sql console handle: %w", err)
	}
	restricted.SetMaxOpenConns(1)

	if _, err := restricted.Exec("SELECT 1"); err != nil {
		restricted.Close()
		return nil, fmt.Errorf("verify restricted sql console handle: %w", err)
	}

	return &SQLConsole{restricted: restricted, appDB: appDB, cfg: cfg, isDemo: isDemo}, nil
}

func (console *SQLConsole) Close() error {
	return console.restricted.Close()
}

// ensureBackup creates one restore point before the first write of this run.
// It returns the report so the caller can surface a failing backup target.
func (console *SQLConsole) ensureBackup() *BackupReport {
	console.backupMutex.Lock()
	defer console.backupMutex.Unlock()

	if console.backupTaken || console.isDemo || !console.cfg.Backup.Enabled {
		return nil
	}

	report := RunBackupJob(console.cfg, console.appDB)
	if report.Status != backupStatusFailed {
		console.backupTaken = true
	}
	return &report
}

func (console *SQLConsole) registerRoutes(api *gin.RouterGroup) {
	group := api.Group("/sql")
	group.Use(func(c *gin.Context) {
		// CORS is wide open for convenience, so the loopback+Origin check is what
		// stops any random site in the browser from driving this endpoint.
		if !isLocalRequest(c.Request) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "the SQL console is only available locally"})
			return
		}
		c.Next()
	})

	group.GET("/schema", console.handleSchema)
	group.POST("/exec", console.handleExec)
}

func (console *SQLConsole) handleSchema(c *gin.Context) {
	rows, err := console.appDB.Query(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	tables := make([]sqlConsoleTable, 0, len(names))
	for _, name := range names {
		table := sqlConsoleTable{
			Name:     name,
			ReadOnly: sqlConsoleProtectedTables[strings.ToLower(name)],
			Columns:  make([]sqlConsoleColumn, 0, 8),
		}

		columnRows, err := console.appDB.Query(
			`SELECT name, type, "notnull", pk FROM pragma_table_info(?)`, name,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		for columnRows.Next() {
			var column sqlConsoleColumn
			var notNull, primaryKey int
			if err := columnRows.Scan(&column.Name, &column.Type, &notNull, &primaryKey); err != nil {
				columnRows.Close()
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			column.NotNull = notNull != 0
			column.PrimaryKey = primaryKey != 0
			table.Columns = append(table.Columns, column)
		}
		columnRows.Close()

		// Identifiers cannot be bound as parameters; the name comes from
		// sqlite_master, and is quoted to stay safe against odd table names.
		countQuery := fmt.Sprintf(`SELECT count(*) FROM "%s"`, strings.ReplaceAll(name, `"`, `""`))
		if err := console.appDB.QueryRow(countQuery).Scan(&table.RowCount); err != nil {
			table.RowCount = -1
		}

		tables = append(tables, table)
	}

	c.JSON(http.StatusOK, gin.H{"tables": tables})
}

func (console *SQLConsole) handleExec(c *gin.Context) {
	var request sqlConsoleRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if strings.TrimSpace(request.SQL) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sql is required"})
		return
	}
	if len(request.SQL) > sqlConsoleMaxLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sql script is too large"})
		return
	}

	apply := request.Mode == "apply"

	statements := make([]string, 0, 4)
	for _, statement := range splitSQLStatements(request.SQL) {
		if trimmed := strings.TrimSpace(statement); trimmed != "" {
			statements = append(statements, trimmed)
		}
	}
	if len(statements) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sql is required"})
		return
	}

	// Reject the whole batch before touching the database if any statement is
	// out of scope, so a partially valid script never runs.
	hasWrite := false
	for index, statement := range statements {
		keyword := leadingSQLKeyword(statement)
		if !sqlConsoleAllowedKeywords[keyword] {
			label := strings.ToUpper(keyword)
			if label == "" {
				label = "this"
			}
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf(
					"%s statements are not allowed: this console may only read and change rows in existing tables (SELECT, INSERT, UPDATE, DELETE)",
					label,
				),
				"statementIndex": index + 1,
				"sql":            statement,
			})
			return
		}
		if statementIsWrite(statement) {
			hasWrite = true
		}
	}

	var backupReport *BackupReport
	if apply && hasWrite && !request.SkipBackup {
		backupReport = console.ensureBackup()
		if backupReport != nil && backupReport.Status == backupStatusFailed {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":  "a restore point could not be created, so nothing was applied",
				"backup": backupReport,
			})
			return
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), sqlConsoleTimeout)
	defer cancel()

	// One connection for the whole request: column provenance is read first,
	// then the transaction runs on that same connection.
	conn, err := console.restricted.Conn(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer conn.Close()

	sources := columnSourcesForStatements(ctx, conn, statements)

	started := time.Now()
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	results := make([]sqlConsoleStatement, 0, len(statements))
	var totalWrites int64

	for index, statement := range statements {
		result, err := runSQLConsoleStatement(ctx, tx, index+1, statement)
		result.ColumnSources = sources[index]
		if err != nil {
			_ = tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{
				"error":          err.Error(),
				"statementIndex": index + 1,
				"sql":            statement,
			})
			return
		}
		totalWrites += result.RowsAffected
		results = append(results, result)
	}

	committed := false
	if apply {
		if err := tx.Commit(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		committed = true
	} else if err := tx.Rollback(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	mode := "dry_run"
	if apply {
		mode = "apply"
	}

	c.JSON(http.StatusOK, sqlConsoleResponse{
		Mode:        mode,
		Committed:   committed,
		Statements:  results,
		TotalWrites: totalWrites,
		DurationMs:  time.Since(started).Milliseconds(),
		Backup:      backupReport,
	})
}

// columnSourcesForStatements compiles each read statement without running it and
// asks SQLite where every result column came from. Aliases, joins and CTEs all
// resolve to the underlying table column; computed expressions resolve to
// nothing, which is reported as an empty source.
//
// Failures here are not fatal: provenance only powers a UI convenience, and any
// real problem with the statement surfaces when it actually runs.
func columnSourcesForStatements(ctx context.Context, conn *sql.Conn, statements []string) map[int][]sqlConsoleColumnSource {
	sources := make(map[int][]sqlConsoleColumnSource, len(statements))

	err := conn.Raw(func(driverConn any) error {
		raw, ok := driverConn.(sqlitedriver.Conn)
		if !ok {
			return nil
		}
		native := raw.Raw()

		for index, statement := range statements {
			if statementIsWrite(statement) {
				continue
			}
			stmt, _, err := native.Prepare(statement)
			if err != nil || stmt == nil {
				continue
			}
			count := stmt.ColumnCount()
			columns := make([]sqlConsoleColumnSource, count)
			for column := range columns {
				columns[column] = sqlConsoleColumnSource{
					Table:  stmt.ColumnTableName(column),
					Column: stmt.ColumnOriginName(column),
				}
			}
			stmt.Close()
			sources[index] = columns
		}
		return nil
	})
	if err != nil {
		return map[int][]sqlConsoleColumnSource{}
	}
	return sources
}

func runSQLConsoleStatement(ctx context.Context, tx *sql.Tx, index int, statement string) (sqlConsoleStatement, error) {
	result := sqlConsoleStatement{Index: index, SQL: statement, Kind: "read"}
	started := time.Now()

	if statementIsWrite(statement) {
		result.Kind = "write"
		execResult, err := tx.ExecContext(ctx, statement)
		if err != nil {
			return result, describeSQLConsoleError(err)
		}
		if affected, err := execResult.RowsAffected(); err == nil {
			result.RowsAffected = affected
		}
		result.DurationMs = time.Since(started).Milliseconds()
		return result, nil
	}

	rows, err := tx.QueryContext(ctx, statement)
	if err != nil {
		return result, describeSQLConsoleError(err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return result, describeSQLConsoleError(err)
	}
	result.Columns = columns
	result.Rows = make([][]any, 0, 32)

	for rows.Next() {
		if result.RowCount >= sqlConsoleRowLimit {
			result.Truncated = true
			break
		}
		scanTargets := make([]any, len(columns))
		scanValues := make([]any, len(columns))
		for i := range scanValues {
			scanTargets[i] = &scanValues[i]
		}
		if err := rows.Scan(scanTargets...); err != nil {
			return result, describeSQLConsoleError(err)
		}
		row := make([]any, len(columns))
		for i, value := range scanValues {
			row[i] = jsonSafeSQLValue(value)
		}
		result.Rows = append(result.Rows, row)
		result.RowCount++
	}
	if err := rows.Err(); err != nil {
		return result, describeSQLConsoleError(err)
	}

	result.DurationMs = time.Since(started).Milliseconds()
	return result, nil
}

// describeSQLConsoleError turns SQLite's terse authorizer refusal into something
// that explains the actual policy.
func describeSQLConsoleError(err error) error {
	if err == nil {
		return nil
	}
	if strings.Contains(strings.ToLower(err.Error()), "not authorized") {
		return fmt.Errorf(
			"%w — this console may only read and change rows in existing tables; schema changes, PRAGMA, ATTACH and writes to internal tables are blocked",
			err,
		)
	}
	return err
}

func jsonSafeSQLValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case []byte:
		if utf8.Valid(typed) {
			return string(typed)
		}
		return "0x" + hex.EncodeToString(typed)
	case time.Time:
		return typed.Format(time.RFC3339)
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return fmt.Sprint(typed)
		}
		return typed
	default:
		return typed
	}
}
