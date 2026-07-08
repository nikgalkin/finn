package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	backupPrefix     = "finn_backup_"
	backupTimeFormat = "2006_01_02_150405"
	extEncrypted     = "enc"
	extRaw           = "db"
)

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
func rotateBackups(target BackupTarget) {
	files, err := os.ReadDir(target.Path)
	if err != nil {
		log.Printf("⚠️  Rotation [%s]: Failed to read directory: %v\n", target.Name, err)
		return
	}

	var backupFiles []os.FileInfo
	for _, f := range files {
		if !f.IsDir() && strings.HasPrefix(f.Name(), backupPrefix) {
			info, err := f.Info()
			if err == nil {
				backupFiles = append(backupFiles, info)
			}
		}
	}

	if len(backupFiles) <= target.Retention {
		return
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
			log.Printf("⚠️  Rotation [%s]: Failed to delete old backup %s: %v\n", target.Name, backupFiles[i].Name(), err)
		} else {
			log.Printf("🗑️  Rotation [%s]: Deleted obsolete backup: %s\n", target.Name, backupFiles[i].Name())
		}
	}
}

// RunBackupJob triggers the main operational backup loop
func RunBackupJob(cfg *Config, db *sql.DB) {
	if !cfg.Backup.Enabled {
		return
	}

	dbPath := resolveDatabasePath(cfg.Database.Filename)
	dbBytes, err := os.ReadFile(dbPath)
	if err != nil {
		log.Printf("⚠️  Backup: Failed to read primary database file: %v\n", err)
		return
	}

	var finalData []byte
	var extension string

	if cfg.Backup.CipherKey != "" {
		log.Println("🔒 Backup: Encrypting dataset via Post-Quantum resilient AES-256-GCM...")
		encrypted, err := encryptData(dbBytes, cfg.Backup.CipherKey)
		if err != nil {
			log.Printf("⚠️  Backup: Encryption failed: %v\n", err)
			return
		}
		finalData = encrypted
		extension = extEncrypted
	} else {
		log.Println("⚠️  Backup: Running without encryption (unsecured payload).")
		finalData = dbBytes
		extension = extRaw
	}

	timestamp := time.Now().Format(backupTimeFormat)
	filename := fmt.Sprintf("%s%s.%s", backupPrefix, timestamp, extension)

	for _, target := range cfg.Backup.Targets {
		if err := os.MkdirAll(target.Path, 0755); err != nil {
			log.Printf("⚠️  Backup [Target %s]: Directory creation skipped at %s: %v\n", target.Name, target.Path, err)
			continue
		}

		targetFile := filepath.Join(target.Path, filename)
		if err := os.WriteFile(targetFile, finalData, 0600); err != nil {
			log.Printf("❌ Backup [Target %s]: File write failed at %s: %v\n", target.Name, targetFile, err)
		} else {
			log.Printf("✅ Backup [Target %s]: Saved to %s\n", target.Name, targetFile)
			rotateBackups(target)
		}
	}
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
			log.Fatalf("❌ Restore CRITICAL: File is encrypted, but FINN_BACKUP_CIPHER_KEY environment variable is empty!\n")
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
