import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readSnapshotBalanceView,
  saveSnapshotBalanceView,
  sortSnapshotBalanceRows,
  type SnapshotBalanceViewStorage,
} from '../src/lib/snapshotBalanceView.ts';

const balances = [
  { currency: 'EUR', amount: 10, tags: ['stocks'] },
  { currency: 'RUB', amount: 20, tags: ['cash'] },
  { currency: 'USD', amount: 30, tags: ['stocks', 'deposit'] },
  { currency: 'USD', amount: 40, tags: [] },
  { currency: 'RUB', amount: 50, tags: ['stocks'] },
];

class MemoryStorage implements SnapshotBalanceViewStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }

  setItem(key: string, value: string) { this.values.set(key, value); }
}

test('orders complete tag sets by settings and keeps untagged balances last', () => {
  const rows = sortSnapshotBalanceRows(balances, 'tag-order', {
    baseCurrency: 'RUB',
    secondaryCurrency: 'USD',
    currencies: ['EUR', 'USD', 'RUB'],
    tags: ['cash', 'deposit', 'stocks'],
  });

  assert.deepEqual(rows.map(row => row.originalIndex), [1, 2, 4, 0, 3]);
});

test('sorts currencies without losing their source indexes', () => {
  const rows = sortSnapshotBalanceRows(balances, 'currency-order', {
    baseCurrency: 'RUB',
    secondaryCurrency: 'USD',
    currencies: ['EUR'],
  });

  assert.deepEqual(rows.map(row => row.originalIndex), [1, 4, 2, 3, 0]);
  assert.deepEqual(
    sortSnapshotBalanceRows(balances, 'original').map(row => row.originalIndex),
    [0, 1, 2, 3, 4],
  );
});

test('normalizes duplicate and differently cased tags while ordering', () => {
  const rows = sortSnapshotBalanceRows([
    { currency: 'RUB', amount: 1, tags: ['Stocks', 'deposit', 'stocks'] },
    { currency: 'USD', amount: 2, tags: ['DEPOSIT', 'STOCKS'] },
    { currency: 'EUR', amount: 3, tags: ['deposit'] },
  ], 'tag-order', { tags: ['deposit', 'stocks'] });

  assert.deepEqual(rows.map(row => row.originalIndex), [2, 0, 1]);
});

test('remembers the selected view and safely uses a supplied fallback', () => {
  const storage = new MemoryStorage();
  assert.equal(readSnapshotBalanceView(storage, 'currency-order'), 'currency-order');

  saveSnapshotBalanceView('original', storage);
  assert.equal(readSnapshotBalanceView(storage), 'original');

  storage.setItem('finn:snapshot-balance-view', 'unknown');
  assert.equal(readSnapshotBalanceView(storage), 'tag-order');
});
