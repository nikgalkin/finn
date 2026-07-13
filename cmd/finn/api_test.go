package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestIsLocalShutdownRequest(t *testing.T) {
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

			if got := isLocalShutdownRequest(request); got != tt.want {
				t.Fatalf("isLocalShutdownRequest() = %v, want %v", got, tt.want)
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
