CREATE TABLE flow_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    counterparty TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_flow_entries_month ON flow_entries (month DESC, id DESC);
