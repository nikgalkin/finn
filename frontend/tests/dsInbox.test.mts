import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UNKNOWN_MONTH,
  acceptableItemIds,
  committedDraft,
  draftFromItem,
  emptyFlowDraft,
  flowDraftIssues,
  groupDsInboxByMonth,
  isDraftAcceptable,
} from '../src/lib/dsInbox.ts';
import type { DsInboxItem, FlowEntryDraft } from '../src/types.ts';

const movement = (overrides: Partial<FlowEntryDraft> = {}): FlowEntryDraft => ({
  ...emptyFlowDraft('2026-08'),
  direction: 'out',
  counterparty: 'Shop',
  currency: 'RUB',
  amount: 3500,
  ...overrides,
});

const item = (overrides: Partial<DsInboxItem> = {}): DsInboxItem => ({
  id: 1,
  source: 'telegram',
  externalId: 'tg:1',
  kind: 'flow',
  status: 'pending',
  month: '2026-08',
  receivedAt: '2026-08-11T10:00:00Z',
  draft: movement(),
  ...overrides,
});

test('a complete movement has nothing to complain about', () => {
  assert.deepEqual(flowDraftIssues(movement()), {});
  assert.equal(isDraftAcceptable(movement()), true);
});

test('reports the field that is wrong rather than a single message', () => {
  const issues = flowDraftIssues(movement({ month: '2026-13', counterparty: '  ', amount: 0 }));
  assert.ok(issues.month);
  assert.ok(issues.counterparty);
  assert.ok(issues.amount);
  assert.equal(issues.currency, undefined);
});

test('a hidden outgoing tax still has to match the server before it is cleared', () => {
  assert.ok(flowDraftIssues(movement({ direction: 'in', taxRate: 130 })).taxRate);
  assert.ok(flowDraftIssues(movement({ direction: 'out', taxRate: 130 })).taxRate);
});

test('a transfer is judged on its two sides instead of a counterparty', () => {
  const transfer = movement({
    entryType: 'transfer',
    counterparty: '',
    account: 'Bank',
    toAccount: 'Broker',
    currency: 'RUB',
    toCurrency: 'USD',
    amount: 100000,
    toAmount: 1000,
  });
  assert.deepEqual(flowDraftIssues(transfer), {});

  const toItself = flowDraftIssues({ ...transfer, toAccount: 'Bank', toCurrency: 'RUB' });
  assert.ok(toItself.toAccount);
});

test('groups by month, newest first, with undated items last', () => {
  const groups = groupDsInboxByMonth([
    item({ id: 1, month: '2026-07' }),
    item({ id: 2, month: '' }),
    item({ id: 3, month: '2026-08' }),
    item({ id: 4, month: '2026-08' }),
  ]);

  assert.deepEqual(groups.map(group => group.month), ['2026-08', '2026-07', UNKNOWN_MONTH]);
  assert.deepEqual(groups[0].items.map(entry => entry.id), [3, 4]);
});

test('select all valid leaves out duplicates, balances and broken drafts', () => {
  const ids = acceptableItemIds([
    item({ id: 1 }),
    item({ id: 2, duplicate: true }),
    item({ id: 3, kind: 'balance' }),
    item({ id: 4, status: 'invalid' }),
    item({ id: 5, draft: movement({ amount: 0 }) }),
    item({ id: 6, kind: 'raw', draft: undefined }),
  ]);

  assert.deepEqual(ids, [1]);
});

test('half-typed amounts survive the editor and become numbers on save', () => {
  const typing = { ...movement(), amount: '3 500', taxRate: '', toAmount: '' };
  assert.deepEqual(flowDraftIssues(typing), {});

  const committed = committedDraft(typing);
  assert.equal(committed.amount, 3500);
  assert.equal(committed.taxRate, 0);
  assert.equal(committed.toAmount, 0);
});

test('an item without a draft still opens on a usable movement', () => {
  const draft = draftFromItem(item({ kind: 'raw', draft: undefined, month: '' }), '2026-08');
  assert.equal(draft.month, '2026-08');
  assert.equal(draft.entryType, 'external');
  assert.equal(draft.amount, 0);
});
