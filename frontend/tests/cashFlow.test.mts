import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFlowPeriodEntries, serializeFlowPeriodEntries } from '../src/lib/cashFlow.ts';
import type { FlowEntry } from '../src/types.ts';

const income: FlowEntry = {
  id: 1,
  month: '2026-08',
  entryType: 'external',
  direction: 'in',
  counterparty: 'Employer',
  account: 'Bank',
  tag: 'savings',
  currency: 'USD',
  amount: 1200.5,
  taxRate: 6,
  category: 'Salary',
  comment: 'August salary',
  toAccount: '',
  toTag: '',
  toCurrency: '',
  toAmount: 0
};

test('saving an edited period preserves income and both transfer tags in the request', () => {
  const { month: _month, ...entry } = income;
  const drafts = [
    { ...entry, clientID: 'entry-1', amount: '1300.75', taxRate: '6', toAmount: '' },
    {
      ...entry,
      clientID: 'entry-2',
      id: 2,
      entryType: 'transfer' as const,
      direction: 'out' as const,
      tag: 'cash',
      toAccount: 'Broker',
      toTag: 'stocks',
      toCurrency: 'EUR',
      amount: '200',
      toAmount: '180.25'
    }
  ];
  const payload = JSON.parse(JSON.stringify({ entries: serializeFlowPeriodEntries(drafts) }));

  assert.equal(payload.entries[0].id, 1);
  assert.equal(payload.entries[0].tag, 'savings');
  assert.equal(payload.entries[0].amount, 1300.75);
  assert.equal(payload.entries[0].taxRate, 6);
  assert.equal(payload.entries[0].toAmount, 0);
  assert.equal(payload.entries[0].comment, income.comment);
  assert.equal(payload.entries[1].tag, 'cash');
  assert.equal(payload.entries[1].toTag, 'stocks');
  assert.equal(payload.entries[1].toAmount, 180.25);
  assert.equal(payload.entries[1].taxRate, 0);
  assert.ok(payload.entries.every((entry: object) => !('clientID' in entry)));
  assert.equal(drafts[0].amount, '1300.75');
});

test('copying a period and saving it retains tags without reusing IDs or notes', () => {
  const outgoing = { ...income, id: 2, direction: 'out' as const, tag: 'living', taxRate: 0 };
  const copies = copyFlowPeriodEntries([
    income,
    outgoing,
    { ...income, id: 3, month: '2026-07', tag: 'older' },
    { ...income, id: 4, entryType: 'transfer', tag: 'cash', toTag: 'stocks' }
  ], '2026-08');
  const saved = serializeFlowPeriodEntries(copies.map((entry, index) => ({
    ...entry,
    clientID: `copy-${index}`,
    amount: String(entry.amount)
  })));

  assert.deepEqual(saved.map(entry => entry.tag), ['savings', 'living']);
  assert.ok(saved.every(entry => !('id' in entry) && !('month' in entry)));
  assert.ok(saved.every(entry => entry.comment === ''));
  assert.equal(saved[0].amount, income.amount);
  assert.equal(saved[0].taxRate, 6);
  assert.equal(saved[1].taxRate, 0);
  assert.equal(income.comment, 'August salary');
  assert.equal(income.tag, 'savings');
});

test('saving Auto tags sends empty values so explicit tags can be cleared', () => {
  const { month: _month, ...entry } = income;
  const [saved] = serializeFlowPeriodEntries([{
    ...entry,
    clientID: 'entry-1',
    tag: '',
    toTag: ''
  }]);

  assert.equal(saved.tag, '');
  assert.equal(saved.toTag, '');
});
