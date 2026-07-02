package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

//go:embed frontend/dist
var frontendFS embed.FS

func main() {
	db := initDB()
	defer db.Close()

	r := gin.Default()

	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	r.Use(cors.New(config))

	setupAPI(r, db)

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

	log.Println("Server starting on http://localhost:8080")
	r.Run("127.0.0.1:8080")
	// r.Run(":8080")
}
