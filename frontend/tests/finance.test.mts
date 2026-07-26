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

const externalFlow = (amount: number, overrides: Partial<FlowEntry> = {}): FlowEntry => ({
  id: 1,
  month: '2026-02',
  entryType: 'external',
  direction: 'in',
  counterparty: 'Employer',
  account: 'Broker',
  tag: '',
  currency: 'RUB',
  amount,
  taxRate: 0,
  category: 'Income',
  comment: '',
  toAccount: '',
  toTag: '',
  toCurrency: '',
  toAmount: 0,
  ...overrides
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
  assert.equal(byTag.deposit.assignedFlow, 0);
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
  assert.equal(byTag.deposit.closingCapital, 110);
  assert.equal(byTag.stocks.assignedFlow, 90);
  assert.equal(byTag.stocks.closingCapital, 990);
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

test('sends a hand-tagged movement to its own tag instead of the account allocation', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 200, tags: ['deposit'] }, { amount: 900, tags: ['stocks'] }]),
    snapshot('2026-01', [{ amount: 100, tags: ['deposit'] }, { amount: 900, tags: ['stocks'] }]),
    [externalFlow(100, { tag: 'deposit' })],
    'RUB'
  );
  const byTag = Object.fromEntries(result.returns.map(item => [item.tag, item]));

  assert.equal(byTag.deposit.assignedFlow, 100);
  assert.equal(byTag.deposit.result, 0);
  assert.equal(byTag.stocks.assignedFlow, 0);
  assert.equal(byTag.stocks.result, 0);
  assert.equal(result.assignedExternalEntries, 1);
  assert.equal(result.proportionallyAllocatedEntries, 0);
  assert.equal(result.unattributedFlow, 0);
});

test('attributes a hand-tagged movement that names no account at all', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 200, tags: ['deposit'] }]),
    snapshot('2026-01', [{ amount: 100, tags: ['deposit'] }]),
    [externalFlow(100, { account: '', tag: 'deposit' })],
    'RUB'
  );

  assert.equal(result.returns[0].tag, 'deposit');
  assert.equal(result.returns[0].assignedFlow, 100);
  assert.equal(result.returns[0].result, 0);
  assert.equal(result.assignedExternalEntries, 1);
  assert.equal(result.unattributedFlow, 0);
});

test('reports a movement on an unknown account instead of inventing an untagged bucket', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 1100, tags: ['deposit'] }]),
    snapshot('2026-01', [{ amount: 100, tags: ['deposit'] }]),
    [externalFlow(1000, { account: 'Brokr' })],
    'RUB'
  );

  assert.equal(result.returns.length, 1);
  assert.equal(result.returns[0].tag, 'deposit');
  assert.equal(result.assignedExternalEntries, 0);
  assert.equal(result.totalExternalEntries, 1);
  assert.equal(result.unattributedFlow, 1000);
  assert.deepEqual(result.unknownAccounts, ['Brokr']);
});

test('reports a movement with neither account nor tag as unattributed', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 1100, tags: ['deposit'] }]),
    snapshot('2026-01', [{ amount: 100, tags: ['deposit'] }]),
    [externalFlow(1000, { account: '' })],
    'RUB'
  );

  assert.equal(result.assignedExternalEntries, 0);
  assert.equal(result.unattributedFlow, 1000);
  assert.deepEqual(result.unknownAccounts, []);
});

test('moves a transfer between the tags its two legs name', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 500, tags: ['deposit'] }, { amount: 500, tags: ['stocks'] }]),
    snapshot('2026-01', [{ amount: 1000, tags: ['deposit'] }, { amount: 0, tags: ['stocks'] }]),
    [externalFlow(500, {
      entryType: 'transfer', direction: 'out', counterparty: '', account: 'Broker', tag: 'deposit',
      toAccount: 'Broker', toTag: 'stocks', toCurrency: 'RUB', toAmount: 500
    })],
    'RUB'
  );
  const byTag = Object.fromEntries(result.returns.map(item => [item.tag, item]));

  assert.equal(byTag.deposit.assignedFlow, -500);
  assert.equal(byTag.deposit.result, 0);
  assert.equal(byTag.stocks.assignedFlow, 500);
  assert.equal(byTag.stocks.result, 0);
  assert.equal(result.unattributedFlow, 0);
});

test('reads the unexplained change on a non-yielding tag as spending without a return rate', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 700, tags: ['checking'] }, { amount: 1100, tags: ['stocks'] }]),
    snapshot('2026-01', [{ amount: 1000, tags: ['checking'] }, { amount: 1000, tags: ['stocks'] }]),
    [],
    'RUB',
    ['checking']
  );
  const byTag = Object.fromEntries(result.returns.map(item => [item.tag, item]));

  assert.equal(byTag.checking.kind, 'spending');
  assert.equal(byTag.checking.result, -300);
  assert.equal(byTag.checking.ratePercent, null);
  assert.equal(byTag.stocks.kind, 'yield');
  assert.equal(byTag.stocks.ratePercent, 10);
});

test('treats every tag as yielding until it is classified', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 1100, tags: ['checking'] }]),
    snapshot('2026-01', [{ amount: 1000, tags: ['checking'] }]),
    [],
    'RUB'
  );

  assert.equal(result.returns[0].kind, 'yield');
  assert.equal(result.returns[0].ratePercent, 10);
});

test('ignores whitespace when matching a tag against the classification', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 700, tags: [' checking '] }]),
    snapshot('2026-01', [{ amount: 1000, tags: [' checking '] }]),
    [],
    'RUB',
    ['checking']
  );

  assert.equal(result.returns[0].kind, 'spending');
});

test('never classifies untagged money, even when it is listed as non-yielding', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 700, tags: [] }]),
    snapshot('2026-01', [{ amount: 1000, tags: [] }]),
    [],
    'RUB',
    ['untagged']
  );

  assert.equal(result.returns[0].tag, 'untagged');
  assert.equal(result.returns[0].kind, 'unknown');
  assert.equal(result.returns[0].result, -300);
});
