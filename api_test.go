package main

import (
	"net/http/httptest"
	"testing"
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
