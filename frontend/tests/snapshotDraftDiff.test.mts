import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotDraftChangeCount, summarizeSnapshotDraftChanges } from '../src/lib/snapshotDraftDiff.ts';

const baseline = {
  currentMonth: '2026-07',
  data: {
    comment: 'Opening note',
    rates: { RUB: 1, USD: 80 },
    organizations: [{
      id: 'bank',
      name: 'Bank',
      country: 'RUS',
      comment: '',
      balances: [
        { currency: 'RUB', amount: 100, comment: 'Old balance note', tags: ['cash'] },
        { currency: 'USD', amount: 10, tags: ['reserve'] }
      ]
    }]
  }
};

test('summarizes draft changes by compact user-facing categories', () => {
  const summary = summarizeSnapshotDraftChanges(baseline, {
    currentMonth: '2026-08',
    data: {
      comment: 'Updated note',
      rates: { RUB: 1, USD: 90, EUR: 100 },
      organizations: [
        {
          id: 'bank',
          name: 'Main Bank',
          country: 'RUS',
          comment: '',
          balances: [
            { currency: 'RUB', amount: 150, comment: 'New balance note', tags: ['cash'] },
            { currency: 'USD', amount: 10, tags: ['reserve'] },
            { currency: 'EUR', amount: 5, tags: [] }
          ]
        },
        {
          id: 'broker',
          name: 'Broker',
          balances: [{ currency: 'USD', amount: 20, tags: ['stocks'] }]
        }
      ]
    }
  });

  assert.deepEqual(summary, {
    organizationsAdded: 1,
    organizationsRemoved: 0,
    organizationsUpdated: 1,
    balancesAdded: 1,
    balancesRemoved: 0,
    balancesUpdated: 1,
    ratesChanged: 2,
    notesChanged: 2,
    monthChanged: true
  });
  assert.equal(snapshotDraftChangeCount(summary), 9);
});

test('does not count nested balances when an entire organization is added or removed', () => {
  const summary = summarizeSnapshotDraftChanges(baseline, {
    currentMonth: baseline.currentMonth,
    data: {
      ...baseline.data,
      organizations: [{ id: 'broker', name: 'Broker', balances: [{ currency: 'USD', amount: 20 }] }]
    }
  });

  assert.equal(summary.organizationsAdded, 1);
  assert.equal(summary.organizationsRemoved, 1);
  assert.equal(summary.balancesAdded, 0);
  assert.equal(summary.balancesRemoved, 0);
});

test('treats numeric strings and reordered tags as unchanged values', () => {
  const summary = summarizeSnapshotDraftChanges(baseline, {
    currentMonth: baseline.currentMonth,
    data: {
      ...baseline.data,
      rates: { RUB: '1', USD: '80' },
      organizations: baseline.data.organizations.map(organization => ({
        ...organization,
        balances: organization.balances.map(balance => ({
          ...balance,
          amount: String(balance.amount),
          tags: [...(balance.tags || [])].reverse()
        }))
      }))
    }
  });

  assert.equal(snapshotDraftChangeCount(summary), 0);
});
