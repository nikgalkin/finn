CREATE TEMP TABLE migration_001_organization_countries (
    name TEXT PRIMARY KEY,
    country TEXT NOT NULL
);

INSERT INTO migration_001_organization_countries (name, country)
SELECT
    lower(trim(json_extract(organization.value, '$.name'))),
    upper(trim(json_extract(organization.value, '$.country')))
FROM settings
JOIN json_each(settings.value, '$.organizations') AS organization
WHERE settings.key = 'master_data'
  AND organization.type = 'object'
  AND coalesce(trim(json_extract(organization.value, '$.country')), '') <> '';

CREATE TEMP TABLE migration_001_rebuilt_snapshots (
    snapshot_id INTEGER PRIMARY KEY,
    organizations TEXT NOT NULL
);

INSERT INTO migration_001_rebuilt_snapshots (snapshot_id, organizations)
SELECT
    snapshot_id,
    json_group_array(json(updated_organization))
FROM (
    SELECT
        snapshots.id AS snapshot_id,
        CAST(snapshot_organization.key AS INTEGER) AS organization_index,
        CASE
            WHEN coalesce(trim(json_extract(snapshot_organization.value, '$.country')), '') = ''
                 AND configured.country IS NOT NULL
            THEN json_set(snapshot_organization.value, '$.country', configured.country)
            ELSE snapshot_organization.value
        END AS updated_organization,
        CASE
            WHEN coalesce(trim(json_extract(snapshot_organization.value, '$.country')), '') = ''
                 AND configured.country IS NOT NULL
            THEN 1
            ELSE 0
        END AS changed
    FROM snapshots
    JOIN json_each(snapshots.data, '$.organizations') AS snapshot_organization
    LEFT JOIN migration_001_organization_countries AS configured
        ON configured.name = lower(trim(json_extract(snapshot_organization.value, '$.name')))
    ORDER BY snapshots.id, organization_index
)
GROUP BY snapshot_id
HAVING sum(changed) > 0;

UPDATE snapshots
SET data = json_set(
    data,
    '$.organizations',
    json((
        SELECT organizations
        FROM migration_001_rebuilt_snapshots
        WHERE snapshot_id = snapshots.id
    ))
)
WHERE id IN (SELECT snapshot_id FROM migration_001_rebuilt_snapshots);

DROP TABLE migration_001_rebuilt_snapshots;
DROP TABLE migration_001_organization_countries;
