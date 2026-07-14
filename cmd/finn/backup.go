package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	backupPrefix     = "finn_backup_"
	backupTimeFormat = "2006_01_02_150405"
	backupHashLength = 32
	extEncrypted     = "enc"
	extRaw           = "db"
)

const (
	backupStatusDisabled = "disabled"
	backupStatusSkipped  = "skipped"
	backupStatusSuccess  = "success"
	backupStatusPartial  = "partial"
	backupStatusFailed   = "failed"
)

var backupJobMutex sync.Mutex

type BackupTargetResult struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

type BackupReport struct {
	Status      string               `json:"status"`
	Fingerprint string               `json:"fingerprint,omitempty"`
	Targets     []BackupTargetResult `json:"targets,omitempty"`
	Error       string               `json:"error,omitempty"`
}

func writeFingerprintString(h hash.Hash, value string) {
	var length [8]byte
	binary.BigEndian.PutUint64(length[:], uint64(len(value)))
	_, _ = h.Write(length[:])
	_, _ = h.Write([]byte(value))
}

// databaseFingerprint hashes the logical database state rather than SQLite file
// bytes, which may change because of WAL bookkeeping even when user data does not.
func databaseFingerprint(db *sql.DB) (string, error) {
	h := sha256.New()

	rows, err := db.Query("SELECT id, month, data, duration_seconds FROM snapshots ORDER BY id")
	if err != nil {
		return "", err
	}
	for rows.Next() {
		var id int64
		var month, data string
		var duration sql.NullInt64
		if err := rows.Scan(&id, &month, &data, &duration); err != nil {
			rows.Close()
			return "", err
		}
		_, _ = h.Write([]byte{'S'})
		var number [8]byte
		binary.BigEndian.PutUint64(number[:], uint64(id))
		_, _ = h.Write(number[:])
		writeFingerprintString(h, month)
		writeFingerprintString(h, data)
		if duration.Valid {
			_, _ = h.Write([]byte{1})
			binary.BigEndian.PutUint64(number[:], uint64(duration.Int64))
			_, _ = h.Write(number[:])
		} else {
			_, _ = h.Write([]byte{0})
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return "", err
	}
	rows.Close()

	rows, err = db.Query("SELECT key, value FROM settings ORDER BY key")
	if err != nil {
		return "", err
	}
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			rows.Close()
			return "", err
		}
		_, _ = h.Write([]byte{'C'})
		writeFingerprintString(h, key)
		writeFingerprintString(h, value)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return "", err
	}
	rows.Close()

	return hex.EncodeToString(h.Sum(nil)), nil
}

func fingerprintFromBackupName(name string) string {
	extension := filepath.Ext(name)
	if extension != "."+extRaw && extension != "."+extEncrypted {
		return ""
	}
	base := strings.TrimSuffix(name, extension)
	separator := strings.LastIndexByte(base, '_')
	if separator < 0 {
		return ""
	}
	fingerprint := base[separator+1:]
	if len(fingerprint) != backupHashLength && len(fingerprint) != sha256.Size*2 {
		return ""
	}
	if _, err := hex.DecodeString(fingerprint); err != nil {
		return ""
	}
	return strings.ToLower(fingerprint)
}

func latestBackupFingerprint(target BackupTarget) (string, error) {
	files, err := os.ReadDir(target.Path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", fmt.Errorf("failed to read backup directory: %w", err)
	}

	var latestName string
	var latestModTime time.Time
	for _, file := range files {
		if file.IsDir() || !strings.HasPrefix(file.Name(), backupPrefix) {
			continue
		}
		info, err := file.Info()
		if err != nil {
			return "", fmt.Errorf("failed to inspect backup file %q: %w", file.Name(), err)
		}
		if latestName == "" || info.ModTime().After(latestModTime) || (info.ModTime().Equal(latestModTime) && file.Name() > latestName) {
			latestName = file.Name()
			latestModTime = info.ModTime()
		}
	}

	return fingerprintFromBackupName(latestName), nil
}

func backupFilename(timestamp, fingerprint, extension string, sequence int) string {
	shortFingerprint := fingerprint[:backupHashLength]
	if sequence == 1 {
		return fmt.Sprintf("%s%s_%s.%s", backupPrefix, timestamp, shortFingerprint, extension)
	}
	return fmt.Sprintf("%s%s_%d_%s.%s", backupPrefix, timestamp, sequence, shortFingerprint, extension)
}

func generateBackupCipherKey() (string, error) {
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return "", fmt.Errorf("failed to generate random backup key: %w", err)
	}
	return base64.StdEncoding.EncodeToString(key), nil
}

func writeBackupFile(target BackupTarget, timestamp, fingerprint, extension string, data []byte) (string, error) {
	for sequence := 1; ; sequence++ {
		targetFile := filepath.Join(target.Path, backupFilename(timestamp, fingerprint, extension, sequence))
		file, err := os.OpenFile(targetFile, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if errors.Is(err, os.ErrExist) {
			continue
		}
		if err != nil {
			return "", err
		}
		if _, err := file.Write(data); err != nil {
			_ = file.Close()
			_ = os.Remove(targetFile)
			return "", err
		}
		if err := file.Close(); err != nil {
			_ = os.Remove(targetFile)
			return "", err
		}
		return targetFile, nil
	}
}

// encryptData blocks the bytes using AES-256-GCM
func encryptData(plaintext []byte, passphrase string) ([]byte, error) {
	key := sha256.Sum256([]byte(passphrase))

	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	ciphertext := aesGCM.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// decryptData unseals the encrypted bytes using AES-256-GCM
func decryptData(ciphertext []byte, passphrase string) ([]byte, error) {
	key := sha256.Sum256([]byte(passphrase))

	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, encryptedPayload := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, encryptedPayload, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption failed (bad key or corrupted data)")
	}

	return plaintext, nil
}

// rotateBackups keeps only the N newest backups in the specified target directory
func rotateBackups(target BackupTarget) error {
	files, err := os.ReadDir(target.Path)
	if err != nil {
		return fmt.Errorf("failed to read directory: %w", err)
	}

	var backupFiles []os.FileInfo
	for _, f := range files {
		if !f.IsDir() && strings.HasPrefix(f.Name(), backupPrefix) {
			info, err := f.Info()
			if err != nil {
				return fmt.Errorf("failed to inspect backup file %q: %w", f.Name(), err)
			}
			backupFiles = append(backupFiles, info)
		}
	}

	if len(backupFiles) <= target.Retention {
		return nil
	}

	sort.Slice(backupFiles, func(i, j int) bool {
		return backupFiles[i].ModTime().Before(backupFiles[j].ModTime())
	})

	overflowCount := len(backupFiles) - target.Retention
	log.Printf("🧹 Rotation [%s]: Found %d backups (limit is %d). Cleaning up %d oldest file(s)...\n",
		target.Name, len(backupFiles), target.Retention, overflowCount)

	for i := 0; i < overflowCount; i++ {
		fileToDelete := filepath.Join(target.Path, backupFiles[i].Name())
		if err := os.Remove(fileToDelete); err != nil {
			return fmt.Errorf("failed to delete old backup %q: %w", backupFiles[i].Name(), err)
		}
		log.Printf("🗑️  Rotation [%s]: Deleted obsolete backup: %s\n", target.Name, backupFiles[i].Name())
	}

	return nil
}

func verifyBackupFile(path string, expected []byte) error {
	actual, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("failed to read written backup: %w", err)
	}
	if sha256.Sum256(actual) != sha256.Sum256(expected) {
		return fmt.Errorf("written backup contents do not match the source data")
	}
	return nil
}

func finalizeBackupReport(report BackupReport) BackupReport {
	var current, created, warnings, failed int
	for _, target := range report.Targets {
		switch target.Status {
		case "current":
			current++
		case "created":
			created++
		case "created_with_warning":
			created++
			warnings++
		case "failed":
			failed++
		}
	}

	switch {
	case failed > 0 && current+created > 0:
		report.Status = backupStatusPartial
	case failed > 0:
		report.Status = backupStatusFailed
	case warnings > 0:
		report.Status = backupStatusPartial
	case created > 0:
		report.Status = backupStatusSuccess
	default:
		report.Status = backupStatusSkipped
	}
	return report
}

func failPendingTargets(report *BackupReport, message string) {
	for i := range report.Targets {
		if report.Targets[i].Status == "pending" {
			report.Targets[i].Status = "failed"
			report.Targets[i].Error = message
		}
	}
}

// RunBackupJob creates a consistent snapshot only for targets whose latest
// successful backup does not match the current logical database state.
func RunBackupJob(cfg *Config, db *sql.DB) BackupReport {
	backupJobMutex.Lock()
	defer backupJobMutex.Unlock()

	if !cfg.Backup.Enabled {
		return BackupReport{Status: backupStatusDisabled}
	}
	if len(cfg.Backup.Targets) == 0 {
		return BackupReport{Status: backupStatusFailed, Error: "backup is enabled but no targets are configured"}
	}

	fingerprint, err := databaseFingerprint(db)
	if err != nil {
		message := fmt.Sprintf("failed to calculate database fingerprint: %v", err)
		log.Printf("❌ Backup: %s\n", message)
		return BackupReport{Status: backupStatusFailed, Error: message}
	}

	report := BackupReport{
		Fingerprint: fingerprint,
		Targets:     make([]BackupTargetResult, len(cfg.Backup.Targets)),
	}
	pendingCount := 0
	for i, target := range cfg.Backup.Targets {
		status := "pending"
		storedFingerprint, inspectErr := latestBackupFingerprint(target)
		var targetError string
		if inspectErr != nil {
			targetError = fmt.Sprintf("could not inspect existing backups before creating a new one: %v", inspectErr)
			pendingCount++
			log.Printf("⚠️  Backup [Target %s]: Cannot inspect %s; write will still be attempted: %v\n", target.Name, target.Path, inspectErr)
		} else if cfg.Backup.OnlyIfChanged && storedFingerprint != "" && strings.HasPrefix(fingerprint, storedFingerprint) {
			status = "current"
			log.Printf("⏭️  Backup [Target %s]: Database is unchanged; keeping the existing backup.\n", target.Name)
		} else {
			pendingCount++
		}
		report.Targets[i] = BackupTargetResult{Name: target.Name, Path: target.Path, Status: status, Error: targetError}
	}
	if !cfg.Backup.OnlyIfChanged {
		log.Println("ℹ️  Backup: only_if_changed is disabled; creating a new backup regardless of database changes.")
	}
	if pendingCount == 0 {
		return finalizeBackupReport(report)
	}

	tempFile, err := os.CreateTemp("", "finn-backup-*.db")
	if err != nil {
		failPendingTargets(&report, fmt.Sprintf("failed to allocate temporary backup file: %v", err))
		return finalizeBackupReport(report)
	}
	tempPath := tempFile.Name()
	if err := tempFile.Close(); err != nil {
		_ = os.Remove(tempPath)
		failPendingTargets(&report, fmt.Sprintf("failed to prepare temporary backup file: %v", err))
		return finalizeBackupReport(report)
	}
	// VACUUM INTO requires its destination not to exist.
	if err := os.Remove(tempPath); err != nil {
		failPendingTargets(&report, fmt.Sprintf("failed to prepare temporary backup path: %v", err))
		return finalizeBackupReport(report)
	}

	// Run SQLite VACUUM INTO to get a consistent backup snapshot safely
	log.Println("💾 Backup: Running SQLite VACUUM INTO to create consistent snapshot...")
	escapedPath := strings.ReplaceAll(tempPath, "'", "''")
	if _, err := db.Exec(fmt.Sprintf("VACUUM INTO '%s'", escapedPath)); err != nil {
		log.Printf("❌ Backup: SQLite VACUUM INTO failed: %v\n", err)
		failPendingTargets(&report, fmt.Sprintf("SQLite VACUUM INTO failed: %v", err))
		return finalizeBackupReport(report)
	}

	// Clean up temp file after reading
	defer func() {
		if err := os.Remove(tempPath); err != nil && !os.IsNotExist(err) {
			log.Printf("⚠️  Backup: Failed to clean up temporary backup file: %v\n", err)
		}
	}()

	dbBytes, err := os.ReadFile(tempPath)
	if err != nil {
		log.Printf("⚠️  Backup: Failed to read temporary backup file: %v\n", err)
		failPendingTargets(&report, fmt.Sprintf("failed to read temporary backup file: %v", err))
		return finalizeBackupReport(report)
	}

	var finalData []byte
	var extension string

	if cfg.Backup.CipherKey != "" {
		log.Println("🔒 Backup: Encrypting dataset via Post-Quantum resilient AES-256-GCM...")
		encrypted, err := encryptData(dbBytes, cfg.Backup.CipherKey)
		if err != nil {
			log.Printf("⚠️  Backup: Encryption failed: %v\n", err)
			failPendingTargets(&report, fmt.Sprintf("encryption failed: %v", err))
			return finalizeBackupReport(report)
		}
		finalData = encrypted
		extension = extEncrypted
	} else {
		log.Println("⚠️  Backup: Running without encryption (unsecured payload).")
		finalData = dbBytes
		extension = extRaw
	}

	timestamp := time.Now().Format(backupTimeFormat)
	for i, target := range cfg.Backup.Targets {
		if report.Targets[i].Status != "pending" {
			continue
		}
		var warnings []string
		if report.Targets[i].Error != "" {
			warnings = append(warnings, report.Targets[i].Error)
		}
		if err := os.MkdirAll(target.Path, 0755); err != nil {
			log.Printf("⚠️  Backup [Target %s]: Directory creation skipped at %s: %v\n", target.Name, target.Path, err)
			report.Targets[i].Status = "failed"
			report.Targets[i].Error = strings.Join(append(warnings, fmt.Sprintf("failed to create backup directory: %v", err)), "; ")
			continue
		}

		targetFile, err := writeBackupFile(target, timestamp, fingerprint, extension, finalData)
		if err != nil {
			log.Printf("❌ Backup [Target %s]: File write failed at %s: %v\n", target.Name, target.Path, err)
			report.Targets[i].Status = "failed"
			report.Targets[i].Error = strings.Join(append(warnings, fmt.Sprintf("failed to write backup file: %v", err)), "; ")
			continue
		}
		if err := verifyBackupFile(targetFile, finalData); err != nil {
			log.Printf("⚠️  Backup [Target %s]: Read-back verification failed at %s: %v\n", target.Name, targetFile, err)
			warnings = append(warnings, fmt.Sprintf("backup was written but read-back verification failed: %v", err))
		}
		if err := rotateBackups(target); err != nil {
			log.Printf("⚠️  Rotation [%s]: %v\n", target.Name, err)
			warnings = append(warnings, fmt.Sprintf("old backups may not be cleaned up: %v", err))
		}
		if len(warnings) > 0 {
			log.Printf("⚠️  Backup [Target %s]: Saved to %s with warnings\n", target.Name, targetFile)
			report.Targets[i].Status = "created_with_warning"
			report.Targets[i].Error = strings.Join(warnings, "; ")
			continue
		}
		log.Printf("✅ Backup [Target %s]: Saved and verified at %s\n", target.Name, targetFile)
		report.Targets[i].Status = "created"
	}

	return finalizeBackupReport(report)
}

// RunRestoreJob overwrites the current database with the specified backup file safely
func RunRestoreJob(cfg *Config, backupFilePath string) {
	log.Printf("📥 Restore: Initializing recovery from %s...\n", backupFilePath)

	if _, err := os.Stat(backupFilePath); os.IsNotExist(err) {
		log.Fatalf("❌ Restore CRITICAL: Backup file not found at %s\n", backupFilePath)
	}

	dbPath := resolveDatabasePath(cfg.Database.Filename)

	// Безопасность: делаем копию заменяемой базы прямо в той же папке рядом с исходным файлом базы
	if _, err := os.Stat(dbPath); err == nil {
		safetyCopy := dbPath + ".bak_" + time.Now().Format("2006_01_02_150405")
		log.Printf("💾 Restore: Creating emergency pre-restore copy of replaced DB at: %s\n", safetyCopy)
		input, err := os.ReadFile(dbPath)
		if err != nil {
			log.Fatalf("❌ Restore CRITICAL: Cannot read current database to create safety copy: %v\n", err)
		}
		if err := os.WriteFile(safetyCopy, input, 0600); err != nil {
			log.Fatalf("❌ Restore CRITICAL: Failed to write safety copy file: %v\n", err)
		}
	}

	backupBytes, err := os.ReadFile(backupFilePath)
	if err != nil {
		log.Fatalf("❌ Restore CRITICAL: Failed to read backup file: %v\n", err)
	}

	var finalDbBytes []byte

	if filepath.Ext(backupFilePath) == "."+extEncrypted {
		if cfg.Backup.CipherKey == "" {
			log.Fatalf("❌ Restore CRITICAL: File is encrypted, but backup.cipher_key is empty!\n")
		}
		log.Println("🔓 Restore: Decrypting dataset via AES-256-GCM...")
		decrypted, err := decryptData(backupBytes, cfg.Backup.CipherKey)
		if err != nil {
			log.Fatalf("❌ Restore CRITICAL: %v\n", err)
		}
		finalDbBytes = decrypted
	} else {
		log.Println("ℹ️  Restore: File is unencrypted. Proceeding with direct injection.")
		finalDbBytes = backupBytes
	}

	if err := os.WriteFile(dbPath, finalDbBytes, 0644); err != nil {
		log.Fatalf("❌ Restore CRITICAL: Failed to write to target database %s: %v\n", dbPath, err)
	}

	log.Println("✅ Restore: Database successfully recovered! You can now start the application normally.")
}

// StartBackupScheduler handles the async ticking routine
func StartBackupScheduler(cfg *Config, db *sql.DB) {
	if !cfg.Backup.Enabled || cfg.Backup.IntervalHours <= 0 {
		return
	}

	ticker := time.NewTicker(time.Duration(cfg.Backup.IntervalHours) * time.Hour)
	go func() {
		for range ticker.C {
			log.Println("⏰ Backup: Scheduled trigger initialized.")
			RunBackupJob(cfg, db)
		}
	}()
	log.Printf("ℹ️  Backup: Background scheduler armed. Interval: every %d hours.\n", cfg.Backup.IntervalHours)
}
