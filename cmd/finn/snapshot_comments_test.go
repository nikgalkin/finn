package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

const commentSnapshotData = `{"comment":"Month note","rates":{"USD":90},"custom":{"keep":true},"organizations":[{"id":"bank","name":"Bank","comment":"Bank note","balances":[{"currency":"USD","amount":100,"tags":["cash"],"comment":"First note"},{"currency":"USD","amount":200,"tags":["stocks"],"comment":"Second note"}]}]}`

func newSnapshotCommentTestRouter(t *testing.T) (*gin.Engine, *sql.DB) {
	t.Helper()
	router, db := newFlowAPITestRouter(t)
	if _, err := db.Exec(`CREATE TABLE snapshots (id INTEGER PRIMARY KEY, month TEXT UNIQUE, data TEXT, duration_seconds INTEGER)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO snapshots VALUES (1, '2026-08', ?, 123)`, commentSnapshotData); err != nil {
		t.Fatal(err)
	}
	setupSnapshotCommentAPI(router.Group("/api"), db)
	return router, db
}

func commentRequest(kind string) map[string]any {
	req := map[string]any{"snapshotID": 1, "type": kind, "originalText": "Month note", "text": "Updated note"}
	if kind != "snapshot" {
		req["orgId"] = "bank"
		req["originalText"] = "Bank note"
	}
	if kind == "balance" {
		req["balanceIndex"] = 1
		req["originalText"] = "Second note"
		req["expectedBalance"] = map[string]any{"currency": "USD", "amount": 200, "tags": []string{"stocks"}, "comment": "Second note"}
	}
	return req
}

func TestSnapshotCommentEditsOnlySelectedNote(t *testing.T) {
	for _, kind := range []string{"snapshot", "org", "balance"} {
		for _, text := range []string{"Updated\n\"note\" 'quoted' {\"key\":true}", ""} {
			t.Run(kind+"/"+text, func(t *testing.T) {
				router, db := newSnapshotCommentTestRouter(t)
				req := commentRequest(kind)
				req["text"] = text
				body, _ := json.Marshal(req)
				response := performFlowRequest(router, http.MethodPatch, "/api/snapshots/2026-08/comment", string(body))
				if response.Code != http.StatusOK {
					t.Fatalf("status = %d: %s", response.Code, response.Body.String())
				}
				var saved struct {
					ID       int    `json:"id"`
					Month    string `json:"month"`
					Data     string `json:"data"`
					Duration int    `json:"duration_seconds"`
				}
				if err := json.Unmarshal(response.Body.Bytes(), &saved); err != nil {
					t.Fatal(err)
				}
				if saved.ID != 1 || saved.Month != "2026-08" || saved.Duration != 123 {
					t.Fatalf("snapshot metadata changed: %+v", saved)
				}
				var expected, actual map[string]any
				json.Unmarshal([]byte(commentSnapshotData), &expected)
				json.Unmarshal([]byte(saved.Data), &actual)
				target := expected
				if kind != "snapshot" {
					target = expected["organizations"].([]any)[0].(map[string]any)
				}
				if kind == "balance" {
					target = target["balances"].([]any)[1].(map[string]any)
				}
				target["comment"] = text
				if !reflect.DeepEqual(actual, expected) {
					t.Fatalf("unexpected snapshot data: %s", saved.Data)
				}
				var stored string
				if err := db.QueryRow("SELECT data FROM snapshots WHERE id = 1").Scan(&stored); err != nil || stored != saved.Data {
					t.Fatalf("response does not match stored data: %v", err)
				}
			})
		}
	}
}

func TestSnapshotCommentRejectsStaleOrInvalidTargets(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(map[string]any)
		status int
	}{
		{"changed comment", func(r map[string]any) { r["originalText"] = "Old note" }, 409},
		{"wrong organization", func(r map[string]any) { r["orgId"] = "missing" }, 409},
		{"reordered balance", func(r map[string]any) { r["balanceIndex"] = 0 }, 409},
		{"removed balance", func(r map[string]any) { r["balanceIndex"] = 2 }, 409},
		{"changed balance", func(r map[string]any) { r["expectedBalance"].(map[string]any)["amount"] = 199 }, 409},
		{"replaced snapshot", func(r map[string]any) { r["snapshotID"] = 2 }, 404},
		{"missing target", func(r map[string]any) { delete(r, "orgId") }, 400},
		{"missing index", func(r map[string]any) { delete(r, "balanceIndex") }, 400},
		{"negative index", func(r map[string]any) { r["balanceIndex"] = -1 }, 400},
		{"missing original", func(r map[string]any) { delete(r, "originalText") }, 400},
		{"missing text", func(r map[string]any) { delete(r, "text") }, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			router, db := newSnapshotCommentTestRouter(t)
			req := commentRequest("balance")
			tc.change(req)
			body, _ := json.Marshal(req)
			response := performFlowRequest(router, http.MethodPatch, "/api/snapshots/2026-08/comment", string(body))
			if response.Code != tc.status {
				t.Fatalf("status = %d, want %d: %s", response.Code, tc.status, response.Body.String())
			}
			var stored string
			if err := db.QueryRow("SELECT data FROM snapshots WHERE id = 1").Scan(&stored); err != nil || stored != commentSnapshotData {
				t.Fatalf("rejected edit changed stored data: %v", err)
			}
		})
	}
}

func TestSnapshotCommentKeepsLatestUnrelatedChangesAndNumberPrecision(t *testing.T) {
	router, db := newSnapshotCommentTestRouter(t)
	latest := strings.Replace(commentSnapshotData, `"USD":90`, `"USD":95,"precise":9007199254740993`, 1)
	if _, err := db.Exec("UPDATE snapshots SET data = ?, duration_seconds = 456 WHERE id = 1", latest); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(commentRequest("balance"))
	response := performFlowRequest(router, http.MethodPatch, "/api/snapshots/2026-08/comment", string(body))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", response.Code, response.Body.String())
	}
	var stored string
	var duration int
	if err := db.QueryRow("SELECT data, duration_seconds FROM snapshots WHERE id = 1").Scan(&stored, &duration); err != nil {
		t.Fatal(err)
	}
	if duration != 456 || !strings.Contains(stored, `"USD":95,"precise":9007199254740993`) {
		t.Fatalf("unrelated changes lost: %d %s", duration, stored)
	}
}
