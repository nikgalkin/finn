CREATE TABLE ds_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('flow', 'balance', 'raw')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'invalid')),
    occurred_at TEXT NOT NULL DEFAULT '',
    received_at TEXT NOT NULL,
    raw TEXT NOT NULL DEFAULT '',
    draft TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    flow_entry_id INTEGER,
    run_id INTEGER
);

-- Deduplication lives entirely in this index: a repeated fetch of the same item
-- is an INSERT OR IGNORE that counts as skipped. That is also why a rejected row
-- is kept rather than deleted, otherwise it would come back on the next fetch.
CREATE UNIQUE INDEX idx_ds_inbox_identity ON ds_inbox (source, external_id);

CREATE INDEX idx_ds_inbox_status ON ds_inbox (status, occurred_at DESC, id DESC);

CREATE TABLE ds_sources (
    name TEXT PRIMARY KEY,
    cursor TEXT NOT NULL DEFAULT '',
    last_run_at TEXT NOT NULL DEFAULT '',
    last_status TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT ''
);

CREATE TABLE ds_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL DEFAULT '',
    exit_code INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    stdout_bytes INTEGER NOT NULL DEFAULT 0,
    items_total INTEGER NOT NULL DEFAULT 0,
    items_new INTEGER NOT NULL DEFAULT 0,
    items_skipped INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    stderr_tail TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_ds_runs_source ON ds_runs (source, id DESC);
