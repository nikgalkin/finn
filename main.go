package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// 1. Embedded assets definition (must be right above the FS variable, without initializers)
//
//go:embed frontend/dist
var frontendFS embed.FS

// 2. Global application version injection point
var version = "dev"

// openBrowser opens the specified URL in the default system browser based on the OS
func openBrowser(url string) {
	// Give the server a tiny fraction of a second to spin up the network port safely
	time.Sleep(200 * time.Millisecond)

	var err error
	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	case "windows":
		// In Windows, 'start' is a cmd builtin, so we execute it via cmd.exe
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

	// Bind shorthand -v to the exact same version boolean pointer
	flag.BoolVar(showVersion, "v", false, "Print the application version and exit (shorthand)")

	flag.Parse()

	// If the user requested the version, output it immediately and terminate the lifecycle
	if *showVersion {
		fmt.Printf("%s version %s (%s/%s)\n", "finn", version, runtime.GOOS, runtime.GOARCH)
		os.Exit(0)
	}

	// Initialize the database
	db := initDB()
	defer db.Close()

	// Mute heavy Gin debug logs in production releases
	if version != "dev" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// CORS configuration
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	r.Use(cors.New(config))

	// Register API endpoints from api.go
	setupAPI(r, db)

	// Inject the SPA frontend into the routing tree
	dist, err := fs.Sub(frontendFS, "frontend/dist")
	if err == nil {
		fileServer := http.FileServer(http.FS(dist))
		r.NoRoute(func(c *gin.Context) {
			// Skip single-page routing fallback for explicit API routes
			if strings.HasPrefix(c.Request.URL.Path, "/api") {
				c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
				return
			}

			path := strings.TrimPrefix(c.Request.URL.Path, "/")
			f, err := dist.Open(path)
			if err != nil {
				// Fallback to index.html for React Router / client-side paths
				c.Request.URL.Path = "/"
			} else {
				f.Close()
			}
			fileServer.ServeHTTP(c.Writer, c.Request)
		})
	} else {
		log.Println("⚠️  Frontend assets not detected. Run 'npm run build' inside 'frontend/' folder.")
	}

	url := "http://localhost:8080"
	log.Printf("Server starting on %s (Version: %s)\n", url, version)

	// Spin up browser unless explicitly disabled by user flags
	if !*noOpen {
		go openBrowser(url)
	} else {
		log.Println("⚠️  Automatic browser opening is disabled by CLI flag.")
	}

	// Start the blocking Gin engine listener
	r.Run("127.0.0.1:8080")
}
