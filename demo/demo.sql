-- 1. Global app settings with all 4 organizations
INSERT OR IGNORE INTO settings (key, value) VALUES ('master_data', '{"organizations":["T-Bank","Alfabank","Anorbank","Cash"],"currencies":["RUB","USD","EUR"],"autoFetchCurrencies":["USD","EUR"]}');

-- 2. OCTOBER 2025: Starting Accumulation Period
INSERT OR IGNORE INTO snapshots (id, month, data) VALUES (1, '2025-10', '{
  "rates": {"USD": 74.5, "EUR": 86.2, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 80000}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 120000}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Anorbank", "balances": [{"currency": "USD", "amount": 1000}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 500}]}
  ]
}');

-- 3. NOVEMBER 2025: Smooth Growth
INSERT OR IGNORE INTO snapshots (id, month, data) VALUES (2, '2025-11', '{
  "rates": {"USD": 75.1, "EUR": 87.0, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 100000}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 150000}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Anorbank", "balances": [{"currency": "USD", "amount": 1200}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 500}]}
  ]
}');

-- 4. DECEMBER 2025: End of Year Core Savings
INSERT OR IGNORE INTO snapshots (id, month, data) VALUES (3, '2025-12', '{
  "rates": {"USD": 76.2, "EUR": 91.2, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 130000}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 180000}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Anorbank", "balances": [{"currency": "USD", "amount": 1500}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 800}]}
  ]
}');

-- 5. JANUARY 2026: Post-Holiday Stability
INSERT OR IGNORE INTO snapshots (id, month, data) VALUES (4, '2026-01', '{
  "rates": {"USD": 76.0, "EUR": 90.5, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 140000}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 190000}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Anorbank", "balances": [{"currency": "USD", "amount": 1500}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 800}]}
  ]
}');

-- 6. FEBRUARY 2026: Maximum Capital Before Big Purchase
INSERT OR IGNORE INTO snapshots (id, month, data) VALUES (5, '2026-02', '{
  "rates": {"USD": 77.9, "EUR": 90.7, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 210000}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 200000}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Anorbank", "balances": [{"currency": "USD", "amount": 1500}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1000}]}
  ]
}');

-- 7. MARCH 2026: The Gap 📉 (Car Purchase - Only T-Bank card goes to negative/low balance, others safe!)
INSERT OR IGNORE INTO snapshots (id, month, data) VALUES (6, '2026-03', '{
  "rates": {"USD": 76.8, "EUR": 89.5, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 10000, "comment": "Bought a used car! 🚗 Paid 200k from T-Bank card"}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 50000, "comment": "Withdrew 150k from savings account for the car 🚗"}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Anorbank", "balances": [{"currency": "USD", "amount": 1500}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1000}]}
  ]
}');

-- 8. APRIL 2026: Post-Purchase Slow Recovery
INSERT OR IGNORE INTO snapshots (id, month, data) VALUES (7, '2026-04', '{
  "rates": {"USD": 75.9, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 50000}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 60000}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Anorbank", "balances": [{"currency": "USD", "amount": 1700}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1000}]}
  ]
}');

-- 9. MAY 2026: The Spike 📈 (Annual Bonus Hits T-Bank Account!)
INSERT OR IGNORE INTO snapshots (id, month, data) VALUES (8, '2026-05', '{
  "rates": {"USD": 75.8, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 450000, "comment": "Annual performance bonus received! 💰 +400k RUB"}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 60000}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Anorbank", "balances": [{"currency": "USD", "amount": 1700}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1000}]}
  ]
}');

-- 10. JUNE 2026: Rebalancing (Moving bonus part to Alfabank savings and some to Anorbank USD)
INSERT OR IGNORE INTO snapshots (id, month, data) VALUES (9, '2026-06', '{
  "rates": {"USD": 75.9, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 150000, "comment": "Distributed bonus money to savings and USD"}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 310000}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Anorbank", "balances": [{"currency": "USD", "amount": 2500}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1200}]}
  ]
}');

-- 11. JULY 2026: Current State
INSERT OR IGNORE INTO snapshots (id, month, data) VALUES (10, '2026-07', '{
  "rates": {"USD": 77.9, "EUR": 88.6, "RUB": 1.0},
  "organizations": [
    {"id": "ad2c48a2-5cd4-4bf9-8712-087485a904d0", "name": "T-Bank", "balances": [{"currency": "RUB", "amount": 180000}]},
    {"id": "6b2a8ac4-1234-4567-abcd-ef1234567890", "name": "Alfabank", "balances": [{"currency": "RUB", "amount": 320000}]},
    {"id": "57485bac-03d3-4cf6-ad86-25ee319ba3c8", "name": "Anorbank", "balances": [{"currency": "USD", "amount": 2500}]},
    {"id": "31dea250-4c2a-4933-9c8d-59142687dc3e", "name": "Cash", "balances": [{"currency": "EUR", "amount": 1500}]}
  ]
}');

-- 12. Align the auto-increment counter
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('snapshots', 10);
