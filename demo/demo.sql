-- Demo workspace: a cosy, entirely made-up set of accounts.
-- Six organizations, three currencies, and fourteen monthly snapshots backed by a Cash Flow journal.
-- The base currency is USD, so every rate is quoted as USD per one unit of the currency.
INSERT OR REPLACE INTO settings (key, value) VALUES ('master_data', '{"organizations":[{"name":"Honey Pot Bank","country":"RUS"},{"name":"Acorn Vault","country":"RUS"},{"name":"Lazy Otter Capital","country":"CYM"},{"name":"Sleepy Turtle Pension","country":"DEU"},{"name":"Pixel Fox Wallet","country":"EST"},{"name":"Cash","country":"RUS"}],"currencies":["USD","RUB","EUR"],"autoFetchCurrencies":["RUB","EUR"],"baseCurrency":"USD","secondaryCurrency":"RUB","tags":["deposit","cash","stocks","checking"],"nonYieldingTags":["checking","cash"],"cashFlow":{"enabled":true,"sources":["Pixel Forge Studio","Moonlight Gigs","Grumpy Landlord","Rust Bucket Motors","Gadget Nest","Wanderlust Tours"],"taxRates":{"Pixel Forge Studio":0,"Moonlight Gigs":6,"Grumpy Landlord":0,"Rust Bucket Motors":0,"Gadget Nest":0,"Wanderlust Tours":0},"categories":["salary","bonus","freelance","rent","car","electronics","travel"]}}');

-- What the numbers are built to show:
--   Honey Pot Bank  - everyday current account, reconciled by the journal; whatever it
--                     loses on top of the recorded movements is unjournalled spending.
--   Acorn Vault     - fixed deposit paying 12% per year as exactly +1.00% every month.
--   Lazy Otter      - index portfolio drifting up ~1% per month, topped up now and then.
--   Sleepy Turtle   - pension pot fed by a 250 USD -> EUR transfer every month, +0.35% on top.
--   Pixel Fox       - wallet where taxed side-gig money waits before it is swept into stocks.
--   Cash            - physical cash: it never yields, it only gets spent or topped up.

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (1, '2025-06', '{
  "comment": "Opening balance. Everything after this month is reconciled against the Cash Flow journal",
  "rates": {"USD": 1.0, "RUB": 0.013477088949, "EUR": 1.15363881},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 320000, "tags": ["checking"]}, {"currency": "USD", "amount": 2000, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1200000, "tags": ["deposit"], "comment": "Fixed deposit at 12% per year, credited as exactly 1% every month"}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 4000, "tags": ["stocks"], "comment": "Index portfolio drifting up about 1% per month"}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 6000, "tags": ["deposit"], "comment": "Pension pot: 250 USD goes in every month and it grows ~0.35% on top"}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 300, "tags": ["checking"], "comment": "Wallet for side-gig money before it is swept into stocks"}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"], "comment": "Physical cash. It never earns anything, it only gets spent or topped up"}]}
  ]
}', 180);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (2, '2025-07', '{
  "rates": {"USD": 1.0, "RUB": 0.013368983957, "EUR": 1.15508021},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 330200, "tags": ["checking"]}, {"currency": "USD", "amount": 3250, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1212000, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 4040, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 6237.44, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 300, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 95);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (3, '2025-08', '{
  "rates": {"USD": 1.0, "RUB": 0.013280212483, "EUR": 1.15670651},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 339700, "tags": ["checking"]}, {"currency": "USD", "amount": 1500, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1224120, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 7080.4, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 6475.4, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 300, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 110);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (4, '2025-09', '{
  "comment": "First side gig lands in the wallet: 800 USD gross, 6% withheld as tax",
  "rates": {"USD": 1.0, "RUB": 0.013351134846, "EUR": 1.15487316},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 353700, "tags": ["checking"]}, {"currency": "USD", "amount": 2750, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1236361.2, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 7151.2, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 6714.53, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 1052, "tags": ["checking"], "comment": "First gig paid out: 800 USD gross, 752 USD after tax"}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 85);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (5, '2025-10', '{
  "comment": "Spending spike: 180 000 RUB desk and laptop, covered by a bigger USD conversion",
  "rates": {"USD": 1.0, "RUB": 0.013227513228, "EUR": 1.15608466},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 331900, "tags": ["checking"], "comment": "Desk and laptop: -180 000 RUB"}, {"currency": "USD", "amount": 2000, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1248724.81, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 7222.71, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 6954.28, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 1052, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 205);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (6, '2025-11', '{
  "rates": {"USD": 1.0, "RUB": 0.01312335958, "EUR": 1.15748031},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 347400, "tags": ["checking"]}, {"currency": "USD", "amount": 250, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1261212.06, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 10294.94, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 7194.61, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 1052, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 120);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (7, '2025-12', '{
  "comment": "New Year bonus of 2 000 USD lands, and the holidays quietly eat 60 EUR of pocket cash",
  "rates": {"USD": 1.0, "RUB": 0.012987012987, "EUR": 1.16363636},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 360400, "tags": ["checking"]}, {"currency": "USD", "amount": 3500, "tags": ["checking"], "comment": "New Year bonus: +2 000 USD"}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1273824.18, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 10397.89, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 7434.63, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 1804, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 440, "tags": ["cash"]}]}
  ]
}', 165);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (8, '2026-01', '{
  "rates": {"USD": 1.0, "RUB": 0.013089005236, "EUR": 1.16361257},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 375900, "tags": ["checking"]}, {"currency": "USD", "amount": 4750, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1286562.42, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 10501.87, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 7675.5, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 1804, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 440, "tags": ["cash"]}]}
  ]
}', 90);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (9, '2026-02', '{
  "comment": "Cash top-up: 200 EUR pulled out of the current account and kept as physical cash",
  "rates": {"USD": 1.0, "RUB": 0.012936610608, "EUR": 1.15653299},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 372420, "tags": ["checking"]}, {"currency": "USD", "amount": 3000, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1299428.04, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 13606.89, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 7918.52, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 1804, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 620, "tags": ["cash"], "comment": "Topped up at the ATM: +200 EUR"}]}
  ]
}', 105);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (10, '2026-03', '{
  "comment": "Big one: 600 000 RUB car, funded by 7 500 USD converted and 4 000 USD sold out of the portfolio",
  "rates": {"USD": 1.0, "RUB": 0.01300390117, "EUR": 1.15344603},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 248520, "tags": ["checking"], "comment": "Second-hand car: -600 000 RUB"}, {"currency": "USD", "amount": 2250, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1312422.32, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 9742.96, "tags": ["stocks"], "comment": "Sold 4 000 USD of the portfolio to help pay for the car"}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 8162.97, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 2556, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 620, "tags": ["cash"]}]}
  ]
}', 230);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (11, '2026-04', '{
  "comment": "Side-gig savings swept out of the wallet into the index portfolio",
  "rates": {"USD": 1.0, "RUB": 0.013140604468, "EUR": 1.15505913},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 259020, "tags": ["checking"]}, {"currency": "USD", "amount": 3500, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1325546.54, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 11840.39, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 8407.98, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 556, "tags": ["checking"], "comment": "Swept 2 000 USD of gig money into the index portfolio"}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 580, "tags": ["cash"]}]}
  ]
}', 75);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (12, '2026-05', '{
  "comment": "Annual bonus of 5 000 USD, with 3 000 of it pushed straight into stocks",
  "rates": {"USD": 1.0, "RUB": 0.013020833333, "EUR": 1.15234375},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 275020, "tags": ["checking"]}, {"currency": "USD", "amount": 6750, "tags": ["checking"], "comment": "Annual performance bonus: +5 000 USD"}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1338802.01, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 14958.79, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 8654.36, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 556, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 580, "tags": ["cash"]}]}
  ]
}', 175);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (13, '2026-06', '{
  "comment": "Summer trip paid upfront: 120 000 RUB out the door",
  "rates": {"USD": 1.0, "RUB": 0.012919896641, "EUR": 1.15245478},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 284420, "tags": ["checking"], "comment": "Summer trip paid upfront: -120 000 RUB"}, {"currency": "USD", "amount": 6500, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1352190.03, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 15108.38, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 8901.58, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 1308, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 195);

INSERT OR REPLACE INTO snapshots (id, month, data, duration_seconds) VALUES (14, '2026-07', '{
  "comment": "Steady month: salary, rent, pension top-up, and the usual 1% on the vault",
  "rates": {"USD": 1.0, "RUB": 0.012804097311, "EUR": 1.15364917},
  "organizations": [
    {"id": "f0a1c2d3-1111-4aaa-8b01-6d5e4f3a2b10", "name": "Honey Pot Bank", "country": "RUS", "balances": [{"currency": "RUB", "amount": 300720, "tags": ["checking"]}, {"currency": "USD", "amount": 4750, "tags": ["checking"]}]},
    {"id": "c4d5e6f7-2222-4bbb-8c02-7e6f5a4b3c21", "name": "Acorn Vault", "country": "RUS", "balances": [{"currency": "RUB", "amount": 1365711.93, "tags": ["deposit"]}]},
    {"id": "9a8b7c6d-3333-4ccc-8d03-8f7a6b5c4d32", "name": "Lazy Otter Capital", "country": "CYM", "balances": [{"currency": "USD", "amount": 18259.46, "tags": ["stocks"]}]},
    {"id": "7c8d9e0f-5555-4eee-8f05-ab9c8d7e6f54", "name": "Sleepy Turtle Pension", "country": "DEU", "balances": [{"currency": "EUR", "amount": 9149.44, "tags": ["deposit"]}]},
    {"id": "5e6f7a8b-6666-4fff-8a06-bcad9e8f7a65", "name": "Pixel Fox Wallet", "country": "EST", "balances": [{"currency": "USD", "amount": 1308, "tags": ["checking"]}]},
    {"id": "2b3c4d5e-4444-4ddd-8e04-9a8b7c6d5e43", "name": "Cash", "country": "RUS", "balances": [{"currency": "EUR", "amount": 500, "tags": ["cash"]}]}
  ]
}', 100);

-- Salary, side gigs, rent, purchases, and internal transfers. Every movement carries its balance tag.

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (1, '2025-07', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (2, '2025-07', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 1500, 0, '', 'Converted USD to cover rent and living costs', 'Honey Pot Bank', 'checking', 'RUB', 112200),
  (3, '2025-07', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 216.44),
  (4, '2025-07', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (5, '2025-08', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (6, '2025-08', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 1500, 0, '', 'Converted USD to cover rent and living costs', 'Honey Pot Bank', 'checking', 'RUB', 112950),
  (7, '2025-08', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 216.13),
  (8, '2025-08', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0),
  (9, '2025-08', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, '', 'Savings pushed into the index portfolio', 'Lazy Otter Capital', 'stocks', 'USD', 3000);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (10, '2025-09', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (11, '2025-09', 'external', 'in', 'Moonlight Gigs', 'Pixel Fox Wallet', 'checking', 'USD', 800, 6, 'freelance', 'Weekend illustration gig, taxed at 6%', '', '', '', 0),
  (12, '2025-09', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 1500, 0, '', 'Converted USD to cover rent and living costs', 'Honey Pot Bank', 'checking', 'RUB', 112350),
  (13, '2025-09', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 216.47),
  (14, '2025-09', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (15, '2025-10', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (16, '2025-10', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 3500, 0, '', 'Converted USD to cover the month and the purchase', 'Honey Pot Bank', 'checking', 'RUB', 264600),
  (17, '2025-10', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 216.25),
  (18, '2025-10', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0),
  (19, '2025-10', 'external', 'out', 'Gadget Nest', 'Honey Pot Bank', 'checking', 'RUB', 180000, 0, 'electronics', 'Standing desk and a new laptop', '', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (20, '2025-11', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (21, '2025-11', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 1500, 0, '', 'Converted USD to cover rent and living costs', 'Honey Pot Bank', 'checking', 'RUB', 114300),
  (22, '2025-11', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 215.99),
  (23, '2025-11', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0),
  (24, '2025-11', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, '', 'Savings pushed into the index portfolio', 'Lazy Otter Capital', 'stocks', 'USD', 3000);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (25, '2025-12', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (26, '2025-12', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 2000, 0, 'bonus', 'New Year bonus', '', '', '', 0),
  (27, '2025-12', 'external', 'in', 'Moonlight Gigs', 'Pixel Fox Wallet', 'checking', 'USD', 800, 6, 'freelance', 'Weekend illustration gig, taxed at 6%', '', '', '', 0),
  (28, '2025-12', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 1500, 0, '', 'Converted USD to cover rent and living costs', 'Honey Pot Bank', 'checking', 'RUB', 115500),
  (29, '2025-12', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 214.84),
  (30, '2025-12', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (31, '2026-01', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (32, '2026-01', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 1500, 0, '', 'Converted USD to cover rent and living costs', 'Honey Pot Bank', 'checking', 'RUB', 114600),
  (33, '2026-01', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 214.85),
  (34, '2026-01', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (35, '2026-02', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (36, '2026-02', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 1500, 0, '', 'Converted USD to cover rent and living costs', 'Honey Pot Bank', 'checking', 'RUB', 115950),
  (37, '2026-02', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 216.16),
  (38, '2026-02', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0),
  (39, '2026-02', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'RUB', 17880, 0, '', 'Cash pulled out of the ATM', 'Cash', 'cash', 'EUR', 200),
  (40, '2026-02', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, '', 'Savings pushed into the index portfolio', 'Lazy Otter Capital', 'stocks', 'USD', 3000);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (41, '2026-03', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (42, '2026-03', 'external', 'in', 'Moonlight Gigs', 'Pixel Fox Wallet', 'checking', 'USD', 800, 6, 'freelance', 'Weekend illustration gig, taxed at 6%', '', '', '', 0),
  (43, '2026-03', 'transfer', 'out', '', 'Lazy Otter Capital', 'stocks', 'USD', 4000, 0, '', 'Sold part of the portfolio to help pay for the car', 'Honey Pot Bank', 'checking', 'USD', 4000),
  (44, '2026-03', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 7500, 0, '', 'Converted USD to cover the month and the purchase', 'Honey Pot Bank', 'checking', 'RUB', 576750),
  (45, '2026-03', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 216.74),
  (46, '2026-03', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0),
  (47, '2026-03', 'external', 'out', 'Rust Bucket Motors', 'Honey Pot Bank', 'checking', 'RUB', 600000, 0, 'car', 'A cheerfully rusty second-hand car', '', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (48, '2026-04', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (49, '2026-04', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 1500, 0, '', 'Converted USD to cover rent and living costs', 'Honey Pot Bank', 'checking', 'RUB', 114150),
  (50, '2026-04', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 216.44),
  (51, '2026-04', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0),
  (52, '2026-04', 'transfer', 'out', '', 'Pixel Fox Wallet', 'checking', 'USD', 2000, 0, '', 'Side-gig savings swept into stocks', 'Lazy Otter Capital', 'stocks', 'USD', 2000);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (53, '2026-05', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (54, '2026-05', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 5000, 0, 'bonus', 'Annual performance bonus', '', '', '', 0),
  (55, '2026-05', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 1500, 0, '', 'Converted USD to cover rent and living costs', 'Honey Pot Bank', 'checking', 'RUB', 115200),
  (56, '2026-05', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 216.95),
  (57, '2026-05', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0),
  (58, '2026-05', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, '', 'Savings pushed into the index portfolio', 'Lazy Otter Capital', 'stocks', 'USD', 3000);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (59, '2026-06', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (60, '2026-06', 'external', 'in', 'Moonlight Gigs', 'Pixel Fox Wallet', 'checking', 'USD', 800, 6, 'freelance', 'Weekend illustration gig, taxed at 6%', '', '', '', 0),
  (61, '2026-06', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, '', 'Converted USD to cover the month and the purchase', 'Honey Pot Bank', 'checking', 'RUB', 232200),
  (62, '2026-06', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 216.93),
  (63, '2026-06', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0),
  (64, '2026-06', 'external', 'out', 'Wanderlust Tours', 'Honey Pot Bank', 'checking', 'RUB', 120000, 0, 'travel', 'Summer trip paid upfront', '', '', '', 0);

INSERT OR REPLACE INTO flow_entries
  (id, month, entry_type, direction, counterparty, account, tag, currency, amount, tax_rate, category, comment, to_account, to_tag, to_currency, to_amount)
VALUES
  (65, '2026-07', 'external', 'in', 'Pixel Forge Studio', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, 'salary', 'Monthly salary in USD', '', '', '', 0),
  (66, '2026-07', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 1500, 0, '', 'Converted USD to cover rent and living costs', 'Honey Pot Bank', 'checking', 'RUB', 117150),
  (67, '2026-07', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 250, 0, '', 'Monthly top-up of the pension pot', 'Sleepy Turtle Pension', 'deposit', 'EUR', 216.7),
  (68, '2026-07', 'external', 'out', 'Grumpy Landlord', 'Honey Pot Bank', 'checking', 'RUB', 90000, 0, 'rent', 'Rent for the flat', '', '', '', 0),
  (69, '2026-07', 'transfer', 'out', '', 'Honey Pot Bank', 'checking', 'USD', 3000, 0, '', 'Savings pushed into the index portfolio', 'Lazy Otter Capital', 'stocks', 'USD', 3000);

-- Align auto-increment counters after inserting deterministic demo IDs.
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('snapshots', 14);
INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('flow_entries', 69);
