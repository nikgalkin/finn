package main

import (
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// 1. Embedded assets definition
//
//go:embed frontend/dist
var frontendFS embed.FS

// 2. Global application version injection point
var version = "dev"

// openBrowser opens the specified URL in the default system browser based on the OS
func openBrowser(url string) {
	time.Sleep(200 * time.Millisecond)

	var err error
	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	case "windows":
		err = exec.Command("cmd", "/c", "start", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	default:
		err = fmt.Errorf("unsupported platform")
	}

	if err != nil {
		log.Printf("⚠️  Failed to open the browser automatically. Please navigate to: %s\n", url)
	}
}

func main() {
	// Define CLI flags
	noOpen := flag.Bool("no-open", false, "Disable automatic browser opening on startup")
	showVersion := flag.Bool("version", false, "Print the application version and exit")
	runDemo := flag.Bool("demo", false, "Run application with an isolated sample database (finn-demo.db)")
	forceDemo := flag.Bool("force-demo", false, "Force overwrite existing finn-demo.db with fresh sample data")
	restorePath := flag.String("restore", "", "Path to encrypted (.enc) or raw (.db) backup file to recover data from")
	showBackups := flag.Bool("show-backups", false, "Print configured backup target paths and exit")

	flag.BoolVar(showVersion, "v", false, "Print the application version and exit (shorthand)")
	flag.BoolVar(showBackups, "b", false, "Print configured backup target paths and exit (shorthand)")
	flag.Parse()

	if *showVersion {
		fmt.Printf("%s version %s (%s/%s)\n", "finn", version, runtime.GOOS, runtime.GOARCH)
		os.Exit(0)
	}

	// Load unified configuration settings (Viper + ENV)
	cfg := LoadConfig()

	if *showBackups {
		fmt.Println("📂 Configured Backup Targets & Files:")
		if len(cfg.Backup.Targets) == 0 {
			fmt.Println("   (No backup targets configured or backup is disabled)")
		} else {
			for _, target := range cfg.Backup.Targets {
				fmt.Printf("\n🎯 Target [%s]: %s (Retention: %d)\n", target.Name, target.Path, target.Retention)

				files, err := os.ReadDir(target.Path)
				if err != nil {
					fmt.Printf("   ⚠️  Failed to read directory: %v\n", err)
					continue
				}

				var foundAny bool
				for _, f := range files {
					if !f.IsDir() && strings.HasPrefix(f.Name(), backupPrefix) {
						fullPath := filepath.Join(target.Path, f.Name())

						info, err := f.Info()
						if err == nil {
							fmt.Printf("   📄 %s  (%d KB)  [%s]\n",
								fullPath,
								info.Size()/1024,
								info.ModTime().Format("2006-01-02 15:04:05"),
							)
						} else {
							fmt.Printf("   📄 %s\n", fullPath)
						}
						foundAny = true
					}
				}

				if !foundAny {
					fmt.Println("   (No backup files found in this directory yet)")
				}
			}
		}
		os.Exit(0)
	}

	// Handle standalone restore triggers before initializing standard processes
	if *restorePath != "" {
		RunRestoreJob(cfg, *restorePath)
		os.Exit(0)
	}

	// If --force-demo is active, it automatically implies --demo mode
	isDemoMode := *runDemo || *forceDemo

	// Handle force overwrite logic before initializing the database
	if *forceDemo {
		handleForceDemoCleanup()
	}

	// Initialize the database with configuration and demo context
	db := initDB(cfg, isDemoMode)
	defer db.Close()

	// Start the background backup worker if running in production mode
	if !isDemoMode {
		StartBackupScheduler(cfg, db)
	}

	// Mute heavy Gin debug logs in production releases
	if version != "dev" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// CORS configuration
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowAllOrigins = true
	r.Use(cors.New(corsConfig))

	// Register API endpoints from api.go
	setupAPI(r, db)

	// Inject the SPA frontend into the routing tree
	dist, err := fs.Sub(frontendFS, "frontend/dist")
	if err == nil {
		fileServer := http.FileServer(http.FS(dist))
		r.NoRoute(func(c *gin.Context) {
			if strings.HasPrefix(c.Request.URL.Path, "/api") {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
				return
			}

			path := strings.TrimPrefix(c.Request.URL.Path, "/")
			f, err := dist.Open(path)
			if err != nil {
				c.Request.URL.Path = "/"
			} else {
				f.Close()
			}
			fileServer.ServeHTTP(c.Writer, c.Request)
		})
	} else {
		log.Println("⚠️  Frontend assets not detected. Run 'npm run build' inside 'frontend/' folder.")
	}

	serverAddr := fmt.Sprintf("127.0.0.1:%d", cfg.App.Port)
	url := fmt.Sprintf("http://localhost:%d", cfg.App.Port)

	srv := &http.Server{
		Addr:    serverAddr,
		Handler: r,
	}

	// Spin up the network engine inside an independent routine
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Server CRITICAL crash: %v\n", err)
		}
	}()
	log.Printf("Server starting on %s (Version: %s)\n", url, version)

	if !*noOpen && cfg.App.OpenBrowser {
		go openBrowser(url)
	} else {
		log.Println("⚠️  Automatic browser opening is disabled.")
	}

	// === GRACEFUL SHUTDOWN ENGINE ===
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	<-quit
	log.Println("\n🛑 Shutdown: Received termination signal. Initiating graceful wrap-up...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("⚠️  Shutdown: Web server forced to offline: %v\n", err)
	}

	if !isDemoMode {
		log.Println("💾 Shutdown: Executing final synchronized safety backup...")
		RunBackupJob(cfg, db)
	}

	log.Println("👋 Shutdown: Systems safely cleared. Server offline. Goodbye!")
}
