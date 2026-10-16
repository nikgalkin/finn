import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateNetWorthIncome } from '../src/lib/netWorthIncome.ts';
import { normalizeSnapshotRates } from '../src/lib/finance.ts';
import type { FlowEntry, ParsedSnapshot } from '../src/types.ts';

const month = (index: number) => `${2025 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
const snapshot = (date: string, amount: number, currency = 'RUB', rates: Record<string, number | string> = { RUB: 1, USD: 90 }, sourceRates: Record<string, number | string> = rates): ParsedSnapshot => ({
  id: Number(date.replace('-', '')),
  month: date,
  data: { rates, sourceRates, organizations: [{ id: 'bank', name: 'Bank', balances: [{ amount, currency }] }] }
});
const flow = (date: string, amount: number, extra: Partial<FlowEntry> = {}): FlowEntry => ({
  id: 1, month: date, entryType: 'external', direction: 'in', counterparty: '', account: '', tag: '',
  currency: 'RUB', amount, taxRate: 0, category: '', comment: '', toAccount: '', toTag: '',
  toCurrency: '', toAmount: 0, ...extra
});
const calculate = (snapshots: ParsedSnapshot[], entries: FlowEntry[], currency = 'RUB') =>
  calculateNetWorthIncome(snapshots, entries, currency, new Date(2026, 8, 25));

test('twelve months of income yield 24 monthly incomes', () => {
  const months = Array.from({ length: 12 }, (_, index) => month(index));
  const result = calculate(months.map(date => snapshot(date, 6_000_000)), months.map(date => flow(date, 250_000)));
  assert.equal(result.at(-1)?.averageIncome, 250_000);
  assert.equal(result.at(-1)?.multiple, 24);
  assert.equal(result.at(-1)?.windowStart, '2025-01');
  assert.equal(result.at(-1)?.shortHistory, false);
});

test('tax comes from each entry, while expenses and transfers do not change income', () => {
  const months = Array.from({ length: 12 }, (_, index) => month(index));
  const entries = months.flatMap(date => [
    flow(date, 200_000, { taxRate: 10 }),
    flow(date, 100_000, { direction: 'out' }),
    flow(date, 200_000, { entryType: 'transfer' })
  ]);
  const last = calculate(months.map(date => snapshot(date, 3_600_000)), entries).at(-1)!;
  assert.equal(last.averageIncome, 180_000);
  assert.equal(last.multiple, 20);
});

test('short history includes expense-only month but an empty month blocks the ratio', () => {
  const snapshots = [snapshot('2026-01', 900), snapshot('2026-02', 900), snapshot('2026-03', 900)];
  const entries = [flow('2026-01', 100), flow('2026-02', 1, { direction: 'out' }), flow('2026-03', 200)];
  const complete = calculate(snapshots, entries).at(-1)!;
  assert.equal(complete.averageIncome, 100);
  assert.equal(complete.multiple, 9);
  assert.equal(complete.windowMonths, 3);
  assert.equal(complete.shortHistory, true);
  const missing = calculate(snapshots, entries.filter(entry => entry.month !== '2026-02')).at(-1)!;
  assert.equal(missing.multiple, null);
  assert.deepEqual(missing.issues.filter(issue => issue.kind === 'missing_cash_flow').map(issue => issue.month), ['2026-02']);
});

test('zero recorded income is known, but division by zero is unavailable', () => {
  const months = Array.from({ length: 12 }, (_, index) => month(index));
  for (const entries of [
    months.map(date => flow(date, 1, { direction: 'out' })),
    months.map(date => flow(date, 100, { taxRate: 100 }))
  ]) {
    const last = calculate(months.map(date => snapshot(date, 900)), entries).at(-1)!;
    assert.equal(last.averageIncome, 0);
    assert.equal(last.multiple, null);
    assert.ok(last.issues.some(issue => issue.kind === 'zero_average'));
  }
});

test('calendar window keeps the last twelve months across a year and ignores future entries', () => {
  const months = Array.from({ length: 14 }, (_, index) => month(index));
  const snapshots = months.map(date => snapshot(date, 1200));
  const entries = months.map((date, index) => flow(date, index < 2 ? 1000 : 100));
  const result = calculate(snapshots, entries);
  assert.equal(result.at(-1)?.windowStart, '2025-03');
  assert.equal(result.at(-1)?.windowMonths, 12);
  assert.equal(result.at(-1)?.averageIncome, 100);
  assert.deepEqual(calculate(snapshots, [...entries, flow('2027-01', 999_999)]).map(point => point.multiple), result.map(point => point.multiple));
  assert.equal(result.find(point => point.month === '2026-01')?.windowStart, '2025-02');
});

test('old gaps stop affecting a point once outside the twelve-month window', () => {
  const months = Array.from({ length: 14 }, (_, index) => month(index));
  const result = calculate(months.map(date => snapshot(date, 1200)), months.filter((_, index) => index !== 1).map(date => flow(date, 100)));
  assert.equal(result[2].multiple, null);
  assert.equal(result.at(-1)?.multiple, 12);
});

test('income uses each month’s rates, including an income month without a snapshot', () => {
  const snapshots = [snapshot('2026-01', 0, 'RUB', { RUB: 1, USD: 90 }), snapshot('2026-02', 190_000, 'RUB', { RUB: 1, USD: 100 })];
  const entries = [flow('2026-01', 100, { currency: 'USD' }), flow('2026-02', 100, { currency: 'USD' })];
  assert.equal(calculate(snapshots, entries).at(-1)?.averageIncome, 9500);
  assert.equal(calculate(snapshots, entries).at(-1)?.multiple, 20);
  const baseOnly = calculate([snapshot('2026-01', 300), snapshot('2026-03', 900)], [flow('2026-01', 100), flow('2026-02', 100), flow('2026-03', 100)]);
  assert.equal(baseOnly[1].netWorth, null);
  assert.equal(baseOnly.at(-1)?.multiple, 9);
  const foreignWithoutSnapshot = calculate(
    [snapshot('2026-01', 300), snapshot('2026-03', 900)],
    [flow('2026-01', 100), flow('2026-02', 100, { currency: 'USD' }), flow('2026-03', 100)]
  );
  assert.equal(foreignWithoutSnapshot.at(-1)?.multiple, null);
  assert.ok(foreignWithoutSnapshot.at(-1)?.issues.some(issue => issue.kind === 'missing_income_snapshot' && issue.month === '2026-02'));
});

test('missing or invalid source rates block entire months and nonzero balances', () => {
  for (const rate of [undefined, 0, -1, 'bad', Infinity]) {
    const sourceRates = { RUB: 1, ...(rate === undefined ? {} : { USD: rate }) } as Record<string, number | string>;
    const snapshots = [snapshot('2026-01', 100, 'RUB', { RUB: 1, USD: 1 }, sourceRates), snapshot('2026-02', 900)];
    const result = calculate(snapshots, [flow('2026-01', 100, { currency: 'USD' }), flow('2026-01', 100), flow('2026-02', 100)]);
    assert.equal(result.at(-1)?.averageIncome, null);
    assert.equal(result.at(-1)?.multiple, null);
    assert.ok(result.at(-1)?.issues.some(issue => issue.kind === 'missing_income_rate' && issue.month === '2026-01'));
    const balance = calculate([snapshot('2026-01', 100, 'USD', { RUB: 1, USD: 1 }, sourceRates)], [flow('2026-01', 100)]);
    assert.equal(balance[0].netWorth, null);
  }
  const syntheticBase = snapshot('2026-01', 100, 'USD', { RUB: 1, USD: 1 }, { USD: 1 });
  assert.equal(calculate([syntheticBase], [flow('2026-01', 100)]).at(-1)?.multiple, null);
});

test('zero and negative net worth remain valid, and current month is provisional', () => {
  const result = calculate([snapshot('2026-08', 0), snapshot('2026-09', -100)], [flow('2026-08', 100), flow('2026-09', 100)]);
  assert.equal(result[0].multiple, 0);
  assert.equal(result[0].provisional, false);
  assert.equal(result[1].multiple, -1);
  assert.equal(result[1].provisional, true);
});

test('first expense-only month begins history; earlier snapshots have no income ratio', () => {
  const result = calculate(
    [snapshot('2025-12', 500), snapshot('2026-01', 500), snapshot('2026-02', 500)],
    [flow('2026-01', 10, { direction: 'out' }), flow('2026-02', 100)]
  );
  assert.equal(result[0].averageIncome, null);
  assert.ok(result[0].issues.some(issue => issue.kind === 'no_history'));
  assert.equal(result[1].averageIncome, 0);
  assert.equal(result[2].averageIncome, 50);
  assert.equal(result[2].windowStart, '2026-01');
});

test('income before the first snapshot does not block early snapshot points', () => {
  const snapshots = [snapshot('2023-09', 900), snapshot('2023-10', 1000)];
  const entries = [
    flow('2023-08', 100, { currency: 'USD' }), // No August snapshot or historical USD rate.
    flow('2023-09', 100),
    flow('2023-10', 100)
  ];
  const result = calculate(snapshots, entries);
  assert.equal(result[0].windowStart, '2023-09');
  assert.equal(result[0].windowMonths, 1);
  assert.equal(result[0].averageIncome, 100);
  assert.equal(result[0].multiple, 9);
  assert.equal(result[1].windowStart, '2023-09');
  assert.equal(result[1].windowMonths, 2);
  assert.equal(result[1].multiple, 10);
});

test('switching base currency recomputes both sides from the relevant months', () => {
  const snapshots = [
    snapshot('2026-01', 1000, 'RUB', { RUB: 1, USD: 100 }),
    snapshot('2026-02', 2000, 'RUB', { RUB: 1, USD: 200 })
  ];
  const entries = [flow('2026-01', 1000), flow('2026-02', 1000)];
  const rub = calculate(snapshots, entries).at(-1)!;
  const usdSnapshots = snapshots.map(item => snapshot(item.month, 2000, 'RUB',
    { RUB: item.month === '2026-01' ? 0.01 : 0.005, USD: 1 },
    { RUB: 1, USD: item.month === '2026-01' ? 100 : 200 }));
  const usd = calculate(usdSnapshots, entries, 'USD').at(-1)!;
  assert.equal(rub.multiple, 2);
  assert.equal(usd.averageIncome, 7.5);
  assert.equal(usd.multiple, 10 / 7.5);
});

test('cross conversion uses a stored reference currency', () => {
  const rates = { USD: 1, EUR: 1.2, RUB: 0.01 };
  const result = calculate(
    [snapshot('2026-01', 1200, 'RUB', { USD: 100, EUR: 120, RUB: 1 }, rates)],
    [flow('2026-01', 10, { currency: 'EUR' })]
  );
  assert.equal(result[0].averageIncome, 1200);
  assert.equal(result[0].multiple, 1);
});

test('implicit RUB reference converts balances and income before and after switching the display currency', () => {
  const raw = snapshot('2026-01', 10, 'USD', { USD: 90, EUR: 100 });
  const entries = [flow(raw.month, 1, { currency: 'USD' }), flow(raw.month, 90)];
  for (const currency of ['RUB', 'USD']) {
    const point = calculate([normalizeSnapshotRates(raw, currency)], entries, currency)[0];
    assert.equal(point.netWorth, currency === 'RUB' ? 900 : 10);
    assert.equal(point.averageIncome, currency === 'RUB' ? 180 : 2);
    assert.equal(point.multiple, 5);
    assert.deepEqual(point.issues, []);
  }
});

test('explicit invalid reference rates remain unavailable instead of becoming implicit rates', () => {
  for (const RUB of [0, -1, '', 'bad', Infinity]) {
    const item = snapshot('2026-01', 10, 'USD', { RUB: 1, USD: 90 }, { RUB, USD: 90 });
    const point = calculate([item], [flow(item.month, 100)])[0];
    assert.equal(point.netWorth, null);
    assert.equal(point.multiple, null);
    assert.ok(point.issues.some(issue => issue.kind === 'missing_net_worth_rate'));
  }
});

test('net worth sums valid balances once, ignores zero balances, and rejects partial totals', () => {
  const item = snapshot('2026-01', 10, 'USD');
  const balances = item.data.organizations[0].balances;
  balances.push({ amount: -100, currency: 'RUB' }, { amount: 0, currency: 'GBP' });
  const entries = [flow(item.month, 100)];
  assert.equal(calculate([item], entries)[0].multiple, 8);
  balances.push({ amount: 1, currency: 'GBP' });
  assert.equal(calculate([item], entries)[0].netWorth, null);
});

test('a point retains multiple independent reasons for being unavailable', () => {
  const result = calculate([
    snapshot('2026-01', 100),
    snapshot('2026-03', 100, 'USD', { RUB: 1, USD: 0 })
  ], [flow('2026-01', 100), flow('2026-03', 100, { currency: 'USD' })]);
  const last = result.at(-1)!;
  assert.equal(last.multiple, null);
  assert.deepEqual(new Set(last.issues.map(issue => issue.kind)), new Set([
    'missing_net_worth_rate', 'missing_cash_flow', 'missing_income_rate'
  ]));
});

test('range selection changes only visible points, never their computed windows', () => {
  const months = Array.from({ length: 13 }, (_, index) => month(index));
  const all = calculate(months.map(date => snapshot(date, 1200)), months.map(date => flow(date, 100)));
  const visible = all.filter(point => point.month >= '2025-08');
  assert.equal(visible.at(-1)?.windowStart, '2025-02');
  assert.equal(visible.at(-1)?.multiple, all.at(-1)?.multiple);
});
