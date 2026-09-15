import assert from 'node:assert/strict';
import test from 'node:test';
import { extractComments } from '../src/lib/finance.ts';

test('feed comments identify the original balance index even with repeated names and currencies', () => {
  const comments = extractComments({
    id: 1,
    month: '2026-08',
    data: {
      comment: 'Month note',
      rates: { USD: 90 },
      organizations: [
        {
          id: 'first', name: 'Bank', comment: 'Organization note',
          balances: [
            { currency: 'USD', amount: 100 },
            { currency: 'USD', amount: 200, tags: ['stocks'], comment: 'Balance note' },
            { currency: 'USD', amount: 300, tags: ['cash'], comment: 'Balance note' }
          ]
        },
        {
          id: 'second', name: 'Bank',
          balances: [{ currency: 'USD', amount: 200, comment: 'Balance note' }]
        }
      ]
    }
  });

  assert.deepEqual(comments.map(({ type, orgId, balanceIndex }) => ({ type, orgId, balanceIndex })), [
    { type: 'snapshot', orgId: undefined, balanceIndex: undefined },
    { type: 'org', orgId: 'first', balanceIndex: undefined },
    { type: 'balance', orgId: 'first', balanceIndex: 1 },
    { type: 'balance', orgId: 'first', balanceIndex: 2 },
    { type: 'balance', orgId: 'second', balanceIndex: 0 }
  ]);
  assert.deepEqual(comments[2].tags, ['stocks']);
});
