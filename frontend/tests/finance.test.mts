import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTaggedCapitalReturns, summarizeTaggedCapitalReturns } from '../src/lib/finance.ts';
import { flowsBetweenSnapshots } from '../src/lib/cashFlow.ts';
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
  const byTag = Object.fromEntries(result.returns.map(item => [item.tag, item]));
  assert.equal(byTag.deposit.openingCapital, 100);
  assert.equal(byTag.deposit.closingCapital, 0);
  assert.equal(byTag.deposit.classificationChange, -100);
  assert.equal(byTag.stocks.openingCapital, 0);
  assert.equal(byTag.stocks.closingCapital, 100);
  assert.equal(byTag.stocks.classificationChange, 100);
  assert.equal(byTag.stocks.ratePercent, null);
});

test('does not invent deposit earnings when salary arrives in a newly added checking balance', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 1000000, tags: ['deposit'] }, { amount: 100000, tags: ['checking'] }]),
    snapshot('2026-01', [{ amount: 1000000, tags: ['deposit'] }]),
    [externalFlow(100000, { tag: 'checking' })],
    'RUB', ['checking']
  );
  const byTag = Object.fromEntries(result.returns.map(item => [item.tag, item]));
  assert.equal(byTag.deposit.openingCapital, 1000000);
  assert.equal(byTag.deposit.closingCapital, 1000000);
  assert.equal(byTag.deposit.result, 0);
  assert.equal(byTag.deposit.ratePercent, 0);
  assert.equal(byTag.checking.openingCapital, 0);
  assert.equal(byTag.checking.closingCapital, 100000);
  assert.equal(byTag.checking.assignedFlow, 100000);
  assert.equal(byTag.checking.result, 0);
});

test('retains capitalized interest alongside a new checking balance', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 1010000, tags: ['deposit'] }, { amount: 100000, tags: ['checking'] }]),
    snapshot('2026-01', [{ amount: 1000000, tags: ['deposit'] }]),
    [externalFlow(100000, { tag: 'checking' })],
    'RUB'
  );
  const deposit = result.returns.find(item => item.tag === 'deposit')!;
  assert.equal(deposit.result, 10000);
  assert.equal(deposit.ratePercent, 1);
  assert.ok(Math.abs(summarizeTaggedCapitalReturns([{ ...deposit, month: '2026-02' }])[0].ratePercent! - 1) < 1e-10);
  assert.equal(result.returns.find(item => item.tag === 'checking')!.result, 0);
});

test('preserves native currency details and separates withdrawals from capitalized interest', () => {
  const previous = snapshot('2026-01', [{ amount: 10000, currency: 'USD', tags: ['deposit'] }]);
  const current = snapshot('2026-02', [{ amount: 9100, currency: 'USD', tags: ['deposit'] }]);
  previous.data.rates.USD = 80;
  current.data.rates.USD = 90;
  const result = calculateTaggedCapitalReturns(current, previous,
    [externalFlow(1000, { direction: 'out', currency: 'USD', tag: 'deposit' })], 'RUB');
  const deposit = result.returns[0];
  assert.equal(deposit.result, 9000);
  assert.equal(deposit.openingCapital, 900000);
  assert.equal(deposit.closingCapital, 819000);
  assert.deepEqual(deposit.details, [{
    account: 'Broker', currency: 'USD', openingBalance: 10000, closingBalance: 9100,
    inflow: 0, outflow: 1000, classificationChange: 0, result: 100, resultBase: 9000,
    proportional: false, tagsChanged: false
  }]);
});

test('does not mistake fully recorded movements for reclassification when all tags change', () => {
  const result = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 100, tags: ['stocks'] }]),
    snapshot('2026-01', [{ amount: 100, tags: ['deposit'] }]),
    [externalFlow(100, { direction: 'out', tag: 'deposit' }), externalFlow(100, { tag: 'stocks' })],
    'RUB'
  );
  result.returns.forEach(item => {
    assert.equal(item.result, 0);
    assert.equal(item.classificationChange, 0);
    assert.equal(item.ratePercent, 0);
  });
});

test('shows return over the calculable intervals and reports omitted active months for any tag', () => {
  const unrated = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 100, tags: ['deposit'] }]),
    snapshot('2026-01', [{ amount: 0, tags: ['deposit'] }]), [], 'RUB'
  ).returns[0];
  const rated = calculateTaggedCapitalReturns(
    snapshot('2026-03', [{ amount: 110, tags: ['deposit'] }]),
    snapshot('2026-02', [{ amount: 100, tags: ['deposit'] }]), [], 'RUB'
  ).returns[0];
  const summary = summarizeTaggedCapitalReturns([{ ...unrated, month: '2026-02' }, { ...rated, month: '2026-03' }])[0];
  assert.equal(summary.result, 110);
  assert.ok(Math.abs(summary.ratePercent! - 10) < 1e-10);
  assert.deepEqual(summary.returnCoverage, { rated: 1, total: 2, excludedMonths: ['2026-02'] });
});

test('empty months before a tag has any capital do not block its later return', () => {
  const empty = calculateTaggedCapitalReturns(snapshot('2026-02', [{ amount: 0, tags: ['deposit'] }]),
    snapshot('2026-01', [{ amount: 0, tags: ['deposit'] }]), [], 'RUB').returns[0];
  const funded = calculateTaggedCapitalReturns(snapshot('2026-03', [{ amount: 100, tags: ['deposit'] }]),
    snapshot('2026-02', [{ amount: 0, tags: ['deposit'] }]), [externalFlow(100, { tag: 'deposit' })], 'RUB').returns[0];
  const summary = summarizeTaggedCapitalReturns([{ ...empty, month: '2026-02' }, { ...funded, month: '2026-03' }])[0];
  assert.equal(summary.ratePercent, 0);
  assert.deepEqual(summary.returnCoverage, { rated: 1, total: 1, excludedMonths: [] });
});

test('links available returns across an unrated interval and exposes the gap', () => {
  const rated = calculateTaggedCapitalReturns(
    snapshot('2026-02', [{ amount: 110, tags: ['stocks'] }]),
    snapshot('2026-01', [{ amount: 100, tags: ['stocks'] }]), [], 'RUB'
  ).returns[0];
  const unrated = calculateTaggedCapitalReturns(
    snapshot('2026-03', [{ amount: 100, tags: ['stocks'] }]),
    snapshot('2026-02', [{ amount: 0, tags: ['stocks'] }]), [], 'RUB'
  ).returns[0];
  const summary = summarizeTaggedCapitalReturns([
    { ...rated, month: '2026-02' }, { ...unrated, month: '2026-03' }, { ...rated, month: '2026-04' }
  ])[0];
  assert.ok(Math.abs(summary.ratePercent! - 21) < 1e-10);
  assert.equal(summary.result, 120);
  assert.deepEqual(summary.returnCoverage, { rated: 2, total: 3, excludedMonths: ['2026-03'] });
});

test('incoming tax and outgoing movements are netted against the tagged balance exactly once', () => {
  const result = calculateTaggedCapitalReturns(snapshot('2026-02', [{ amount: 1140, tags: ['deposit'] }]),
    snapshot('2026-01', [{ amount: 1000, tags: ['deposit'] }]), [
      externalFlow(200, { tag: 'deposit', taxRate: 10 }),
      externalFlow(50, { tag: 'deposit', direction: 'out' })
    ], 'RUB').returns[0];
  assert.equal(result.assignedFlow, 130);
  assert.equal(result.details[0].inflow, 180);
  assert.equal(result.details[0].outflow, 50);
  assert.equal(result.result, 10);
});

test('counts proportional attribution on transfers and keeps both bank legs in their own currencies', () => {
  const previous = snapshot('2026-01', [{ amount: 100, tags: ['deposit'] }, { amount: 900, tags: ['stocks'] }]);
  const current = snapshot('2026-02', [{ amount: 90, tags: ['deposit'] }, { amount: 810, tags: ['stocks'] }]);
  current.data.organizations.push({ id: 'other', name: 'Other bank', balances: [{ currency: 'USD', amount: 10, tags: ['checking'] }] });
  current.data.rates.USD = 10;
  const result = calculateTaggedCapitalReturns(current, previous, [externalFlow(100, {
    entryType: 'transfer', toAccount: 'Other bank', toTag: 'checking', toCurrency: 'USD', toAmount: 10
  })], 'RUB');
  assert.equal(result.proportionallyAllocatedEntries, 1);
  result.returns.forEach(item => assert.equal(item.result, 0));
  assert.equal(result.returns.find(item => item.tag === 'checking')!.details[0].inflow, 10);
});

test('a prior-month transfer is a contribution in start-of-month snapshots, not Anorbank earnings', () => {
  const previous = snapshot('2026-10', [{ currency: 'UZS', amount: 100000000, tags: ['deposit'] }]);
  const current = snapshot('2026-11', [{ currency: 'UZS', amount: 26500000, tags: ['deposit'] }]);
  previous.data.organizations.push({ id: 'anor', name: 'Anorbank', balances: [{ currency: 'UZS', amount: 100000000, tags: ['deposit'] }] });
  current.data.organizations.push({ id: 'anor', name: 'Anorbank', balances: [{ currency: 'UZS', amount: 176000000, tags: ['deposit'] }] });
  previous.data.rates.UZS = current.data.rates.UZS = 0.007;
  const journal = [externalFlow(75000000, { month: '2026-10', entryType: 'transfer', currency: 'UZS', tag: 'deposit',
    toAccount: 'Anorbank', toTag: 'deposit', toCurrency: 'UZS', toAmount: 75000000 })];
  const result = calculateTaggedCapitalReturns(current, previous,
    flowsBetweenSnapshots(journal, previous.month, current.month, 'start'), 'RUB').returns[0];
  assert.equal(result.details.find(detail => detail.account === 'Anorbank')!.result, 1000000);
  assert.equal(result.assignedFlow, 0);
  assert.equal(result.result, 17500);
});

test('keeps separate bank contributions and reconciles every detail to the tag total', () => {
  const previous = snapshot('2026-01', [{ amount: 1000, tags: ['deposit'] }]);
  const current = snapshot('2026-02', [{ amount: 910, tags: ['deposit'] }]);
  previous.data.organizations.push({ id: 'second', name: 'Other bank', balances: [{ currency: 'RUB', amount: 2000, tags: ['deposit'] }] });
  current.data.organizations.push({ id: 'second', name: 'Other bank', balances: [{ currency: 'RUB', amount: 2220, tags: ['deposit'] }] });
  const result = calculateTaggedCapitalReturns(current, previous, [
    externalFlow(100, { direction: 'out', tag: 'deposit' }),
    externalFlow(200, { account: 'Other bank', tag: 'deposit' })
  ], 'RUB');
  const deposit = result.returns[0];
  assert.equal(deposit.result, 30);
  assert.equal(deposit.details.find(item => item.account === 'Broker')!.result, 10);
  assert.equal(deposit.details.find(item => item.account === 'Other bank')!.result, 20);
  assert.equal(deposit.details.reduce((sum, item) => sum + item.resultBase, 0), deposit.result);
  for (const item of deposit.details) {
    assert.equal(item.openingBalance + item.inflow - item.outflow + item.classificationChange + item.result, item.closingBalance);
  }
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
