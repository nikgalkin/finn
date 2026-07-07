package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

//go:embed frontend/dist
var frontendFS embed.FS

var version = "dev"

// openBrowser opens the specified URL in the default browser based on the OS
func openBrowser(url string) {
	// Give the server a tiny fraction of a second to spin up the port
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
	flag.Parse()

	db := initDB()
	defer db.Close()

	// Set Gin to release mode if not running in dev to clean up logs
	if version != "dev" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	r.Use(cors.New(config))

	setupAPI(r, db)

	// Endpoint for frontend to check the current version
	r.GET("/api/version", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"version": version})
	})

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
		log.Println("Frontend not built. Run 'npm run build' in 'frontend' directory.")
	}

	url := "http://localhost:8080"
	log.Printf("Server starting on %s (Version: %s)\n", url, version)

	// Open browser only if --no-open flag is not provided
	if !*noOpen {
		go openBrowser(url)
	} else {
		log.Println("Automatic browser opening is disabled by flag.")
	}

	r.Run("127.0.0.1:8080")
}
