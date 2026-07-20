-- Demo settings: multi-currency salary, recurring expenses, transfers, and analytical tags.
INSERT OR REPLACE INTO settings (key, value) VALUES ('master_data', '{"organizations":[{"name":"T-Bank","country":"RUS"},{"name":"Alfabank","country":"RUS"},{"name":"Binance"},{"name":"Cash","country":"RUS"}],"currencies":["RUB","USD","EUR"],"autoFetchCurrencies":["USD","EUR"],"baseCurrency":"RUB","secondaryCurrency":"USD","tags":["deposit","cash","stocks","checking"],"cashFlow":{"enabled":true,"sources":["Remote Studio","Landlord","Auto Market"],"taxRates":{"Remote Studio":0,"Landlord":0,"Auto Market":0},"categories":["salary","bonus","rent","car"]}}');

-- October 2025 is the opening snapshot. From November onward, every month contains:
--   +3,000 USD salary, a 1,500 USD -> RUB internal conversion, and -90,000 RUB rent.
-- The Alfabank deposit yields 10% per year, accrued monthly, without additional contributions.
-- March has a 600,000 RUB car purchase and a larger conversion; May has a 5,000 USD bonus.
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (1, '2025-10', '{
  "comment": "Opening balance before recurring Cash Flow",
  "rates": {"USD": 74.5, "EUR": 86.2, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 200000, "tags": ["checking"]}, {"currency": "USD", "amount": 2000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 200000, "tags": ["deposit"], "comment": "Deposit yielding 10% per year with monthly accrual"}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 180);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (2, '2025-11', '{
  "rates": {"USD": 75.1, "EUR": 87.0, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 222650, "tags": ["checking"]}, {"currency": "USD", "amount": 3500, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 201666.67, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 95);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (3, '2025-12', '{
  "rates": {"USD": 76.2, "EUR": 91.2, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 246950, "tags": ["checking"]}, {"currency": "USD", "amount": 5000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 203347.23, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 110);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (4, '2026-01', '{
  "rates": {"USD": 76.0, "EUR": 90.5, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 270950, "tags": ["checking"]}, {"currency": "USD", "amount": 6500, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 205041.79, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 85);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (5, '2026-02', '{
  "rates": {"USD": 77.9, "EUR": 90.7, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 297800, "tags": ["checking"]}, {"currency": "USD", "amount": 8000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 206750.47, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 120);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (6, '2026-03', '{
  "comment": "Large one-off outflow: bought a used car for 600,000 RUB",
  "rates": {"USD": 76.8, "EUR": 89.5, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 183800, "tags": ["checking"], "comment": "Bought a used car for 600,000 RUB"}, {"currency": "USD", "amount": 3500, "tags": ["checking"], "comment": "Converted 7,500 USD to fund the purchase"}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 208473.39, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 210);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (7, '2026-04', '{
  "rates": {"USD": 75.9, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 207650, "tags": ["checking"]}, {"currency": "USD", "amount": 5000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 210210.67, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 75);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (8, '2026-05', '{
  "comment": "Income spike: received a 5,000 USD annual bonus",
  "rates": {"USD": 75.8, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 231350, "tags": ["checking"]}, {"currency": "USD", "amount": 11500, "tags": ["checking"], "comment": "Annual performance bonus received: +5,000 USD"}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 211962.43, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 165);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (9, '2026-06', '{
  "rates": {"USD": 75.9, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 255200, "tags": ["checking"]}, {"currency": "USD", "amount": 13000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 213728.78, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 140);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (10, '2026-07', '{
  "comment": "Deposit accrued one month at 10% annual rate; salary, rent, and conversion reconcile T-Bank balances",
  "rates": {"USD": 77.9, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 282050, "tags": ["checking"]}, {"currency": "USD", "amount": 14500, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 215509.85, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 90);

-- External Cash Flow and internal currency conversion for every closed month.
INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
VALUES
  (1,  '2025-11', 'external', 'in',  'Remote Studio', 'T-Bank', 'USD', 3000, 0, 'salary', 'Monthly USD salary', '', '', 0),
  (2,  '2025-11', 'transfer', 'out', '',              'T-Bank', 'USD', 1500, 0, '',       'Convert salary for rent', 'T-Bank', 'RUB', 112650),
  (3,  '2025-11', 'external', 'out', 'Landlord',      'T-Bank', 'RUB', 90000, 0, 'rent',  'Monthly apartment rent', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
VALUES
  (4,  '2025-12', 'external', 'in',  'Remote Studio', 'T-Bank', 'USD', 3000, 0, 'salary', 'Monthly USD salary', '', '', 0),
  (5,  '2025-12', 'transfer', 'out', '',              'T-Bank', 'USD', 1500, 0, '',       'Convert salary for rent', 'T-Bank', 'RUB', 114300),
  (6,  '2025-12', 'external', 'out', 'Landlord',      'T-Bank', 'RUB', 90000, 0, 'rent',  'Monthly apartment rent', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
VALUES
  (7,  '2026-01', 'external', 'in',  'Remote Studio', 'T-Bank', 'USD', 3000, 0, 'salary', 'Monthly USD salary', '', '', 0),
  (8,  '2026-01', 'transfer', 'out', '',              'T-Bank', 'USD', 1500, 0, '',       'Convert salary for rent', 'T-Bank', 'RUB', 114000),
  (9,  '2026-01', 'external', 'out', 'Landlord',      'T-Bank', 'RUB', 90000, 0, 'rent',  'Monthly apartment rent', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
VALUES
  (10, '2026-02', 'external', 'in',  'Remote Studio', 'T-Bank', 'USD', 3000, 0, 'salary', 'Monthly USD salary', '', '', 0),
  (11, '2026-02', 'transfer', 'out', '',              'T-Bank', 'USD', 1500, 0, '',       'Convert salary for rent', 'T-Bank', 'RUB', 116850),
  (12, '2026-02', 'external', 'out', 'Landlord',      'T-Bank', 'RUB', 90000, 0, 'rent',  'Monthly apartment rent', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
VALUES
  (13, '2026-03', 'external', 'in',  'Remote Studio', 'T-Bank', 'USD', 3000, 0, 'salary', 'Monthly USD salary', '', '', 0),
  (14, '2026-03', 'transfer', 'out', '',              'T-Bank', 'USD', 7500, 0, '',       'Convert USD to fund rent and the car purchase', 'T-Bank', 'RUB', 576000),
  (15, '2026-03', 'external', 'out', 'Landlord',      'T-Bank', 'RUB', 90000, 0, 'rent',  'Monthly apartment rent', '', '', 0),
  (16, '2026-03', 'external', 'out', 'Auto Market',   'T-Bank', 'RUB', 600000, 0, 'car',  'Bought a used car', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
VALUES
  (17, '2026-04', 'external', 'in',  'Remote Studio', 'T-Bank', 'USD', 3000, 0, 'salary', 'Monthly USD salary', '', '', 0),
  (18, '2026-04', 'transfer', 'out', '',              'T-Bank', 'USD', 1500, 0, '',       'Convert salary for rent', 'T-Bank', 'RUB', 113850),
  (19, '2026-04', 'external', 'out', 'Landlord',      'T-Bank', 'RUB', 90000, 0, 'rent',  'Monthly apartment rent', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
VALUES
  (20, '2026-05', 'external', 'in',  'Remote Studio', 'T-Bank', 'USD', 3000, 0, 'salary', 'Monthly USD salary', '', '', 0),
  (21, '2026-05', 'external', 'in',  'Remote Studio', 'T-Bank', 'USD', 5000, 0, 'bonus',  'Annual performance bonus', '', '', 0),
  (22, '2026-05', 'transfer', 'out', '',              'T-Bank', 'USD', 1500, 0, '',       'Convert salary for rent', 'T-Bank', 'RUB', 113700),
  (23, '2026-05', 'external', 'out', 'Landlord',      'T-Bank', 'RUB', 90000, 0, 'rent',  'Monthly apartment rent', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
VALUES
  (24, '2026-06', 'external', 'in',  'Remote Studio', 'T-Bank', 'USD', 3000, 0, 'salary', 'Monthly USD salary', '', '', 0),
  (25, '2026-06', 'transfer', 'out', '',              'T-Bank', 'USD', 1500, 0, '',       'Convert salary for rent', 'T-Bank', 'RUB', 113850),
  (26, '2026-06', 'external', 'out', 'Landlord',      'T-Bank', 'RUB', 90000, 0, 'rent',  'Monthly apartment rent', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, currency, amount, tax_rate, category, comment, to_account, to_currency, to_amount)
VALUES
  (27, '2026-07', 'external', 'in',  'Remote Studio', 'T-Bank', 'USD', 3000, 0, 'salary', 'Monthly USD salary', '', '', 0),
  (28, '2026-07', 'transfer', 'out', '',              'T-Bank', 'USD', 1500, 0, '',       'Convert salary for rent', 'T-Bank', 'RUB', 116850),
  (29, '2026-07', 'external', 'out', 'Landlord',      'T-Bank', 'RUB', 90000, 0, 'rent',  'Monthly apartment rent', '', '', 0);

-- Align auto-increment counters after inserting deterministic demo IDs.
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('snapshots', 10);
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('flow_entries', 29);
