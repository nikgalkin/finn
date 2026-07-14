ALTER TABLE flow_entries
ADD COLUMN tax_rate REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100);
