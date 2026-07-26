-- Demo settings: multi-currency salary, recurring rent, tagged movements, and non-yielding tags.
INSERT OR REPLACE INTO settings (key, value) VALUES ('master_data', '{"organizations":[{"name":"T-Bank","country":"RUS"},{"name":"Alfabank","country":"RUS"},{"name":"Binance","country":"CYM"},{"name":"Cash","country":"RUS"}],"currencies":["RUB","USD","EUR"],"autoFetchCurrencies":["USD","EUR"],"baseCurrency":"RUB","secondaryCurrency":"USD","tags":["deposit","cash","stocks","checking"],"nonYieldingTags":["checking","cash"],"cashFlow":{"enabled":true,"sources":["Remote Studio","Landlord","Auto Market","Tech Store","Travel Agency"],"taxRates":{"Remote Studio":0,"Landlord":0,"Auto Market":0,"Tech Store":0,"Travel Agency":0},"categories":["salary","bonus","rent","car","electronics","travel"]}}');

-- 14 monthly snapshots. 2025-06 is the opening balance; every later month carries:
--   +3,000 USD salary, a USD -> RUB conversion, and -90,000 RUB rent, all recorded in Cash Flow.
-- Alfabank pays 12% per year as exactly +1.00% every month; Binance grows at the same pace.
-- Settings mark checking and cash as non-yielding: what they lose beyond the recorded
-- movements is everyday spending that never reached the journal.

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (1, '2025-06', '{
  "comment": "Opening balance before the recurring Cash Flow journal starts",
  "rates": {"USD": 74.2, "EUR": 85.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 320000, "tags": ["checking"]}, {"currency": "USD", "amount": 2000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1200000, "tags": ["deposit"], "comment": "Deposit yielding 12% per year, accrued as 1% every month"}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 4000, "tags": ["stocks"], "comment": "Index portfolio growing about 1% per month"}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 180);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (2, '2025-07', '{
  "rates": {"USD": 74.8, "EUR": 86.4, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 330200, "tags": ["checking"]}, {"currency": "USD", "amount": 3500, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1212000, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 4040, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 95);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (3, '2025-08', '{
  "rates": {"USD": 75.3, "EUR": 87.1, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 343650, "tags": ["checking"]}, {"currency": "USD", "amount": 2000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1224120, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 7080.4, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 110);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (4, '2025-09', '{
  "rates": {"USD": 74.9, "EUR": 86.5, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 352000, "tags": ["checking"]}, {"currency": "USD", "amount": 3500, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1236361.2, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 7151.2, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 85);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (5, '2025-10', '{
  "comment": "Spending gap: 180,000 RUB on a laptop and desk setup, funded by a larger conversion",
  "rates": {"USD": 75.6, "EUR": 87.4, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 335600, "tags": ["checking"], "comment": "New laptop and desk setup: -180 000 RUB"}, {"currency": "USD", "amount": 3000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1248724.81, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 7222.71, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 205);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (6, '2025-11', '{
  "rates": {"USD": 76.2, "EUR": 88.2, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 344400, "tags": ["checking"]}, {"currency": "USD", "amount": 1500, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1261212.06, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 10294.94, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 120);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (7, '2025-12', '{
  "comment": "Income spike: 2,000 USD New Year bonus. Holiday season also ate more cash than usual",
  "rates": {"USD": 77, "EUR": 89.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 343900, "tags": ["checking"]}, {"currency": "USD", "amount": 5000, "tags": ["checking"], "comment": "New Year bonus: +2 000 USD"}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1273824.18, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 10397.89, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 440, "tags": ["cash"]}]}
  ]
}', 165);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (8, '2026-01', '{
  "rates": {"USD": 76.4, "EUR": 88.9, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 360000, "tags": ["checking"]}, {"currency": "USD", "amount": 6500, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1286562.42, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 10501.87, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 440, "tags": ["cash"]}]}
  ]
}', 90);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (9, '2026-02', '{
  "rates": {"USD": 77.3, "EUR": 89.4, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 373450, "tags": ["checking"]}, {"currency": "USD", "amount": 5000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1299428.04, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 13606.89, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 440, "tags": ["cash"]}]}
  ]
}', 105);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (10, '2026-03', '{
  "comment": "Spending gap: 600,000 RUB used car, funded by converting 7,500 USD",
  "rates": {"USD": 76.9, "EUR": 88.7, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 247200, "tags": ["checking"], "comment": "Bought a used car: -600 000 RUB"}, {"currency": "USD", "amount": 500, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1312422.32, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 13742.96, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 440, "tags": ["cash"]}]}
  ]
}', 230);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (11, '2026-04', '{
  "rates": {"USD": 76.1, "EUR": 87.9, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 260850, "tags": ["checking"]}, {"currency": "USD", "amount": 2000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1325546.54, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 13880.39, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 440, "tags": ["cash"]}]}
  ]
}', 75);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (12, '2026-05', '{
  "comment": "Income spike: 5,000 USD annual bonus, 3,000 USD of it moved into stocks",
  "rates": {"USD": 76.8, "EUR": 88.5, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 270050, "tags": ["checking"]}, {"currency": "USD", "amount": 5500, "tags": ["checking"], "comment": "Annual performance bonus: +5 000 USD"}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1338802.01, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 17019.19, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 440, "tags": ["cash"]}]}
  ]
}', 175);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (13, '2026-06', '{
  "comment": "Spending gap: 120,000 RUB summer vacation paid upfront",
  "rates": {"USD": 77.4, "EUR": 89.2, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 274250, "tags": ["checking"], "comment": "Summer vacation paid upfront: -120 000 RUB"}, {"currency": "USD", "amount": 5500, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1352190.03, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 17189.38, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 360, "tags": ["cash"]}]}
  ]
}', 195);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (14, '2026-07', '{
  "comment": "Deposit keeps accruing 1% per month; salary, rent, and the conversion reconcile T-Bank",
  "rates": {"USD": 78.1, "EUR": 90.1, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 289400, "tags": ["checking"]}, {"currency": "USD", "amount": 4000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1365711.93, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "country": "CYM", "balances": [{"currency": "USD", "amount": 20361.27, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 360, "tags": ["cash"]}]}
  ]
}', 100);

-- Salary, rent, purchases, and internal transfers. Every movement carries its balance tag.

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (1,  '2025-07', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (2,  '2025-07', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     1500, 0, '',           'Convert salary for rent', 'T-Bank', 'checking', 'RUB', 112200),
  (3,  '2025-07', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (4,  '2025-08', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (5,  '2025-08', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     1500, 0, '',           'Convert salary for rent', 'T-Bank', 'checking', 'RUB', 112950),
  (6,  '2025-08', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0),
  (7,  '2025-08', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     3000, 0, '',           'Move savings into the index portfolio', 'Binance', 'stocks',   'USD', 3000);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (8,  '2025-09', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (9,  '2025-09', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     1500, 0, '',           'Convert salary for rent', 'T-Bank', 'checking', 'RUB', 112350),
  (10, '2025-09', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (11, '2025-10', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (12, '2025-10', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     3500, 0, '',           'Convert USD to cover the month and the purchase', 'T-Bank', 'checking', 'RUB', 264600),
  (13, '2025-10', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0),
  (14, '2025-10', 'external', 'out', 'Tech Store',    'T-Bank', 'checking', 'RUB',   180000, 0, 'electronics', 'New laptop and desk setup', '',       '',         '',    0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (15, '2025-11', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (16, '2025-11', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     1500, 0, '',           'Convert salary for rent', 'T-Bank', 'checking', 'RUB', 114300),
  (17, '2025-11', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0),
  (18, '2025-11', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     3000, 0, '',           'Move savings into the index portfolio', 'Binance', 'stocks',   'USD', 3000);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (19, '2025-12', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (20, '2025-12', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     2000, 0, 'bonus',      'New Year bonus', '',       '',         '',    0),
  (21, '2025-12', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     1500, 0, '',           'Convert salary for rent', 'T-Bank', 'checking', 'RUB', 115500),
  (22, '2025-12', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (23, '2026-01', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (24, '2026-01', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     1500, 0, '',           'Convert salary for rent', 'T-Bank', 'checking', 'RUB', 114600),
  (25, '2026-01', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (26, '2026-02', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (27, '2026-02', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     1500, 0, '',           'Convert salary for rent', 'T-Bank', 'checking', 'RUB', 115950),
  (28, '2026-02', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0),
  (29, '2026-02', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     3000, 0, '',           'Move savings into the index portfolio', 'Binance', 'stocks',   'USD', 3000);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (30, '2026-03', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (31, '2026-03', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     7500, 0, '',           'Convert USD to cover the month and the purchase', 'T-Bank', 'checking', 'RUB', 576750),
  (32, '2026-03', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0),
  (33, '2026-03', 'external', 'out', 'Auto Market',   'T-Bank', 'checking', 'RUB',   600000, 0, 'car',        'Bought a used car', '',       '',         '',    0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (34, '2026-04', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (35, '2026-04', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     1500, 0, '',           'Convert salary for rent', 'T-Bank', 'checking', 'RUB', 114150),
  (36, '2026-04', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (37, '2026-05', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (38, '2026-05', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     5000, 0, 'bonus',      'Annual performance bonus', '',       '',         '',    0),
  (39, '2026-05', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     1500, 0, '',           'Convert salary for rent', 'T-Bank', 'checking', 'RUB', 115200),
  (40, '2026-05', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0),
  (41, '2026-05', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     3000, 0, '',           'Move savings into the index portfolio', 'Binance', 'stocks',   'USD', 3000);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (42, '2026-06', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (43, '2026-06', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     3000, 0, '',           'Convert USD to cover the month and the purchase', 'T-Bank', 'checking', 'RUB', 232200),
  (44, '2026-06', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0),
  (45, '2026-06', 'external', 'out', 'Travel Agency', 'T-Bank', 'checking', 'RUB',   120000, 0, 'travel',     'Summer vacation paid upfront', '',       '',         '',    0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (46, '2026-07', 'external', 'in',  'Remote Studio', 'T-Bank', 'checking', 'USD',     3000, 0, 'salary',     'Monthly USD salary', '',       '',         '',    0),
  (47, '2026-07', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     1500, 0, '',           'Convert salary for rent', 'T-Bank', 'checking', 'RUB', 117150),
  (48, '2026-07', 'external', 'out', 'Landlord',      'T-Bank', 'checking', 'RUB',    90000, 0, 'rent',       'Monthly apartment rent', '',       '',         '',    0),
  (49, '2026-07', 'transfer', 'out', '',              'T-Bank', 'checking', 'USD',     3000, 0, '',           'Move savings into the index portfolio', 'Binance', 'stocks',   'USD', 3000);

-- Align auto-increment counters after inserting deterministic demo IDs.
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('snapshots', 14);
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('flow_entries', 49);
