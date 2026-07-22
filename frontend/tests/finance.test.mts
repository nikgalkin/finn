import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTaggedCapitalReturns } from '../src/lib/finance.ts';
import type { FlowEntry, ParsedSnapshot } from '../src/types.ts';

const snapshot = (month: string, balances: Array<{ amount: number; currency?: string; tags?: string[] }>): ParsedSnapshot => ({
  id: Number(month.replace('-', '')),
  month,
  data: {
    rates: { RUB: 1, USD: 1 },
    organizations: [{
      id: 'broker',
      name: 'Broker',
      balances: balances.map(balance => ({ currency: balance.currency || 'RUB', amount: balance.amount, tags: balance.tags }))
    }]
  }
});

const externalFlow = (amount: number): FlowEntry => ({
  id: 1,
  month: '2026-02',
  entryType: 'external',
  direction: 'in',
  counterparty: 'Employer',
  account: 'Broker',
  currency: 'RUB',
  amount,
  taxRate: 0,
  category: 'Income',
  comment: '',
  toAccount: '',
  toCurrency: '',
  toAmount: 0
});

test('uses actual tagged balance amounts when one account has multiple balances in the same currency', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 110, tags: ['deposit'] }, { amount: 990, tags: ['stocks'] }]),
    snapshot('2026-01', [{ amount: 100, tags: ['deposit'] }, { amount: 900, tags: ['stocks'] }]),
    [],
    'RUB'
  );
  const byTag = Object.fromEntries(result.returns.map(item => [item.tag, item]));

  assert.equal(byTag.deposit.result, 10);
  assert.equal(byTag.deposit.openingCapital, 100);
  assert.equal(byTag.deposit.closingCapital, 110);
  assert.equal(byTag.stocks.result, 90);
  assert.equal(byTag.stocks.openingCapital, 900);
  assert.equal(byTag.stocks.closingCapital, 990);
  assert.equal(byTag.deposit.ratePercent, 10);
  assert.equal(byTag.stocks.ratePercent, 10);
});

test('allocates account-level flows proportionally across its tagged balances', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 110, tags: ['deposit'] }, { amount: 990, tags: ['stocks'] }]),
    snapshot('2026-01', [{ amount: 100, tags: ['deposit'] }, { amount: 900, tags: ['stocks'] }]),
    [externalFlow(100)],
    'RUB'
  );
  const byTag = Object.fromEntries(result.returns.map(item => [item.tag, item]));

  assert.equal(byTag.deposit.assignedFlow, 10);
  assert.equal(byTag.stocks.assignedFlow, 90);
  assert.equal(byTag.deposit.result, 0);
  assert.equal(byTag.stocks.result, 0);
  assert.equal(result.proportionallyAllocatedEntries, 1);
});

test('does not mix tags from other currencies in the same account', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 110, currency: 'RUB', tags: ['deposit'] }, { amount: 110, currency: 'USD', tags: ['stocks'] }]),
    snapshot('2026-01', [{ amount: 100, currency: 'RUB', tags: ['deposit'] }, { amount: 100, currency: 'USD', tags: ['stocks'] }]),
    [externalFlow(10)],
    'RUB'
  );
  const byTag = Object.fromEntries(result.returns.map(item => [item.tag, item]));

  assert.equal(byTag.deposit.result, 0);
  assert.equal(byTag.stocks.result, 10);
  assert.equal(result.proportionallyAllocatedEntries, 0);
});

test('does not turn a tag edit into artificial earnings', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 100, tags: ['stocks'] }]),
    snapshot('2026-01', [{ amount: 100, tags: ['deposit'] }]),
    [],
    'RUB'
  );

  assert.equal(result.returns.reduce((sum, item) => sum + item.result, 0), 0);
  result.returns.forEach(item => assert.equal(item.result, 0));
});

test('treats empty tag values as untagged and preserves reconciliation', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 150, tags: [''] }]),
    snapshot('2026-01', [{ amount: 100, tags: [] }]),
    [],
    'RUB'
  );

  assert.equal(result.returns.length, 1);
  assert.equal(result.returns[0].tag, 'untagged');
  assert.equal(result.returns[0].result, 50);
});
