ALTER TABLE flow_entries
ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'external' CHECK (entry_type IN ('external', 'transfer'));

ALTER TABLE flow_entries
ADD COLUMN account TEXT NOT NULL DEFAULT '';

ALTER TABLE flow_entries
ADD COLUMN to_account TEXT NOT NULL DEFAULT '';

ALTER TABLE flow_entries
ADD COLUMN to_currency TEXT NOT NULL DEFAULT '';

ALTER TABLE flow_entries
ADD COLUMN to_amount REAL NOT NULL DEFAULT 0 CHECK (to_amount >= 0);
