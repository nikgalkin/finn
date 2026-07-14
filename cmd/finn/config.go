package main

import (
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

func LoadConfig() *Config {
	// 1. Настраиваем поиск YAML файла
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")

	homeDir, err := os.UserHomeDir()
	if err == nil {
		viper.AddConfigPath(filepath.Join(homeDir, ".finn")) // Приоритет 1: ~/.finn/config.yaml
	}
	viper.AddConfigPath(".") // Приоритет 2: ./config.yaml (для девелопмента)

	// 2. Настраиваем подтягивание переменных окружения (Environment Variables)
	viper.SetEnvPrefix("FINN")
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_")) // backup.cipher_key -> FINN_BACKUP_CIPHER_KEY
	viper.AutomaticEnv()                                   // Заставляем Viper проверять ENV при вызове Get()
	err = viper.BindEnv("backup.cipher_key")
	if err != nil {
		log.Fatalf("❌ Config CRITICAL: Unable to bind backup.cipher_key: %v\n", err)
	}

	// Устанавливаем дефолты на случай, если конфиг-файла вообще нет
	viper.SetDefault("app.port", 8080)
	viper.SetDefault("app.open_browser", true)
	viper.SetDefault("database.filename", "finn.db")
	viper.SetDefault("database.demo_filename", "finn-demo.db")
	viper.SetDefault("backup.enabled", false)
	viper.SetDefault("backup.only_if_changed", true)
	viper.SetDefault("backup.interval_hours", 12)

	// Читаем конфиг-файл
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			log.Println("ℹ️  Config: No config.yaml found, using environment variables and defaults.")
		} else {
			log.Printf("⚠️  Config: Error reading config file: %v\n", err)
		}
	} else {
		log.Printf("ℹ️  Config: Loaded from %s\n", viper.ConfigFileUsed())
	}

	// 3. Распаковываем всё в нашу структуру
	var config Config
	if err := viper.Unmarshal(&config); err != nil {
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

	return &config
}
