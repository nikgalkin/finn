-- 1. Global app settings with Binance instead of Anorbank and default tags
INSERT OR REPLACE INTO settings (key, value) VALUES ('master_data', '{"organizations":["T-Bank","Alfabank","Binance","Cash"],"currencies":["RUB","USD","EUR"],"autoFetchCurrencies":["USD","EUR"],"tags":["deposit","cash","stocks","checking"]}');

-- 2. OCTOBER 2025: Starting Accumulation Period
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (1, '2025-10', '{
  "rates": {"USD": 74.5, "EUR": 86.2, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 80000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 120000, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1000, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 180);

-- 3. NOVEMBER 2025: Smooth Growth
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (2, '2025-11', '{
  "rates": {"USD": 75.1, "EUR": 87.0, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 100000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 150000, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1200, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 95);

-- 4. DECEMBER 2025: End of Year Core Savings
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (3, '2025-12', '{
  "rates": {"USD": 76.2, "EUR": 91.2, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 130000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 180000, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1500, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 800, "tags": ["cash"]}]}
  ]
}', 110);

-- 5. JANUARY 2026: Post-Holiday Stability
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (4, '2026-01', '{
  "rates": {"USD": 76.0, "EUR": 90.5, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 140000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 190000, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1500, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 800, "tags": ["cash"]}]}
  ]
}', 85);

-- 6. FEBRUARY 2026: Maximum Capital Before Big Purchase
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (5, '2026-02', '{
  "rates": {"USD": 77.9, "EUR": 90.7, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 210000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 200000, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1500, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1000, "tags": ["cash"]}]}
  ]
}', 120);

-- 7. MARCH 2026: The Gap 📉 (Car Purchase)
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (6, '2026-03', '{
  "rates": {"USD": 76.8, "EUR": 89.5, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 10000, "tags": ["checking"], "comment": "Bought a used car! 🚗 Paid 200k from T-Bank card"}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 50000, "tags": ["deposit"], "comment": "Withdrew 150k from savings account for the car 🚗"}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1500, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1000, "tags": ["cash"]}]}
  ]
}', 210);

-- 8. APRIL 2026: Post-Purchase Slow Recovery
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (7, '2026-04', '{
  "rates": {"USD": 75.9, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 50000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 60000, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1700, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1000, "tags": ["cash"]}]}
  ]
}', 75);

-- 9. MAY 2026: The Spike 📈 (Annual Bonus Hits T-Bank Account!)
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (8, '2026-05', '{
  "rates": {"USD": 75.8, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 450000, "tags": ["checking"], "comment": "Annual performance bonus received! 💰 +400k RUB"}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 60000, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 1700, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1000, "tags": ["cash"]}]}
  ]
}', 165);

-- 10. JUNE 2026: Rebalancing
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (9, '2026-06', '{
  "rates": {"USD": 75.9, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 150000, "tags": ["checking"], "comment": "Distributed bonus money to savings and USD"}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 310000, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 2500, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1200, "tags": ["cash"]}]}
  ]
}', 140);

-- 11. JULY 2026: Current State
INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (10, '2026-07', '{
  "rates": {"USD": 77.9, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 180000, "tags": ["checking"]}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 320000, "tags": ["deposit"]}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Binance", "balances": [{"currency": "USD", "amount": 2500, "tags": ["stocks"]}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1500, "tags": ["cash"]}]}
  ]
}', 90);

-- 12. Align the auto-increment counter
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('snapshots', 10);
