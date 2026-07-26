package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

type dataHealthIssue struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Category    string   `json:"category"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Count       int      `json:"count"`
	Examples    []string `json:"examples,omitempty"`
}

type dataHealthSummary struct {
	Snapshots   int `json:"snapshots"`
	FlowEntries int `json:"flowEntries"`
	Critical    int `json:"critical"`
	Warnings    int `json:"warnings"`
}

type dataHealthReport struct {
	Status    string            `json:"status"`
	CheckedAt time.Time         `json:"checkedAt"`
	Summary   dataHealthSummary `json:"summary"`
	Issues    []dataHealthIssue `json:"issues"`
}

type dataHealthCollector struct {
	byCode map[string]*dataHealthIssue
	order  []string
}

func newDataHealthCollector() *dataHealthCollector {
	return &dataHealthCollector{byCode: make(map[string]*dataHealthIssue)}
}

func (collector *dataHealthCollector) add(
	code, severity, category, title, description, example string,
) {
	issue, exists := collector.byCode[code]
	if !exists {
		issue = &dataHealthIssue{
			Code:        code,
			Severity:    severity,
			Category:    category,
			Title:       title,
			Description: description,
		}
		collector.byCode[code] = issue
		collector.order = append(collector.order, code)
	}
	issue.Count++
	if example != "" && len(issue.Examples) < 5 {
		for _, existing := range issue.Examples {
			if existing == example {
				return
			}
		}
		issue.Examples = append(issue.Examples, example)
	}
}

func (collector *dataHealthCollector) issues() []dataHealthIssue {
	issues := make([]dataHealthIssue, 0, len(collector.order))
	for _, code := range collector.order {
		issues = append(issues, *collector.byCode[code])
	}
	sort.SliceStable(issues, func(i, j int) bool {
		if issues[i].Severity != issues[j].Severity {
			return issues[i].Severity == "critical"
		}
		if issues[i].Category != issues[j].Category {
			return issues[i].Category < issues[j].Category
		}
		return issues[i].Title < issues[j].Title
	})
	return issues
}

type healthSettings struct {
	currencies map[string]bool
	tags       map[string]bool
}

func decodeJSONObject(raw string) (map[string]any, error) {
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, fmt.Errorf("multiple JSON values")
		}
		return nil, err
	}
	if value == nil {
		return nil, fmt.Errorf("expected an object")
	}
	return value, nil
}

func healthStringSet(value any) (map[string]bool, bool) {
	items, ok := value.([]any)
	if !ok {
		return nil, false
	}
	result := make(map[string]bool, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if !ok {
			return nil, false
		}
		text = strings.TrimSpace(text)
		if text != "" {
			result[text] = true
		}
	}
	return result, true
}

func healthString(value any) (string, bool) {
	text, ok := value.(string)
	return strings.TrimSpace(text), ok
}

func healthNumber(value any) (float64, bool) {
	var number float64
	var err error
	switch typed := value.(type) {
	case json.Number:
		number, err = typed.Float64()
	case float64:
		number = typed
	case string:
		number, err = strconv.ParseFloat(strings.TrimSpace(typed), 64)
	default:
		return 0, false
	}
	return number, err == nil && !math.IsNaN(number) && !math.IsInf(number, 0)
}

func validHealthMonth(month string) bool {
	return flowMonthPattern.MatchString(month)
}

func loadHealthSettings(db *sql.DB, collector *dataHealthCollector) healthSettings {
	settings := healthSettings{
		currencies: make(map[string]bool),
		tags:       make(map[string]bool),
	}

	var raw string
	err := db.QueryRow("SELECT value FROM settings WHERE key = 'master_data'").Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		collector.add(
			"settings_missing", "warning", "Settings", "Master settings are missing",
			"Finn can use defaults, but configured currencies and tags cannot be checked.", "",
		)
		return settings
	}
	if err != nil {
		collector.add(
			"settings_unreadable", "critical", "Settings", "Master settings could not be read",
			"The settings row could not be inspected.", err.Error(),
		)
		return settings
	}

	value, err := decodeJSONObject(raw)
	if err != nil {
		collector.add(
			"settings_invalid_json", "critical", "Settings", "Master settings contain invalid JSON",
			"Settings cannot be parsed and parts of the application may fail to load.", err.Error(),
		)
		return settings
	}

	if currencies, ok := healthStringSet(value["currencies"]); ok {
		settings.currencies = currencies
	} else {
		collector.add(
			"settings_currencies_invalid", "warning", "Settings", "Configured currencies are malformed",
			"The currencies setting should be an array of currency codes.", "",
		)
	}
	if tags, ok := healthStringSet(value["tags"]); ok {
		settings.tags = tags
	} else if value["tags"] != nil {
		collector.add(
			"settings_tags_invalid", "warning", "Settings", "Configured tags are malformed",
			"The tags setting should be an array of names.", "",
		)
	}
	return settings
}

func scanSnapshotHealth(
	db *sql.DB,
	settings healthSettings,
	collector *dataHealthCollector,
	summary *dataHealthSummary,
) error {
	rows, err := db.Query("SELECT id, month, data, duration_seconds FROM snapshots ORDER BY month")
	if err != nil {
		return err
	}
	defer rows.Close()

	organizationNames := make(map[string]map[string]bool)
	for rows.Next() {
		var id int64
		var month, raw string
		var duration sql.NullInt64
		if err := rows.Scan(&id, &month, &raw, &duration); err != nil {
			return err
		}
		summary.Snapshots++
		location := fmt.Sprintf("%s (snapshot %d)", month, id)

		if !validHealthMonth(month) {
			collector.add(
				"snapshot_month_invalid", "critical", "Snapshots", "Snapshot month is invalid",
				"Snapshot months must use YYYY-MM.", location,
			)
		}
		if duration.Valid && duration.Int64 < 0 {
			collector.add(
				"snapshot_duration_negative", "warning", "Snapshots", "Snapshot duration is negative",
				"Editing duration should never be below zero.", location,
			)
		}

		data, err := decodeJSONObject(raw)
		if err != nil {
			collector.add(
				"snapshot_invalid_json", "critical", "Snapshots", "Snapshot contains invalid JSON",
				"The snapshot cannot be opened until its JSON is repaired.",
				fmt.Sprintf("%s: %v", location, err),
			)
			continue
		}

		rates, ratesOK := data["rates"].(map[string]any)
		if !ratesOK {
			collector.add(
				"snapshot_rates_invalid", "critical", "Currencies", "Snapshot rates are missing or malformed",
				"Every snapshot needs a rates object.", location,
			)
			rates = map[string]any{}
		}
		for currency, rawRate := range rates {
			rate, ok := healthNumber(rawRate)
			if !ok {
				collector.add(
					"snapshot_rate_not_numeric", "critical", "Currencies", "Exchange rate is not numeric",
					"Exchange rates must be numbers or numeric strings.",
					fmt.Sprintf("%s: %s", location, currency),
				)
			} else if rate <= 0 {
				collector.add(
					"snapshot_rate_non_positive", "critical", "Currencies", "Exchange rate is zero or negative",
					"Non-positive rates break currency conversion.",
					fmt.Sprintf("%s: %s = %v", location, currency, rate),
				)
			}
			if len(settings.currencies) > 0 && !settings.currencies[currency] {
				collector.add(
					"snapshot_currency_not_configured", "warning", "Currencies", "Snapshot uses an unconfigured currency",
					"The currency exists in historical data but is absent from Settings.",
					fmt.Sprintf("%s: %s", location, currency),
				)
			}
		}

		organizations, organizationsOK := data["organizations"].([]any)
		if !organizationsOK {
			collector.add(
				"snapshot_organizations_invalid", "critical", "Snapshots", "Organizations are missing or malformed",
				"Every snapshot needs an organizations array.", location,
			)
			continue
		}

		seenIDs := make(map[string]bool)
		for index, rawOrganization := range organizations {
			organization, ok := rawOrganization.(map[string]any)
			orgLocation := fmt.Sprintf("%s, organization %d", location, index+1)
			if !ok {
				collector.add(
					"snapshot_organization_invalid", "critical", "Organizations", "Organization entry is malformed",
					"Each organization must be a JSON object.", orgLocation,
				)
				continue
			}

			organizationID, idOK := healthString(organization["id"])
			name, nameOK := healthString(organization["name"])
			if !idOK || organizationID == "" {
				collector.add(
					"snapshot_organization_id_missing", "critical", "Organizations", "Organization ID is missing",
					"Stable organization IDs are required for comparisons between snapshots.", orgLocation,
				)
			} else {
				if seenIDs[organizationID] {
					collector.add(
						"snapshot_organization_id_duplicate", "critical", "Organizations", "Organization ID is duplicated",
						"One snapshot contains the same organization ID more than once.",
						fmt.Sprintf("%s: %s", location, organizationID),
					)
				}
				seenIDs[organizationID] = true
				if nameOK && name != "" {
					if organizationNames[organizationID] == nil {
						organizationNames[organizationID] = make(map[string]bool)
					}
					organizationNames[organizationID][name] = true
				}
			}
			if !nameOK || name == "" {
				collector.add(
					"snapshot_organization_name_missing", "critical", "Organizations", "Organization name is missing",
					"Organizations must have a visible name.", orgLocation,
				)
			}

			balances, balancesOK := organization["balances"].([]any)
			if !balancesOK {
				collector.add(
					"snapshot_balances_invalid", "critical", "Balances", "Organization balances are malformed",
					"Each organization needs a balances array.", orgLocation,
				)
				continue
			}
			for balanceIndex, rawBalance := range balances {
				balance, ok := rawBalance.(map[string]any)
				balanceLocation := fmt.Sprintf("%s, balance %d", orgLocation, balanceIndex+1)
				if !ok {
					collector.add(
						"snapshot_balance_invalid", "critical", "Balances", "Balance entry is malformed",
						"Each balance must be a JSON object.", balanceLocation,
					)
					continue
				}
				currency, currencyOK := healthString(balance["currency"])
				if !currencyOK || currency == "" {
					collector.add(
						"snapshot_balance_currency_missing", "critical", "Balances", "Balance currency is missing",
						"Every balance must identify its currency.", balanceLocation,
					)
				} else {
					if _, exists := rates[currency]; !exists {
						collector.add(
							"snapshot_balance_rate_missing", "critical", "Currencies", "Balance has no exchange rate",
							"Every balance currency must have a rate in the same snapshot.",
							fmt.Sprintf("%s: %s", balanceLocation, currency),
						)
					}
					if len(settings.currencies) > 0 && !settings.currencies[currency] {
						collector.add(
							"snapshot_balance_currency_not_configured", "warning", "Currencies", "Balance uses an unconfigured currency",
							"The currency exists in a balance but is absent from Settings.",
							fmt.Sprintf("%s: %s", balanceLocation, currency),
						)
					}
				}
				if _, ok := healthNumber(balance["amount"]); !ok {
					collector.add(
						"snapshot_balance_amount_invalid", "critical", "Balances", "Balance amount is not numeric",
						"Balance amounts must be numbers or numeric strings.", balanceLocation,
					)
				}

				if rawTags, exists := balance["tags"]; exists {
					tags, tagsOK := rawTags.([]any)
					if !tagsOK {
						collector.add(
							"snapshot_balance_tags_invalid", "warning", "Tags", "Balance tags are malformed",
							"Tags should be an array of names.", balanceLocation,
						)
					} else if len(settings.tags) > 0 {
						for _, rawTag := range tags {
							tag, ok := healthString(rawTag)
							if !ok || tag == "" {
								continue
							}
							if !settings.tags[tag] {
								collector.add(
									"snapshot_tag_not_configured", "warning", "Tags", "Balance uses an unconfigured tag",
									"The tag appears in snapshot data but is absent from Settings.",
									fmt.Sprintf("%s: %s", balanceLocation, tag),
								)
							}
						}
					}
				}
			}
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for id, names := range organizationNames {
		if len(names) <= 1 {
			continue
		}
		values := make([]string, 0, len(names))
		for name := range names {
			values = append(values, name)
		}
		sort.Strings(values)
		collector.add(
			"organization_name_inconsistent", "warning", "Organizations", "Organization name changes for the same ID",
			"The same stable ID is associated with multiple names across snapshots.",
			fmt.Sprintf("%s: %s", id, strings.Join(values, " → ")),
		)
	}
	return nil
}

func scanFlowHealth(
	db *sql.DB,
	settings healthSettings,
	collector *dataHealthCollector,
	summary *dataHealthSummary,
) error {
	rows, err := db.Query(`
		SELECT id, month, entry_type, direction, currency, amount, tax_rate, tag, to_currency, to_amount, to_tag
		FROM flow_entries
		ORDER BY month, id
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		var month, entryType, direction, currency, tag, toCurrency, toTag string
		var amount, taxRate, toAmount float64
		if err := rows.Scan(
			&id, &month, &entryType, &direction, &currency, &amount, &taxRate,
			&tag, &toCurrency, &toAmount, &toTag,
		); err != nil {
			return err
		}
		summary.FlowEntries++
		location := fmt.Sprintf("%s (flow %d)", month, id)

		if !validHealthMonth(month) {
			collector.add(
				"flow_month_invalid", "critical", "Cash flow", "Cash-flow month is invalid",
				"Cash-flow months must use YYYY-MM.", location,
			)
		}
		if direction != "in" && direction != "out" {
			collector.add(
				"flow_direction_invalid", "critical", "Cash flow", "Cash-flow direction is invalid",
				"Direction must be either in or out.", location,
			)
		}
		if amount <= 0 || math.IsNaN(amount) || math.IsInf(amount, 0) {
			collector.add(
				"flow_amount_non_positive", "critical", "Cash flow", "Cash-flow amount is not positive",
				"External and transfer source amounts must be greater than zero.", location,
			)
		}
		if taxRate < 0 || taxRate > 100 || math.IsNaN(taxRate) || math.IsInf(taxRate, 0) {
			collector.add(
				"flow_tax_invalid", "critical", "Cash flow", "Tax rate is outside 0–100%",
				"Tax rates outside this range cannot be interpreted correctly.", location,
			)
		}
		if len(settings.currencies) > 0 && !settings.currencies[currency] {
			collector.add(
				"flow_currency_not_configured", "warning", "Currencies", "Cash flow uses an unconfigured currency",
				"The currency appears in Cash Flow but is absent from Settings.",
				fmt.Sprintf("%s: %s", location, currency),
			)
		}
		if tag != "" && len(settings.tags) > 0 && !settings.tags[tag] {
			collector.add(
				"flow_tag_not_configured", "warning", "Tags", "Cash flow uses an unconfigured tag",
				"The tag appears in Cash Flow but is absent from Settings.",
				fmt.Sprintf("%s: %s", location, tag),
			)
		}

		switch entryType {
		case "external":
		case "transfer":
			if strings.TrimSpace(toCurrency) == "" || toAmount <= 0 ||
				math.IsNaN(toAmount) || math.IsInf(toAmount, 0) {
				collector.add(
					"flow_transfer_incomplete", "critical", "Cash flow", "Transfer destination is incomplete",
					"Transfers need a destination currency and a positive destination amount.", location,
				)
			}
			if len(settings.currencies) > 0 && toCurrency != "" && !settings.currencies[toCurrency] {
				collector.add(
					"flow_destination_currency_not_configured", "warning", "Currencies", "Transfer destination uses an unconfigured currency",
					"The destination currency appears in Cash Flow but is absent from Settings.",
					fmt.Sprintf("%s: %s", location, toCurrency),
				)
			}
			if toTag != "" && len(settings.tags) > 0 && !settings.tags[toTag] {
				collector.add(
					"flow_destination_tag_not_configured", "warning", "Tags", "Transfer destination uses an unconfigured tag",
					"The destination tag appears in Cash Flow but is absent from Settings.",
					fmt.Sprintf("%s: %s", location, toTag),
				)
			}
		default:
			collector.add(
				"flow_entry_type_invalid", "critical", "Cash flow", "Cash-flow entry type is invalid",
				"Entry type must be external or transfer.", location,
			)
		}
	}
	return rows.Err()
}

func runDataHealthCheck(db *sql.DB) (dataHealthReport, error) {
	collector := newDataHealthCollector()
	summary := dataHealthSummary{}
	settings := loadHealthSettings(db, collector)

	if err := scanSnapshotHealth(db, settings, collector, &summary); err != nil {
		return dataHealthReport{}, fmt.Errorf("scan snapshots: %w", err)
	}
	if err := scanFlowHealth(db, settings, collector, &summary); err != nil {
		return dataHealthReport{}, fmt.Errorf("scan cash flow: %w", err)
	}

	issues := collector.issues()
	status := "healthy"
	for _, issue := range issues {
		if issue.Severity == "critical" {
			summary.Critical += issue.Count
			status = "critical"
		} else {
			summary.Warnings += issue.Count
			if status == "healthy" {
				status = "warning"
			}
		}
	}

	return dataHealthReport{
		Status:    status,
		CheckedAt: time.Now(),
		Summary:   summary,
		Issues:    issues,
	}, nil
}
