package main

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	appassets "finn"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// Global application version injection point
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
	if err := newRootCommand().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runApp(opts appOptions) error {
	cfg := LoadConfig()

	// If --force-demo is active, it automatically implies --demo mode
	isDemoMode := opts.demo || opts.forceDemo

	// Handle force overwrite logic before initializing the database
	if opts.forceDemo {
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
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	var appShutdownHandledBackup atomic.Bool
	requestShutdown := func() {
		appShutdownHandledBackup.Store(true)
		select {
		case quit <- syscall.SIGTERM:
		default:
		}
	}

	// CORS configuration
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowAllOrigins = true
	r.Use(cors.New(corsConfig))

	// Register API endpoints from api.go
	setupAPI(r, db, requestShutdown, func() BackupReport {
		if isDemoMode {
			return BackupReport{Status: backupStatusDisabled}
		}
		return RunBackupJob(cfg, db)
	})

	// Inject the SPA frontend into the routing tree
	dist, err := fs.Sub(appassets.FrontendFS, "frontend/dist")
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

	if !opts.noOpen && cfg.App.OpenBrowser {
		go openBrowser(url)
	} else {
		log.Println("⚠️  Automatic browser opening is disabled.")
	}

	// === GRACEFUL SHUTDOWN ENGINE ===
	<-quit
	log.Println("\n🛑 Shutdown: Received termination signal. Initiating graceful wrap-up...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("⚠️  Shutdown: Web server forced to offline: %v\n", err)
	}

	if !isDemoMode && !appShutdownHandledBackup.Load() {
		log.Println("💾 Shutdown: Executing final synchronized safety backup...")
		RunBackupJob(cfg, db)
	}

	log.Println("👋 Shutdown: Systems safely cleared. Server offline. Goodbye!")
	return nil
}
