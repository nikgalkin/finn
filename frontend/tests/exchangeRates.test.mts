import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchLatestCurrencyRates, getFetchedCurrencyRate } from '../src/lib/exchangeRates.ts';
import { calculateTotals, convertAmount, monthsBetween, normalizeRates, normalizeSnapshotRates } from '../src/lib/finance.ts';
import type { ParsedSnapshot } from '../src/types.ts';

const snapshot = (rates: Record<string, number | string>, balances: Array<{ amount: number; currency: string }>): ParsedSnapshot => ({
  id: 1,
  month: '2026-07',
  data: {
    rates,
    organizations: [{
      id: 'broker',
      name: 'Broker',
      balances: balances.map(balance => ({ currency: balance.currency, amount: balance.amount }))
    }]
  }
});

test('adds the base currency when the stored rates leave it implicit', () => {
  assert.deepEqual(normalizeRates({ USD: 90, EUR: 100 }, 'RUB'), { USD: 90, EUR: 100, RUB: 1 });
});

test('keeps already normalized rates untouched', () => {
  assert.deepEqual(normalizeRates({ USD: 1, EUR: 1.087, RUB: 0.011 }, 'USD'), { USD: 1, EUR: 1.087, RUB: 0.011 });
});

test('rescales rates quoted in another currency to the base currency', () => {
  const normalized = normalizeRates({ RUB: 1, USD: 90, EUR: 100 }, 'USD');

  assert.equal(normalized.USD, 1);
  assert.ok(Math.abs(normalized.EUR - 100 / 90) < 1e-12);
  assert.ok(Math.abs(normalized.RUB - 1 / 90) < 1e-12);
});

test('converts across currencies identically before and after rescaling', () => {
  const rates = { RUB: 1, USD: 90, EUR: 100 };

  assert.equal(
    convertAmount(1000, 'EUR', 'USD', normalizeRates(rates, 'USD')),
    convertAmount(1000, 'EUR', 'USD', rates)
  );
});

test('values balances in a base currency that the stored rates never quote', () => {
  const withoutBase = snapshot({ RUB: 0.011, EUR: 1.087 }, [
    { amount: 1000, currency: 'EUR' },
    { amount: 100000, currency: 'RUB' }
  ]);

  assert.equal(calculateTotals(withoutBase, 'USD').totalBase, 0);

  const normalized = normalizeSnapshotRates(withoutBase, 'USD');

  assert.equal(calculateTotals(normalized, 'USD').totalBase, 1000 * 1.087 + 100000 * 0.011);
});

test('reads a zero or negative base rate as an implicit one', () => {
  assert.deepEqual(normalizeRates({ USD: 0, EUR: 1.087 }, 'USD'), { USD: 1, EUR: 1.087 });
  assert.deepEqual(normalizeRates({ USD: -3, EUR: 1.087 }, 'USD'), { USD: 1, EUR: 1.087 });
});

test('parses numeric strings so a hand-edited rate still rescales', () => {
  assert.deepEqual(normalizeRates({ USD: '2', EUR: '3' }, 'USD'), { USD: 1, EUR: 1.5 });
});

test('leaves unquoted currencies at zero instead of inventing a rate', () => {
  assert.deepEqual(normalizeRates({ USD: 90, EUR: 100, GBP: 0 }, 'USD'), { USD: 1, EUR: 100 / 90, GBP: 0 });
});

test('fetches latest rates from the shared primary currency source', async () => {
  const requestedUrls: string[] = [];
  const rates = await fetchLatestCurrencyRates('RUB', async url => {
    requestedUrls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ rub: { usd: 0.0125, eur: 0.011 } })
    };
  });

  assert.deepEqual(rates, { usd: 0.0125, eur: 0.011 });
  assert.equal(requestedUrls.length, 1);
  assert.match(requestedUrls[0], /currencies\/rub\.json$/);
});

test('falls back to the secondary latest-rate source', async () => {
  let requestCount = 0;
  const rates = await fetchLatestCurrencyRates('USD', async () => {
    requestCount += 1;
    return requestCount === 1
      ? { ok: false, status: 503, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ usd: { rub: 80 } }) };
  });

  assert.equal(requestCount, 2);
  assert.equal(rates.rub, 80);
});

test('uses the USD quote as the latest USDT reference', () => {
  assert.equal(getFetchedCurrencyRate({ usd: 0.0125 }, 'USDT'), 0.0125);
  assert.equal(getFetchedCurrencyRate({ usd: 0 }, 'USDT'), null);
});

test('counts the calendar months a snapshot covers, including skipped ones', () => {
  assert.equal(monthsBetween('2026-01', '2026-02'), 1);
  assert.equal(monthsBetween('2026-01', '2026-06'), 5);
  assert.equal(monthsBetween('2025-11', '2026-02'), 3);
  assert.equal(monthsBetween('2026-02', '2026-01'), -1);
  assert.equal(monthsBetween('', '2026-01'), 0);
});
