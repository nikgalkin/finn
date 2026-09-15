// The extension is explicit because this module is imported by a node --test
// file, which resolves paths literally rather than the way the bundler does.
import { parseNumberExpression } from './numberExpression.ts';
import type { DsInboxItem, FlowEntryDraft } from '../types';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const UNKNOWN_MONTH = 'unknown';

export type FlowDraftIssues = Partial<Record<keyof FlowEntryDraft, string>>;

/**
 * What the row editor holds while it is being typed in. AmountInput reports the
 * raw text until the field is left, so the numeric fields have to tolerate a
 * half-written expression; they become numbers again on save.
 */
export type EditableFlowDraft = Omit<FlowEntryDraft, 'amount' | 'taxRate' | 'toAmount'> & {
  amount: number | string;
  taxRate: number | string;
  toAmount: number | string;
};

/**
 * Reads the numeric fields the same way the amount field itself would, so
 * "3 500" or "1k + 200" mean on save exactly what they showed while typing.
 */
const committedNumber = (value: number | string) => parseNumberExpression(value) ?? 0;

export const committedDraft = (draft: EditableFlowDraft): FlowEntryDraft => ({
  ...draft,
  amount: committedNumber(draft.amount),
  taxRate: committedNumber(draft.taxRate),
  toAmount: committedNumber(draft.toAmount)
});

export const emptyFlowDraft = (month = ''): FlowEntryDraft => ({
  month,
  entryType: 'external',
  direction: 'out',
  counterparty: '',
  account: '',
  tag: '',
  currency: '',
  amount: 0,
  taxRate: 0,
  category: '',
  comment: '',
  toAccount: '',
  toTag: '',
  toCurrency: '',
  toAmount: 0
});

export const draftFromItem = (item: DsInboxItem, fallbackMonth = ''): FlowEntryDraft => ({
  ...emptyFlowDraft(item.month || fallbackMonth),
  ...(item.draft || {})
});

/**
 * The same rules the server applies, repeated here only to highlight the field
 * that is wrong while it is being typed. The server stays the authority: it
 * revalidates every draft on save and again on accept.
 */
export const flowDraftIssues = (editable: EditableFlowDraft): FlowDraftIssues => {
  const draft = committedDraft(editable);
  const issues: FlowDraftIssues = {};
  const positive = (amount: number) => Number.isFinite(amount) && amount > 0;

  if (!MONTH_PATTERN.test((draft.month || '').trim())) {
    issues.month = 'Use the YYYY-MM format';
  }

  if (draft.entryType === 'transfer') {
    if (!draft.account.trim()) issues.account = 'A source account is required';
    if (!draft.toAccount.trim()) issues.toAccount = 'A destination account is required';
    if (!draft.currency.trim()) issues.currency = 'A currency is required';
    if (!draft.toCurrency.trim()) issues.toCurrency = 'A currency is required';
    if (!positive(draft.amount)) issues.amount = 'The amount must be greater than zero';
    if (!positive(draft.toAmount)) issues.toAmount = 'The amount must be greater than zero';
    if (
      draft.account.trim() && draft.account.trim() === draft.toAccount.trim()
      && draft.currency.trim().toUpperCase() === draft.toCurrency.trim().toUpperCase()
    ) {
      issues.toAccount = 'The source and destination must differ';
    }
    return issues;
  }

  if (draft.direction !== 'in' && draft.direction !== 'out') {
    issues.direction = 'Pick incoming or outgoing';
  }
  if (!draft.counterparty.trim()) issues.counterparty = 'A counterparty is required';
  if (!draft.currency.trim()) issues.currency = 'A currency is required';
  if (!positive(draft.amount)) issues.amount = 'The amount must be greater than zero';
  // The server validates the range before it clears tax for an outgoing
  // movement. Keep the editor in lock-step so it never calls a hidden invalid
  // tax value acceptable.
  if (!Number.isFinite(draft.taxRate) || draft.taxRate < 0 || draft.taxRate > 100) {
    issues.taxRate = 'The tax rate is a percentage between 0 and 100';
  }
  return issues;
};

export const isDraftAcceptable = (draft: EditableFlowDraft) => Object.keys(flowDraftIssues(draft)).length === 0;

export type DsInboxMonthGroup = {
  month: string;
  items: DsInboxItem[];
};

/**
 * Groups the queue the way Cash Flow is read: newest month first, with whatever
 * carries no month at all left until the end for someone to date by hand.
 */
export const groupDsInboxByMonth = (items: DsInboxItem[]): DsInboxMonthGroup[] => {
  const groups = new Map<string, DsInboxItem[]>();
  items.forEach(item => {
    const month = item.month && MONTH_PATTERN.test(item.month) ? item.month : UNKNOWN_MONTH;
    const group = groups.get(month);
    if (group) {
      group.push(item);
    } else {
      groups.set(month, [item]);
    }
  });

  return Array.from(groups.entries())
    .map(([month, groupItems]) => ({ month, items: groupItems }))
    .sort((left, right) => {
      if (left.month === UNKNOWN_MONTH) return 1;
      if (right.month === UNKNOWN_MONTH) return -1;
      return right.month.localeCompare(left.month);
    });
};

/**
 * The ids "select all valid" picks up: everything waiting that would go through
 * without a complaint. A duplicate is left out — accepting one is a deliberate
 * choice, not something a bulk action should make on your behalf.
 */
export const acceptableItemIds = (items: DsInboxItem[]) => items
  .filter(item => (
    item.status === 'pending'
    && item.kind !== 'balance'
    && !item.duplicate
    && Boolean(item.draft)
    && isDraftAcceptable(draftFromItem(item))
  ))
  .map(item => item.id);

export const describeAcceptOutcome = (status: string) => {
  switch (status) {
    case 'accepted': return 'Added to Cash Flow';
    case 'duplicate': return 'An identical movement already exists';
    case 'invalid': return 'Needs fixing before it can be accepted';
    case 'missing': return 'No longer in the Inbox';
    default: return 'Skipped';
  }
};
