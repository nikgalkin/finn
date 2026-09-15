package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"

	"github.com/gin-gonic/gin"
)

type snapshotCommentRequest struct {
	SnapshotID      int            `json:"snapshotID" binding:"required"`
	Type            string         `json:"type" binding:"required,oneof=snapshot org balance"`
	OrgID           string         `json:"orgId"`
	BalanceIndex    *int           `json:"balanceIndex"`
	ExpectedBalance map[string]any `json:"expectedBalance"`
	OriginalText    *string        `json:"originalText" binding:"required"`
	Text            *string        `json:"text" binding:"required"`
}

func setupSnapshotCommentAPI(api *gin.RouterGroup, db *sql.DB) {
	api.PATCH("/snapshots/:month/comment", func(c *gin.Context) {
		var req snapshotCommentRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if (req.Type != "snapshot" && req.OrgID == "") ||
			(req.Type == "balance" && (req.BalanceIndex == nil || *req.BalanceIndex < 0 || req.ExpectedBalance == nil)) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "A comment target is required."})
			return
		}

		month := c.Param("month")
		var data string
		err := db.QueryRow("SELECT data FROM snapshots WHERE id = ? AND month = ?", req.SnapshotID, month).Scan(&data)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Snapshot no longer exists. Reload the feed."})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		var root map[string]any
		if err := json.Unmarshal([]byte(data), &root); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not read the snapshot."})
			return
		}

		conflict := func() {
			c.JSON(http.StatusConflict, gin.H{"error": "The comment or its balance changed. Your text has not been saved. Reload the feed before editing again."})
		}
		target := root
		path := "$"
		if req.Type != "snapshot" {
			target = nil
			organizations, _ := root["organizations"].([]any)
			for index, value := range organizations {
				org, ok := value.(map[string]any)
				if !ok || org["id"] != req.OrgID {
					continue
				}
				// Ambiguous IDs cannot safely identify a comment.
				if target != nil {
					conflict()
					return
				}
				target = org
				path = fmt.Sprintf("$.organizations[%d]", index)
			}
			if target == nil {
				conflict()
				return
			}
			if req.Type == "balance" {
				balances, _ := target["balances"].([]any)
				if *req.BalanceIndex >= len(balances) {
					conflict()
					return
				}
				target, _ = balances[*req.BalanceIndex].(map[string]any)
				if target == nil || !reflect.DeepEqual(target, req.ExpectedBalance) {
					conflict()
					return
				}
				path += fmt.Sprintf(".balances[%d]", *req.BalanceIndex)
			}
		}
		if target == nil || target["comment"] != *req.OriginalText {
			conflict()
			return
		}

		// Patch only the comment; reject a concurrent write between read and update.
		var saved string
		var durationSeconds int
		err = db.QueryRow(`UPDATE snapshots SET data = json_set(data, ?, ?)
			WHERE id = ? AND month = ? AND data = ? RETURNING data, duration_seconds`,
			path+".comment", *req.Text, req.SnapshotID, month, data).Scan(&saved, &durationSeconds)
		if err == sql.ErrNoRows {
			conflict()
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": req.SnapshotID, "month": month, "data": saved, "duration_seconds": durationSeconds})
	})
}
