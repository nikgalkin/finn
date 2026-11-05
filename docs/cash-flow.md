# Optional Cash Flow

Cash Flow is an additional, optional journal that complements Finn's monthly snapshots. You can use Finn's core net worth tracking without enabling it or entering any cash flow data.

Enable Cash Flow in **Settings** when you want to record incoming, outgoing, and internal transfer movements by month. Transfers remain visible in the journal but are excluded from income and spending. Assign an external movement to one of your own accounts when you want return estimates for a specific `deposit`, `stocks`, or other balance tag.

A movement can also carry a balance tag of its own. Leave it on **Auto** to derive the tag from the balances of the chosen account; pick a tag when that guess is wrong, when the account holds several tags at once, or when the money belongs to a tag you cannot express through an account. Movements that reach neither a tag nor a known account are reported as a separate reconciliation line in Portfolio Analytics rather than counted as somebody's earnings.

## Estimated earnings by tag

Set **Settings → Cash Flow → Snapshot timing** to match your month labels. The switch defaults to **Start of month**: a November snapshot uses October movements, suitable for balances recorded on November 1–3. **End of month** matches it with November movements. A previously saved choice is preserved. This setting affects only earnings and spending by balance tag in Graphs, across the tag history. It does not change journal entries, other charts, or snapshot editors. If snapshots skip a month, tag estimates include all movements between the two snapshots.

For capitalized interest, record contributions and withdrawals, including internal transfers, and let the change in the snapshot balance capture the interest. An incoming Cash Flow entry is treated as contributed money, even when its category describes interest; recording capitalized interest that way subtracts it from estimated earnings.

Open a tag in **Graphs**, then expand a month to see opening balances, incoming and outgoing movements, closing balances, and estimated earnings by bank and currency. Detail amounts use the original currency; foreign-currency results also show their value in the base currency at the closing exchange rate. Missing contributions or withdrawals remain part of estimated earnings.

Each tag row shows the total for the selected period, with the latest snapshot's estimated earnings and return relative to the preceding snapshot below it. These are the earnings and return in the first row of the monthly breakdown. For a range ending in November, the smaller figures show November's result against October's opening position. Hover them to see the snapshot month and Cash Flow period. The timing setting still determines which Cash Flow months enter each calculation. When only one interval is selected, the total and smaller figures coincide. A tag with no balance or movement in the latest interval shows zero for the amount and a dash for the percentage.

Adding or removing a neighboring tag preserves the actual balances and does not hide return percentages. If an account's tags are completely replaced, offsetting unexplained principal is shown separately as estimated reclassification; the affected interval's percentage is unavailable. An interval also has no percentage without a positive capital basis. For every tag, the period percentage links the intervals that can be calculated. If active intervals are omitted, the percentage is marked with **≈** and the tag details list those intervals. The earnings amount still includes the entire selected history. Empty intervals before a tag holds any capital do not count as omissions. Percentages assume movements happen halfway through the snapshot interval; they are not annualized.

## Non-yielding tags

Portfolio Analytics reads what a balance changed by beyond its recorded movements as estimated earnings. Tags such as `cash` or `checking` cannot earn anything, so for them the same difference means the opposite: money that was spent and never written down.

Mark those tags with **Doesn't yield** in **Settings → Balance Tags**. Analytics then lists them under *Estimated spending* instead of *Estimated capital earnings*, with no return percentage, and the top card shows how much of its number comes from them. If such a tag ends the period with a gain instead, it is labelled as income that never reached Cash Flow rather than negative spending.

The classification lives in Settings and nothing else stores it, so it always describes the tag as it is today and applies to the whole history at once. Ticking a tag reclassifies every month you have already saved, and unticking it puts them back. `untagged` money is never classified either way and stays in its own row.

Removing a tag from the list in Settings does not clear its classification: snapshots keep the tag string, so the flag has to outlive the tag it describes.

## CSV import format

Cash Flow accepts UTF-8 CSV files separated with semicolons (`;`). Decimal values may use either a dot or a comma. Each row represents one movement. The preview marks rows that already exist or repeat within the file; exact duplicates are skipped by default and can be explicitly included with the import checkbox.

```csv
month;entry_type;direction;counterparty;account;tag;amount;currency;tax_rate;category;comment;to_account;to_tag;to_amount;to_currency
2026-01;external;in;Acme;Broker;stocks;5000;USD;6;Salary;January salary;;;;
2026-01;external;out;Landlord;Bank;;85000;RUB;0;Rent;;;;;
2026-01;transfer;;;Bank;checking;116850.77;RUB;;;Exchange to USD;Broker;stocks;1500.258;USD
```

Every row requires `month`, `amount`, and `currency`. Months use `YYYY-MM`, and amounts must be positive. `entry_type` is optional and defaults to `external`.

## External movements

For an external movement:

* `direction` must be `in` or `out`.
* `counterparty` is required.
* `account` is optional and should match an organization name when the movement needs to participate in return estimates by balance tag.
* `tag` is optional and should match a balance tag. It overrides the tag derived from `account`, and works even when `account` is empty.
* `tax_rate` is a percentage from `0` to `100` and applies only to incoming entries.
* `category` and `comment` are optional.

## Transfers

Set `entry_type` to `transfer`. The `account`, `tag`, `amount`, and `currency` fields describe what was sent; `to_account`, `to_tag`, `to_amount`, and `to_currency` describe what was received. Both tags are optional and override the tags derived from their accounts.

The source and destination must differ by account or currency. Leave `direction`, `counterparty`, `tax_rate`, and `category` empty; `comment` remains optional. Transfers stay in the journal but are excluded from income and spending.

[Back to the README](../README.md)
