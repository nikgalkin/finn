import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSnapshotAmounts } from '../src/lib/snapshotAmounts.ts';
import type { OrganizationDraft } from '../src/types.ts';

const organization = (amounts: Array<number | string>, name = 'Broker'): OrganizationDraft => ({
  id: name.toLowerCase(),
  name,
  balances: amounts.map(amount => ({ currency: 'RUB', amount, tags: [] }))
});

test('calculates expressions still sitting in the field when the snapshot is saved', () => {
  const { organizations, uncalculatedAmounts } = normalizeSnapshotAmounts([organization(['1200 + 350', '1,5k * 2'])]);

  assert.deepEqual(organizations[0].balances.map(balance => balance.amount), [1550, 3000]);
  assert.deepEqual(uncalculatedAmounts, []);
});

test('keeps committed numbers untouched and reads a cleared field as zero', () => {
  const { organizations, uncalculatedAmounts } = normalizeSnapshotAmounts([organization([1550, '', '   '])]);

  assert.deepEqual(organizations[0].balances.map(balance => balance.amount), [1550, 0, 0]);
  assert.deepEqual(uncalculatedAmounts, []);
});

test('reports amounts that cannot be calculated instead of letting them become zero', () => {
  const { organizations, uncalculatedAmounts } = normalizeSnapshotAmounts([
    organization(['1200 +', 'about 300'], 'Bank'),
    organization([500])
  ]);

  assert.deepEqual(uncalculatedAmounts, [
    { organization: 'Bank', currency: 'RUB', value: '1200 +' },
    { organization: 'Bank', currency: 'RUB', value: 'about 300' }
  ]);
  assert.deepEqual(organizations[1].balances.map(balance => balance.amount), [500]);
});

test('preserves the rest of the balance while normalizing its amount', () => {
  const { organizations } = normalizeSnapshotAmounts([{
    id: 'broker',
    name: 'Broker',
    country: 'RUS',
    balances: [{ currency: 'USD', amount: '10k', comment: 'brokerage', tags: ['invest'] }]
  }]);

  assert.deepEqual(organizations[0], {
    id: 'broker',
    name: 'Broker',
    country: 'RUS',
    balances: [{ currency: 'USD', amount: 10_000, comment: 'brokerage', tags: ['invest'] }]
  });
});
