package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// Per-item caps for human-facing text. Draft JSON keeps the response-wide bound:
// truncating JSON would make it invalid and could break serialization on read.
const (
	dsMaxRawBytes  = 8 << 10
	dsMaxNoteBytes = 1 << 10
)

const (
	dsStatusPending  = "pending"
	dsStatusAccepted = "accepted"
	dsStatusRejected = "rejected"
	dsStatusInvalid  = "invalid"
	// dsStatusDetached is never stored. It is what "accepted, but the movement
	// it created is gone" computes to on read, which is why no trigger and no
	// extra column can fall out of sync with it.
	dsStatusDetached = "detached"
)

const (
	dsKindFlow    = "flow"
	dsKindBalance = "balance"
	dsKindRaw     = "raw"
)

type dsInboxRow struct {
	Source     string
	ExternalID string
	Kind       string
	Status     string
	OccurredAt string
	ReceivedAt string
	Raw        string
	Draft      string
	Note       string
}

type dsInboxItem struct {
	ID          int64           `json:"id"`
	Source      string          `json:"source"`
	ExternalID  string          `json:"externalId"`
	Kind        string          `json:"kind"`
	Status      string          `json:"status"`
	Month       string          `json:"month,omitempty"`
	OccurredAt  string          `json:"occurredAt,omitempty"`
	ReceivedAt  string          `json:"receivedAt"`
	Raw         string          `json:"raw,omitempty"`
	Draft       json.RawMessage `json:"draft,omitempty"`
	Note        string          `json:"note,omitempty"`
	FlowEntryID int64           `json:"flowEntryId,omitempty"`
	RunID       int64           `json:"runId,omitempty"`
	Duplicate   bool            `json:"duplicate,omitempty"`
}

// prepareInboxRow turns one plugin item into a row. Nothing the plugin sent is
// trusted: a draft that fails Finn's own validation is stored as invalid with
// the reason attached rather than dropped, so the person can finish it by hand.
func prepareInboxRow(source string, item dsItem, receivedAt string, _ int64) (dsInboxRow, string) {
	externalID := strings.TrimSpace(item.ExternalID)
	if externalID == "" {
		return dsInboxRow{}, "external_id is empty"
	}
	if utf8.RuneCountInString(externalID) > 512 {
		return dsInboxRow{}, "external_id is longer than 512 characters"
	}

	kind := strings.TrimSpace(strings.ToLower(item.Kind))
	switch kind {
	case dsKindFlow, dsKindBalance, dsKindRaw:
	case "":
		return dsInboxRow{}, "kind is empty"
	default:
		return dsInboxRow{}, fmt.Sprintf("unknown kind %q", kind)
	}

	row := dsInboxRow{
		Source:     source,
		ExternalID: externalID,
		Kind:       kind,
		Status:     dsStatusPending,
		ReceivedAt: receivedAt,
		Raw:        truncateText(item.Raw, dsMaxRawBytes),
		Note:       truncateText(item.Note, dsMaxNoteBytes),
	}

	if occurred := strings.TrimSpace(item.OccurredAt); occurred != "" {
		if _, err := time.Parse(time.RFC3339, occurred); err != nil {
			row.Note = joinNotes(row.Note, "occurred_at is not RFC3339 and was dropped")
		} else {
			row.OccurredAt = occurred
		}
	}

	switch kind {
	case dsKindRaw:
		if row.Raw == "" {
			return dsInboxRow{}, "a raw item must carry the original text"
		}
	case dsKindBalance:
		if len(item.Draft) == 0 {
			return dsInboxRow{}, "a balance item must carry a draft"
		}
		// Draft is already bounded by the response-wide stdout limit. Do not
		// truncate JSON text: cutting it in the middle would leave an invalid
		// json.RawMessage that can make the whole Inbox response unencodable.
		row.Draft = string(item.Draft)
	case dsKindFlow:
		if len(item.Draft) == 0 {
			return dsInboxRow{}, "a flow item must carry a draft"
		}
		var draft FlowEntryRequest
		if err := json.Unmarshal(item.Draft, &draft); err != nil {
			row.Status = dsStatusInvalid
			row.Draft = string(item.Draft)
			row.Note = joinNotes(row.Note, "draft is not a movement: "+err.Error())
			return row, ""
		}
		normalized, validationError := normalizeFlowEntryRequest(draft)
		encoded, err := json.Marshal(normalized)
		if err != nil {
			return dsInboxRow{}, "draft could not be stored: " + err.Error()
		}
		row.Draft = string(encoded)
		if validationError != "" {
			row.Status = dsStatusInvalid
			row.Note = joinNotes(row.Note, validationError)
		}
	}
	return row, ""
}

func truncateText(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit] + "…"
}

func joinNotes(existing, addition string) string {
	switch {
	case existing == "":
		return addition
	case addition == "":
		return existing
	default:
		return existing + "; " + addition
	}
}

// --- reading -------------------------------------------------------------

type dsInboxFilter struct {
	Status string
	Source string
	Limit  int
}

// inbox reads the queue. `detached` is computed here through a LEFT JOIN rather
// than stored: the movement can disappear through DELETE /flows/:id or through
// the cleanup inside PUT /flows/months/:month, and a value derived on read
// covers both without either handler knowing about the Inbox.
func (service *dsService) inbox(filter dsInboxFilter) ([]dsInboxItem, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 2000 {
		limit = 500
	}

	conditions := []string{}
	arguments := []any{}
	detached := "(i.status = 'accepted' AND i.flow_entry_id IS NOT NULL AND f.id IS NULL)"

	switch strings.TrimSpace(strings.ToLower(filter.Status)) {
	case "":
		conditions = append(conditions, "NOT "+detached)
	case "all":
	case dsStatusDetached:
		conditions = append(conditions, detached)
	case dsStatusAccepted:
		conditions = append(conditions, "i.status = 'accepted'", "NOT "+detached)
	case dsStatusPending, dsStatusRejected, dsStatusInvalid:
		conditions = append(conditions, "i.status = ?")
		arguments = append(arguments, strings.ToLower(filter.Status))
	default:
		return nil, fmt.Errorf("unknown status filter %q", filter.Status)
	}

	if source := strings.TrimSpace(filter.Source); source != "" {
		conditions = append(conditions, "i.source = ?")
		arguments = append(arguments, source)
	}

	query := `
		SELECT i.id, i.source, i.external_id, i.kind, i.status, i.occurred_at, i.received_at, i.raw, i.draft, i.note,
		       COALESCE(i.flow_entry_id, 0), COALESCE(i.run_id, 0), ` + detached + `
		FROM ds_inbox i
		LEFT JOIN flow_entries f ON f.id = i.flow_entry_id`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY i.occurred_at DESC, i.id DESC LIMIT ?"
	arguments = append(arguments, limit)

	rows, err := service.db.Query(query, arguments...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]dsInboxItem, 0, 64)
	for rows.Next() {
		var item dsInboxItem
		var draft string
		var isDetached bool
		if err := rows.Scan(&item.ID, &item.Source, &item.ExternalID, &item.Kind, &item.Status, &item.OccurredAt,
			&item.ReceivedAt, &item.Raw, &draft, &item.Note, &item.FlowEntryID, &item.RunID, &isDetached); err != nil {
			return nil, err
		}
		if isDetached {
			item.Status = dsStatusDetached
		}
		if draft != "" {
			item.Draft = json.RawMessage(draft)
		}
		item.Month = inboxItemMonth(draft, item.OccurredAt)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := service.markDuplicates(items); err != nil {
		return nil, err
	}
	return items, nil
}

func inboxItemMonth(draft, occurredAt string) string {
	if draft != "" {
		var parsed struct {
			Month string `json:"month"`
		}
		if err := json.Unmarshal([]byte(draft), &parsed); err == nil && flowMonthPattern.MatchString(parsed.Month) {
			return parsed.Month
		}
	}
	if len(occurredAt) >= 7 && flowMonthPattern.MatchString(occurredAt[:7]) {
		return occurredAt[:7]
	}
	return ""
}

// markDuplicates flags proposals that already exist as movements, using the same
// key CSV import compares on, so a duplicate looks the same wherever it appears.
func (service *dsService) markDuplicates(items []dsInboxItem) error {
	pending := false
	for _, item := range items {
		if item.Status == dsStatusPending && len(item.Draft) > 0 {
			pending = true
			break
		}
	}
	if !pending {
		return nil
	}

	existingKeys, err := service.existingFlowKeys(service.db)
	if err != nil {
		return err
	}
	for index := range items {
		item := &items[index]
		if item.Status != dsStatusPending || len(item.Draft) == 0 {
			continue
		}
		var draft FlowEntryRequest
		if err := json.Unmarshal(item.Draft, &draft); err != nil {
			continue
		}
		normalized, validationError := normalizeFlowEntryRequest(draft)
		if validationError != "" {
			continue
		}
		if _, exists := existingKeys[flowEntryKey(normalized)]; exists {
			item.Duplicate = true
		}
	}
	return nil
}

type dsQueryer interface {
	Query(query string, arguments ...any) (*sql.Rows, error)
}

func (service *dsService) existingFlowKeys(queryer dsQueryer) (map[string]struct{}, error) {
	rows, err := queryer.Query(`
		SELECT month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount
		FROM flow_entries
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := make(map[string]struct{})
	for rows.Next() {
		var entry FlowEntryRequest
		if err := rows.Scan(&entry.Month, &entry.EntryType, &entry.Direction, &entry.Counterparty, &entry.Account, &entry.Tag,
			&entry.Currency, &entry.Amount, &entry.TaxRate, &entry.Category, &entry.Comment,
			&entry.ToAccount, &entry.ToTag, &entry.ToCurrency, &entry.ToAmount); err != nil {
			return nil, err
		}
		keys[flowEntryKey(entry)] = struct{}{}
	}
	return keys, rows.Err()
}

// --- editing -------------------------------------------------------------

var errInboxItemNotEditable = errors.New("only pending, invalid and raw items can be edited")

// updateDraft saves what the person corrected and recomputes validity. A raw
// item that gains a valid movement becomes a flow proposal: that is exactly what
// filling in the editor means.
func (service *dsService) updateDraft(id int64, request FlowEntryRequest) (dsInboxItem, error) {
	var kind, status string
	err := service.db.QueryRow("SELECT kind, status FROM ds_inbox WHERE id = ?", id).Scan(&kind, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return dsInboxItem{}, sql.ErrNoRows
	}
	if err != nil {
		return dsInboxItem{}, err
	}
	if kind == dsKindBalance {
		return dsInboxItem{}, errors.New("balance items are read-only in this version")
	}
	if status != dsStatusPending && status != dsStatusInvalid {
		return dsInboxItem{}, errInboxItemNotEditable
	}

	normalized, validationError := normalizeFlowEntryRequest(request)
	encoded, err := json.Marshal(normalized)
	if err != nil {
		return dsInboxItem{}, err
	}

	newStatus := dsStatusPending
	note := ""
	if validationError != "" {
		newStatus = dsStatusInvalid
		note = validationError
	}
	if _, err := service.db.Exec(
		"UPDATE ds_inbox SET kind = ?, draft = ?, status = ?, note = ? WHERE id = ?",
		dsKindFlow, string(encoded), newStatus, note, id,
	); err != nil {
		return dsInboxItem{}, err
	}
	return service.inboxItem(id)
}

func (service *dsService) inboxItem(id int64) (dsInboxItem, error) {
	items, err := service.inbox(dsInboxFilter{Status: "all", Limit: 2000})
	if err != nil {
		return dsInboxItem{}, err
	}
	for _, item := range items {
		if item.ID == id {
			return item, nil
		}
	}
	return dsInboxItem{}, sql.ErrNoRows
}

// --- accept, reject, reopen, clear ---------------------------------------

type dsAcceptOutcome struct {
	ID          int64  `json:"id"`
	Status      string `json:"status"`
	FlowEntryID int64  `json:"flowEntryId,omitempty"`
	Error       string `json:"error,omitempty"`
}

type dsAcceptResult struct {
	Accepted int               `json:"accepted"`
	Skipped  int               `json:"skipped"`
	Failed   int               `json:"failed"`
	Results  []dsAcceptOutcome `json:"results"`
}

// accept moves proposals into flow_entries. The batch runs in one transaction,
// but an item that fails validation only takes itself out: the rest still land,
// and the failure comes back per id.
func (service *dsService) accept(ids []int64, allowDuplicates bool) (dsAcceptResult, error) {
	result := dsAcceptResult{Results: []dsAcceptOutcome{}}
	if len(ids) == 0 {
		return result, errors.New("ids are required")
	}
	seenIDs := make(map[int64]struct{}, len(ids))
	for _, id := range ids {
		if id <= 0 {
			return result, errors.New("ids must be positive")
		}
		if _, duplicate := seenIDs[id]; duplicate {
			return result, errors.New("ids must be unique")
		}
		seenIDs[id] = struct{}{}
	}

	transaction, err := service.db.Begin()
	if err != nil {
		return result, err
	}
	defer transaction.Rollback()

	existingKeys, err := service.existingFlowKeys(transaction)
	if err != nil {
		return result, err
	}

	type candidate struct {
		kind   string
		status string
		draft  string
	}
	candidates := make(map[int64]candidate, len(ids))
	placeholders, arguments := sqlIDList(ids)
	rows, err := transaction.Query("SELECT id, kind, status, draft FROM ds_inbox WHERE id IN ("+placeholders+")", arguments...)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var id int64
		var found candidate
		if err := rows.Scan(&id, &found.kind, &found.status, &found.draft); err != nil {
			rows.Close()
			return result, err
		}
		candidates[id] = found
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return result, err
	}

	for _, id := range ids {
		found, exists := candidates[id]
		switch {
		case !exists:
			result.Failed++
			result.Results = append(result.Results, dsAcceptOutcome{ID: id, Status: "missing", Error: "no such Inbox item"})
			continue
		case found.status != dsStatusPending && found.status != dsStatusInvalid:
			result.Skipped++
			result.Results = append(result.Results, dsAcceptOutcome{ID: id, Status: "skipped", Error: "item is already " + found.status})
			continue
		case found.kind == dsKindBalance:
			result.Skipped++
			result.Results = append(result.Results, dsAcceptOutcome{ID: id, Status: "skipped", Error: "applying balance items is not available yet"})
			continue
		case found.draft == "":
			result.Failed++
			result.Results = append(result.Results, dsAcceptOutcome{ID: id, Status: "invalid", Error: "fill in the movement before accepting it"})
			continue
		}

		var draft FlowEntryRequest
		if err := json.Unmarshal([]byte(found.draft), &draft); err != nil {
			result.Failed++
			result.Results = append(result.Results, dsAcceptOutcome{ID: id, Status: "invalid", Error: "draft is not a movement"})
			continue
		}
		normalized, validationError := normalizeFlowEntryRequest(draft)
		if validationError != "" {
			result.Failed++
			result.Results = append(result.Results, dsAcceptOutcome{ID: id, Status: "invalid", Error: validationError})
			if _, err := transaction.Exec("UPDATE ds_inbox SET status = ?, note = ? WHERE id = ?", dsStatusInvalid, validationError, id); err != nil {
				return result, err
			}
			continue
		}

		key := flowEntryKey(normalized)
		if _, duplicate := existingKeys[key]; duplicate && !allowDuplicates {
			result.Skipped++
			result.Results = append(result.Results, dsAcceptOutcome{ID: id, Status: "duplicate", Error: "an identical movement already exists this month"})
			continue
		}

		insert, err := transaction.Exec(`
			INSERT INTO flow_entries (month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, normalized.Month, normalized.EntryType, normalized.Direction, normalized.Counterparty, normalized.Account, normalized.Tag,
			normalized.Currency, normalized.Amount, normalized.TaxRate, normalized.Category, normalized.Comment,
			normalized.ToAccount, normalized.ToTag, normalized.ToCurrency, normalized.ToAmount)
		if err != nil {
			return result, err
		}
		flowEntryID, err := insert.LastInsertId()
		if err != nil {
			return result, err
		}

		// The draft is deliberately left as it arrived. It is a snapshot of what
		// the source proposed, not a mirror of the movement: editing the amount
		// in Cash Flow later must not rewrite what the plugin actually sent.
		if _, err := transaction.Exec(
			"UPDATE ds_inbox SET status = ?, flow_entry_id = ?, note = '' WHERE id = ?",
			dsStatusAccepted, flowEntryID, id,
		); err != nil {
			return result, err
		}
		existingKeys[key] = struct{}{}
		result.Accepted++
		result.Results = append(result.Results, dsAcceptOutcome{ID: id, Status: dsStatusAccepted, FlowEntryID: flowEntryID})
	}

	if err := transaction.Commit(); err != nil {
		return result, err
	}
	return result, nil
}

// reject marks proposals as unwanted without deleting them: the unique index is
// what stops the next fetch from bringing them back, so the row has to stay.
func (service *dsService) reject(ids []int64) (int64, error) {
	if len(ids) == 0 {
		return 0, errors.New("ids are required")
	}
	placeholders, arguments := sqlIDList(ids)
	result, err := service.db.Exec(
		"UPDATE ds_inbox SET status = ? WHERE id IN ("+placeholders+") AND status IN ('pending', 'invalid')",
		append([]any{dsStatusRejected}, arguments...)...,
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// reopen puts a detached item back in the queue. Nothing else can be reopened:
// a detached item is the only one whose "accepted" no longer describes reality.
func (service *dsService) reopen(ids []int64) (int64, error) {
	if len(ids) == 0 {
		return 0, errors.New("ids are required")
	}
	placeholders, arguments := sqlIDList(ids)
	result, err := service.db.Exec(`
		UPDATE ds_inbox SET status = ?, flow_entry_id = NULL, note = ''
		WHERE id IN (`+placeholders+`)
		  AND status = 'accepted'
		  AND flow_entry_id IS NOT NULL
		  AND flow_entry_id NOT IN (SELECT id FROM flow_entries)
	`, append([]any{dsStatusPending}, arguments...)...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

// clear deletes rows for good. Deleting a rejected item means the next fetch can
// propose it again, which is why this is a separate deliberate action rather
// than what reject does.
func (service *dsService) clear(filter dsInboxFilter) (int64, error) {
	conditions := []string{}
	arguments := []any{}

	switch status := strings.TrimSpace(strings.ToLower(filter.Status)); status {
	case "", "all":
	case dsStatusPending, dsStatusAccepted, dsStatusRejected, dsStatusInvalid:
		conditions = append(conditions, "status = ?")
		arguments = append(arguments, status)
	case dsStatusDetached:
		conditions = append(conditions, "status = 'accepted'", "flow_entry_id IS NOT NULL", "flow_entry_id NOT IN (SELECT id FROM flow_entries)")
	default:
		return 0, fmt.Errorf("unknown status filter %q", filter.Status)
	}
	if source := strings.TrimSpace(filter.Source); source != "" {
		conditions = append(conditions, "source = ?")
		arguments = append(arguments, source)
	}

	query := "DELETE FROM ds_inbox"
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	result, err := service.db.Exec(query, arguments...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func sqlIDList(ids []int64) (string, []any) {
	placeholders := make([]string, len(ids))
	arguments := make([]any, len(ids))
	for index, id := range ids {
		placeholders[index] = "?"
		arguments[index] = id
	}
	return strings.Join(placeholders, ", "), arguments
}
