package main

import "strings"

const snapshotOrganizationsSQL = `
SELECT
  s.id AS snapshot_id,
  s.month,
  CAST(o.key AS INTEGER) + 1 AS organization_number,
  o.value AS organization
FROM snapshots AS s
JOIN json_each(
  CASE WHEN json_valid(s.data) THEN s.data ELSE '{}' END,
  '$.organizations'
) AS o
ORDER BY s.month, s.id, CAST(o.key AS INTEGER);`

const snapshotBalancesSQL = `
SELECT
  s.id AS snapshot_id,
  s.month,
  CAST(o.key AS INTEGER) + 1 AS organization_number,
  CAST(b.key AS INTEGER) + 1 AS balance_number,
  b.value AS balance
FROM snapshots AS s
JOIN json_each(
  CASE WHEN json_valid(s.data) THEN s.data ELSE '{}' END,
  '$.organizations'
) AS o
JOIN json_each(
  CASE WHEN o.type = 'object' THEN o.value ELSE '{}' END,
  '$.balances'
) AS b
ORDER BY s.month, s.id, CAST(o.key AS INTEGER), CAST(b.key AS INTEGER);`

const snapshotRatesSQL = `
SELECT
  s.id AS snapshot_id,
  s.month,
  r.key AS currency,
  r.value AS rate
FROM snapshots AS s
JOIN json_each(
  CASE WHEN json_valid(s.data) THEN s.data ELSE '{}' END,
  '$.rates'
) AS r
ORDER BY s.month, s.id, r.key;`

const snapshotTagsSQL = `
SELECT
  s.id AS snapshot_id,
  s.month,
  CAST(o.key AS INTEGER) + 1 AS organization_number,
  CAST(b.key AS INTEGER) + 1 AS balance_number,
  t.value AS tag
FROM snapshots AS s
JOIN json_each(
  CASE WHEN json_valid(s.data) THEN s.data ELSE '{}' END,
  '$.organizations'
) AS o
JOIN json_each(
  CASE WHEN o.type = 'object' THEN o.value ELSE '{}' END,
  '$.balances'
) AS b
JOIN json_each(
  CASE WHEN b.type = 'object' THEN b.value ELSE '{}' END,
  '$.tags'
) AS t
ORDER BY s.month, s.id, CAST(o.key AS INTEGER), CAST(b.key AS INTEGER), t.key;`

const flowRowsSQL = `
SELECT
  id, month, entry_type, direction, currency, amount, tax_rate, tag,
  to_currency, to_amount, to_tag
FROM flow_entries
ORDER BY month, id;`

func dataHealthInspectionSQL(code string) string {
	var query string
	switch code {
	case "settings_missing", "settings_unreadable":
		query = `
SELECT key, value
FROM settings
WHERE key = 'master_data';`
	case "settings_invalid_json":
		query = `
SELECT key, value
FROM settings
WHERE key = 'master_data'
  AND json_valid(value) = 0;`
	case "settings_currencies_invalid":
		query = `
SELECT key, value
FROM settings
WHERE key = 'master_data'
  AND json_valid(value) = 1
  AND (
    COALESCE(json_type(value, '$.currencies'), '') <> 'array'
    OR EXISTS (
      SELECT 1
      FROM json_each(
        CASE
          WHEN json_type(value, '$.currencies') = 'array' THEN value
          ELSE '{}'
        END,
        '$.currencies'
      )
      WHERE type <> 'text'
    )
  );`
	case "settings_tags_invalid":
		query = `
SELECT key, value
FROM settings
WHERE key = 'master_data'
  AND json_valid(value) = 1
  AND json_type(value, '$.tags') IS NOT NULL
  AND (
    json_type(value, '$.tags') <> 'array'
    OR EXISTS (
      SELECT 1
      FROM json_each(
        CASE
          WHEN json_type(value, '$.tags') = 'array' THEN value
          ELSE '{}'
        END,
        '$.tags'
      )
      WHERE type <> 'text'
    )
  );`
	case "snapshot_month_invalid":
		query = `
SELECT id, month, data, duration_seconds
FROM snapshots
WHERE length(month) <> 7
   OR substr(month, 5, 1) <> '-'
   OR substr(month, 1, 4) GLOB '*[^0-9]*'
   OR substr(month, 6, 2) GLOB '*[^0-9]*'
   OR substr(month, 6, 2) NOT BETWEEN '01' AND '12'
ORDER BY month, id;`
	case "snapshot_duration_negative":
		query = `
SELECT id, month, duration_seconds
FROM snapshots
WHERE duration_seconds < 0
ORDER BY month, id;`
	case "snapshot_invalid_json":
		query = `
SELECT id, month, data, duration_seconds
FROM snapshots
WHERE json_valid(data) = 0
ORDER BY month, id;`
	case "snapshot_rates_invalid":
		query = `
SELECT id, month, data
FROM snapshots
WHERE json_valid(data) = 1
  AND COALESCE(json_type(data, '$.rates'), '') <> 'object'
ORDER BY month, id;`
	case "snapshot_rate_not_numeric", "snapshot_currency_not_configured":
		query = snapshotRatesSQL
	case "snapshot_rate_non_positive":
		query = `
SELECT DISTINCT
  s.id AS snapshot_id,
  s.month,
  r.key AS currency,
  r.value AS rate
FROM snapshots AS s
JOIN json_each(
  CASE WHEN json_valid(s.data) THEN s.data ELSE '{}' END,
  '$.rates'
) AS r
WHERE CAST(r.value AS REAL) <= 0
  AND EXISTS (
    SELECT 1
    FROM json_each(
      CASE WHEN json_valid(s.data) THEN s.data ELSE '{}' END,
      '$.organizations'
    ) AS o
    JOIN json_each(
      CASE WHEN o.type = 'object' THEN o.value ELSE '{}' END,
      '$.balances'
    ) AS b
    WHERE b.type = 'object'
      AND trim(json_extract(b.value, '$.currency')) = r.key
  )
ORDER BY s.month, s.id, r.key;`
	case "snapshot_organizations_invalid":
		query = `
SELECT id, month, data
FROM snapshots
WHERE json_valid(data) = 1
  AND COALESCE(json_type(data, '$.organizations'), '') <> 'array'
ORDER BY month, id;`
	case "snapshot_organization_invalid", "snapshot_organization_id_missing",
		"snapshot_organization_name_missing", "snapshot_organization_id_duplicate",
		"organization_name_inconsistent":
		query = snapshotOrganizationsSQL
	case "snapshot_balances_invalid", "snapshot_balance_invalid",
		"snapshot_balance_currency_missing", "snapshot_balance_rate_missing",
		"snapshot_balance_amount_invalid", "snapshot_balance_currency_not_configured":
		query = snapshotBalancesSQL
	case "snapshot_balance_tags_invalid", "snapshot_tag_not_configured":
		query = snapshotTagsSQL
	case "flow_month_invalid", "flow_direction_invalid", "flow_amount_non_positive",
		"flow_tax_invalid", "flow_currency_not_configured", "flow_tag_not_configured",
		"flow_transfer_incomplete", "flow_destination_currency_not_configured",
		"flow_destination_tag_not_configured", "flow_entry_type_invalid":
		query = flowRowsSQL
	}
	return strings.TrimSpace(query)
}
