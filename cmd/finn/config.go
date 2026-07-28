package main

import (
	"errors"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	App      AppConfig    `mapstructure:"app"`
	Database DBConfig     `mapstructure:"database"`
	Backup   BackupConfig `mapstructure:"backup"`
}

type AppConfig struct {
	Port        int  `mapstructure:"port"`
	OpenBrowser bool `mapstructure:"open_browser"`
}

type DBConfig struct {
	Filename     string `mapstructure:"filename"`
	DemoFilename string `mapstructure:"demo_filename"`
}

type BackupConfig struct {
	Enabled       bool           `mapstructure:"enabled"`
	OnlyIfChanged bool           `mapstructure:"only_if_changed"`
	IntervalHours int            `mapstructure:"interval_hours"`
	CipherKey     string         `mapstructure:"cipher_key"`
	Targets       []BackupTarget `mapstructure:"targets"`
}

type BackupTarget struct {
	Name      string `mapstructure:"name"`
	Path      string `mapstructure:"path"`
	Retention int    `mapstructure:"retention"`
}

// LoadConfig reads the configuration, optionally from an explicit path. An
// explicit path that cannot be read is fatal: silently falling back to the
// defaults would point the app at another database than the one asked for.
func LoadConfig(explicitPath string) *Config {
	v := viper.New()

	// 1. Настраиваем поиск YAML файла
	if explicitPath != "" {
		v.SetConfigFile(explicitPath)
	} else {
		v.SetConfigName("config")
		v.SetConfigType("yaml")

		homeDir, err := os.UserHomeDir()
		if err == nil {
			v.AddConfigPath(filepath.Join(homeDir, ".finn")) // Приоритет 1: ~/.finn/config.yaml
		}
		v.AddConfigPath(".") // Приоритет 2: ./config.yaml (для девелопмента)
	}

	// 2. Настраиваем подтягивание переменных окружения (Environment Variables)
	v.SetEnvPrefix("FINN")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_")) // backup.cipher_key -> FINN_BACKUP_CIPHER_KEY
	v.AutomaticEnv()                                   // Заставляем Viper проверять ENV при вызове Get()
	if err := v.BindEnv("backup.cipher_key"); err != nil {
		log.Fatalf("❌ Config CRITICAL: Unable to bind backup.cipher_key: %v\n", err)
	}

	// Устанавливаем дефолты на случай, если конфиг-файла вообще нет
	v.SetDefault("app.port", 8080)
	v.SetDefault("app.open_browser", true)
	v.SetDefault("database.filename", "finn.db")
	v.SetDefault("database.demo_filename", "finn-demo.db")
	v.SetDefault("backup.enabled", false)
	v.SetDefault("backup.only_if_changed", true)
	v.SetDefault("backup.interval_hours", 12)

	// Читаем конфиг-файл
	if err := v.ReadInConfig(); err != nil {
		var notFound viper.ConfigFileNotFoundError
		switch {
		case explicitPath != "":
			log.Fatalf("❌ Config CRITICAL: Unable to read %s: %v\n", explicitPath, err)
		case errors.As(err, &notFound):
			log.Println("ℹ️  Config: No config.yaml found, using environment variables and defaults.")
		default:
			log.Printf("⚠️  Config: Error reading config file: %v\n", err)
		}
	} else {
		log.Printf("ℹ️  Config: Loaded from %s\n", v.ConfigFileUsed())
	}

	// 3. Распаковываем всё в нашу структуру
	var config Config
	if err := v.Unmarshal(&config); err != nil {
		log.Fatalf("❌ Config CRITICAL: Unable to decode into struct: %v\n", err)
	}

	// Обработка путей ($HOME) и выставление дефолтного retention
	for i := range config.Backup.Targets {
		config.Backup.Targets[i].Path = os.ExpandEnv(config.Backup.Targets[i].Path)

		// Если retention не указан в YAML или равен 0, ставим дефолт 10
		if config.Backup.Targets[i].Retention <= 0 {
			config.Backup.Targets[i].Retention = 10
		}
	}

	if config.Backup.Enabled && config.Backup.CipherKey == "" {
		log.Println("⚠️  BACKUP WARNING: Backup is enabled, but backup.cipher_key is empty! Encryption will be bypassed.")
	}

	if _, generated := rawBackupKey(config.Backup.CipherKey); config.Backup.CipherKey != "" && !generated {
		log.Println("ℹ️  Backup: backup.cipher_key looks like a passphrase, so it is stretched with Argon2id. 'finn backup generate-key' produces a stronger key.")
	}

	return &config
}
