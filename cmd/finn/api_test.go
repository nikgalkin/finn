package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestIsLocalRequest(t *testing.T) {
	tests := []struct {
		name       string
		remoteAddr string
		origin     string
		want       bool
	}{
		{name: "local request without origin", remoteAddr: "127.0.0.1:41000", want: true},
		{name: "localhost origin", remoteAddr: "127.0.0.1:41000", origin: "http://localhost:8080", want: true},
		{name: "loopback origin", remoteAddr: "127.0.0.1:41000", origin: "http://127.0.0.1:5173", want: true},
		{name: "external origin", remoteAddr: "127.0.0.1:41000", origin: "https://example.com", want: false},
		{name: "external client", remoteAddr: "192.0.2.10:41000", origin: "http://localhost:8080", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest("POST", "http://localhost/api/shutdown", nil)
			request.RemoteAddr = tt.remoteAddr
			if tt.origin != "" {
				request.Header.Set("Origin", tt.origin)
			}

			if got := isLocalRequest(request); got != tt.want {
				t.Fatalf("isLocalRequest() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsLoopbackOrigin(t *testing.T) {
	tests := []struct {
		origin string
		want   bool
	}{
		{origin: "http://localhost:8080", want: true},
		{origin: "http://127.0.0.1:5173", want: true},
		{origin: "http://[::1]:8080", want: true},
		{origin: "https://example.com", want: false},
		{origin: "http://localhost.evil.com", want: false},
		{origin: "null", want: false},
		{origin: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.origin, func(t *testing.T) {
			if got := isLoopbackOrigin(tt.origin); got != tt.want {
				t.Fatalf("isLoopbackOrigin(%q) = %v, want %v", tt.origin, got, tt.want)
			}
		})
	}
}

func TestCORSOnlyAnswersLoopbackOrigins(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(newCORSMiddleware())
	router.GET("/api/version", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"version": "test"}) })

	local := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	local.RemoteAddr = "127.0.0.1:41000"
	local.Header.Set("Origin", "http://localhost:5173")
	localResponse := httptest.NewRecorder()
	router.ServeHTTP(localResponse, local)

	if allowed := localResponse.Header().Get("Access-Control-Allow-Origin"); allowed != "http://localhost:5173" {
		t.Fatalf("loopback origin was not allowed: %q", allowed)
	}

	foreign := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	foreign.RemoteAddr = "127.0.0.1:41000"
	foreign.Header.Set("Origin", "https://example.com")
	foreignResponse := httptest.NewRecorder()
	router.ServeHTTP(foreignResponse, foreign)

	if allowed := foreignResponse.Header().Get("Access-Control-Allow-Origin"); allowed != "" {
		t.Fatalf("foreign origin received CORS approval: %q", allowed)
	}
}

func TestAPIRejectsForeignOrigins(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	setupAPI(router, nil, func() {}, func() BackupReport {
		return BackupReport{Status: backupStatusSkipped}
	})

	paths := []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/api/snapshots"},
		{method: http.MethodGet, path: "/api/snapshots/2026-07"},
		{method: http.MethodDelete, path: "/api/snapshots/2026-07"},
		{method: http.MethodGet, path: "/api/settings"},
		{method: http.MethodGet, path: "/api/rates"},
		{method: http.MethodGet, path: "/api/flows"},
		{method: http.MethodGet, path: "/api/ai/status"},
		{method: http.MethodGet, path: "/api/version"},
	}

	for _, endpoint := range paths {
		t.Run(endpoint.method+" "+endpoint.path, func(t *testing.T) {
			request := httptest.NewRequest(endpoint.method, endpoint.path, nil)
			request.RemoteAddr = "127.0.0.1:41000"
			request.Header.Set("Origin", "https://example.com")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("%s %s status = %d, want %d; body: %s", endpoint.method, endpoint.path, response.Code, http.StatusForbidden, response.Body.String())
			}
		})
	}
}

func TestShutdownWaitsForSuccessfulBackup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	shutdownRequested := make(chan struct{}, 1)
	setupAPI(router, nil, func() {
		shutdownRequested <- struct{}{}
	}, func() BackupReport {
		return BackupReport{Status: backupStatusSkipped}
	})

	request := httptest.NewRequest(http.MethodPost, "/api/shutdown", nil)
	request.RemoteAddr = "127.0.0.1:41000"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("shutdown response status = %d, want %d; body: %s", response.Code, http.StatusAccepted, response.Body.String())
	}
	select {
	case <-shutdownRequested:
	case <-time.After(time.Second):
		t.Fatal("shutdown was not requested after successful backup")
	}
}

func TestShutdownIsAbortedWhenBackupFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	shutdownRequested := make(chan struct{}, 1)
	setupAPI(router, nil, func() {
		shutdownRequested <- struct{}{}
	}, func() BackupReport {
		return BackupReport{Status: backupStatusFailed, Error: "disk unavailable"}
	})

	request := httptest.NewRequest(http.MethodPost, "/api/shutdown", nil)
	request.RemoteAddr = "127.0.0.1:41000"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("shutdown response status = %d, want %d; body: %s", response.Code, http.StatusServiceUnavailable, response.Body.String())
	}
	select {
	case <-shutdownRequested:
		t.Fatal("shutdown was requested despite backup failure")
	case <-time.After(300 * time.Millisecond):
	}
}

func TestShutdownProceedsWhenBackupIsPartial(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	shutdownRequested := make(chan struct{}, 1)
	setupAPI(router, nil, func() {
		shutdownRequested <- struct{}{}
	}, func() BackupReport {
		return BackupReport{
			Status: backupStatusPartial,
			Targets: []BackupTargetResult{
				{Name: "local", Status: "created"},
				{Name: "cloud", Status: "created_with_warning", Error: "rotation failed"},
			},
		}
	})

	request := httptest.NewRequest(http.MethodPost, "/api/shutdown", nil)
	request.RemoteAddr = "127.0.0.1:41000"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("shutdown response status = %d, want %d; body: %s", response.Code, http.StatusAccepted, response.Body.String())
	}
	select {
	case <-shutdownRequested:
	case <-time.After(time.Second):
		t.Fatal("shutdown was not requested after a partial backup")
	}
}
