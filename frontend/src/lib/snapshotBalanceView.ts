import type { BalanceDraft } from '../types';

export const snapshotBalanceViewChoices = [
  'tag-order',
  'currency-order',
  'original',
] as const;

export type SnapshotBalanceView = (typeof snapshotBalanceViewChoices)[number];
export type SnapshotBalanceViewStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type SnapshotBalanceViewRow<T extends BalanceDraft = BalanceDraft> = {
  balance: T;
  originalIndex: number;
};

type SnapshotBalanceViewOptions = {
  baseCurrency?: string;
  secondaryCurrency?: string;
  currencies?: readonly string[];
  tags?: readonly string[];
};

const storageKey = 'finn:snapshot-balance-view';
const normalizeValue = (value: string) => value.trim().toLocaleLowerCase();

const browserStorage = (): SnapshotBalanceViewStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function readSnapshotBalanceView(
  storage: SnapshotBalanceViewStorage | null = browserStorage(),
  fallback: SnapshotBalanceView = 'tag-order',
): SnapshotBalanceView {
  try {
    const stored = storage?.getItem(storageKey) as SnapshotBalanceView | null;
    return stored && snapshotBalanceViewChoices.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function saveSnapshotBalanceView(
  view: SnapshotBalanceView,
  storage: SnapshotBalanceViewStorage | null = browserStorage(),
) {
  try {
    storage?.setItem(storageKey, view);
  } catch {
    return;
  }
}

const preferredOrder = (values: readonly (string | undefined)[]) => {
  const order = new Map<string, number>();
  values.forEach(value => {
    const normalized = normalizeValue(value || '');
    if (normalized && !order.has(normalized)) order.set(normalized, order.size);
  });
  return order;
};

const compareConfiguredValues = (
  left: string,
  right: string,
  order: ReadonlyMap<string, number>,
) => {
  const leftValue = normalizeValue(left);
  const rightValue = normalizeValue(right);
  if (!leftValue) return rightValue ? 1 : 0;
  if (!rightValue) return -1;

  const leftPosition = order.get(leftValue);
  const rightPosition = order.get(rightValue);
  if (leftPosition !== undefined || rightPosition !== undefined) {
    return (leftPosition ?? Number.MAX_SAFE_INTEGER) - (rightPosition ?? Number.MAX_SAFE_INTEGER);
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
};

const orderedTags = (balanceTags: readonly string[] | undefined, configuredTags: readonly string[]) => {
  const configuredTagsByName = new Map<string, string>();
  configuredTags.forEach(tag => {
    const normalized = normalizeValue(tag);
    if (normalized && !configuredTagsByName.has(normalized)) configuredTagsByName.set(normalized, tag.trim());
  });
  const tagOrder = preferredOrder(configuredTags);
  const uniqueTags = new Map<string, string>();
  (balanceTags || []).forEach(tag => {
    const normalized = normalizeValue(tag);
    if (normalized && !uniqueTags.has(normalized)) {
      uniqueTags.set(normalized, configuredTagsByName.get(normalized) || tag.trim());
    }
  });
  return Array.from(uniqueTags.values()).sort((left, right) => compareConfiguredValues(left, right, tagOrder));
};

const compareTagSets = (
  left: readonly string[],
  right: readonly string[],
  tagOrder: ReadonlyMap<string, number>,
) => {
  if (left.length === 0) return right.length === 0 ? 0 : 1;
  if (right.length === 0) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    const compared = compareConfiguredValues(left[index], right[index], tagOrder);
    if (compared !== 0) return compared;
  }
  return 0;
};

export function sortSnapshotBalanceRows<T extends BalanceDraft>(
  balances: readonly T[],
  view: SnapshotBalanceView,
  options: SnapshotBalanceViewOptions = {},
): SnapshotBalanceViewRow<T>[] {
  const rows = balances.map((balance, originalIndex) => ({ balance, originalIndex }));
  if (view === 'original') return rows;

  const currencyOrder = preferredOrder([
    options.baseCurrency,
    options.secondaryCurrency,
    ...(options.currencies || []),
  ]);
  const tagOrder = preferredOrder(options.tags || []);
  const rowTags = new Map(rows.map(row => [row.originalIndex, orderedTags(row.balance.tags, options.tags || [])]));

  return [...rows].sort((left, right) => {
    if (view === 'tag-order') {
      const tagsCompared = compareTagSets(
        rowTags.get(left.originalIndex) || [],
        rowTags.get(right.originalIndex) || [],
        tagOrder,
      );
      if (tagsCompared !== 0) return tagsCompared;
    }
    return compareConfiguredValues(left.balance.currency, right.balance.currency, currencyOrder)
      || left.originalIndex - right.originalIndex;
  });
}
