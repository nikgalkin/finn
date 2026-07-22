# Optional Cash Flow

Cash Flow is an additional, optional journal that complements Finn's monthly snapshots. You can use Finn's core net worth tracking without enabling it or entering any cash flow data.

Enable Cash Flow in **Settings** when you want to record incoming, outgoing, and internal transfer movements by month. Transfers remain visible in the journal but are excluded from income and spending. Assign an external movement to one of your own accounts when you want return estimates for a specific `deposit`, `stocks`, or other balance tag.

## CSV import format

Cash Flow accepts UTF-8 CSV files separated with semicolons (`;`). Decimal values may use either a dot or a comma. Each row represents one movement. The preview marks rows that already exist or repeat within the file; exact duplicates are skipped by default and can be explicitly included with the import checkbox.

```csv
month;entry_type;direction;counterparty;account;amount;currency;tax_rate;category;comment;to_account;to_amount;to_currency
2026-01;external;in;Acme;Broker;5000;USD;6;Salary;January salary;;;
2026-01;external;out;Landlord;Bank;85000;RUB;0;Rent;;;;
2026-01;transfer;;;Bank;116850.77;RUB;;;Exchange to USD;Broker;1500.258;USD
```

Every row requires `month`, `amount`, and `currency`. Months use `YYYY-MM`, and amounts must be positive. `entry_type` is optional and defaults to `external`.

## External movements

For an external movement:

* `direction` must be `in` or `out`.
* `counterparty` is required.
* `account` is optional and should match an organization name when the movement needs to participate in return estimates by balance tag.
* `tax_rate` is a percentage from `0` to `100` and applies only to incoming entries.
* `category` and `comment` are optional.

## Transfers

Set `entry_type` to `transfer`. The `account`, `amount`, and `currency` fields describe what was sent; `to_account`, `to_amount`, and `to_currency` describe what was received.

The source and destination must differ by account or currency. Leave `direction`, `counterparty`, `tax_rate`, and `category` empty; `comment` remains optional. Transfers stay in the journal but are excluded from income and spending.

[Back to the README](../README.md)
