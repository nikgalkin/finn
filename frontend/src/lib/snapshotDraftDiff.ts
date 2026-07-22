import type { Balance, SnapshotData } from '../types';

export type SnapshotDraftChangeSummary = {
  organizationsAdded: number;
  organizationsRemoved: number;
  organizationsUpdated: number;
  balancesAdded: number;
  balancesRemoved: number;
  balancesUpdated: number;
  ratesChanged: number;
  notesChanged: number;
  monthChanged: boolean;
};

type SnapshotDraftComparable = {
  data: SnapshotData;
  currentMonth: string;
};

const sameNumericValue = (left: number | string | undefined, right: number | string | undefined) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
  return left === right;
};

const sameTags = (left?: string[], right?: string[]) => {
  const normalizedLeft = (left || []).filter(Boolean).toSorted();
  const normalizedRight = (right || []).filter(Boolean).toSorted();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((tag, index) => tag === normalizedRight[index]);
};

const sameBalanceContent = (left: Balance, right: Balance) => (
  left.currency === right.currency
  && sameNumericValue(left.amount, right.amount)
  && sameTags(left.tags, right.tags)
);

const changedText = (left?: string, right?: string) => (left || '').trim() !== (right || '').trim();

export const summarizeSnapshotDraftChanges = (
  baseline: SnapshotDraftComparable,
  current: SnapshotDraftComparable
): SnapshotDraftChangeSummary => {
  const summary: SnapshotDraftChangeSummary = {
    organizationsAdded: 0,
    organizationsRemoved: 0,
    organizationsUpdated: 0,
    balancesAdded: 0,
    balancesRemoved: 0,
    balancesUpdated: 0,
    ratesChanged: 0,
    notesChanged: changedText(baseline.data.comment, current.data.comment) ? 1 : 0,
    monthChanged: baseline.currentMonth !== current.currentMonth
  };

  const baselineOrganizations = new Map(baseline.data.organizations.map(organization => [organization.id, organization]));
  const currentOrganizations = new Map(current.data.organizations.map(organization => [organization.id, organization]));
  const organizationIDs = new Set([...baselineOrganizations.keys(), ...currentOrganizations.keys()]);

  organizationIDs.forEach(id => {
    const previous = baselineOrganizations.get(id);
    const next = currentOrganizations.get(id);
    if (!previous && next) {
      summary.organizationsAdded += 1;
      return;
    }
    if (previous && !next) {
      summary.organizationsRemoved += 1;
      return;
    }
    if (!previous || !next) return;

    if (previous.name !== next.name || previous.country !== next.country) {
      summary.organizationsUpdated += 1;
    }
    if (changedText(previous.comment, next.comment)) summary.notesChanged += 1;

    const balanceCount = Math.max(previous.balances.length, next.balances.length);
    for (let index = 0; index < balanceCount; index += 1) {
      const previousBalance = previous.balances[index];
      const nextBalance = next.balances[index];
      if (!previousBalance && nextBalance) {
        summary.balancesAdded += 1;
      } else if (previousBalance && !nextBalance) {
        summary.balancesRemoved += 1;
      } else if (previousBalance && nextBalance) {
        if (!sameBalanceContent(previousBalance, nextBalance)) summary.balancesUpdated += 1;
        if (changedText(previousBalance.comment, nextBalance.comment)) summary.notesChanged += 1;
      }
    }
  });

  const rateCurrencies = new Set([
    ...Object.keys(baseline.data.rates || {}),
    ...Object.keys(current.data.rates || {})
  ]);
  rateCurrencies.forEach(currency => {
    if (!sameNumericValue(baseline.data.rates[currency], current.data.rates[currency])) {
      summary.ratesChanged += 1;
    }
  });

  return summary;
};

export const snapshotDraftChangeCount = (summary: SnapshotDraftChangeSummary) => (
  summary.organizationsAdded
  + summary.organizationsRemoved
  + summary.organizationsUpdated
  + summary.balancesAdded
  + summary.balancesRemoved
  + summary.balancesUpdated
  + summary.ratesChanged
  + summary.notesChanged
  + Number(summary.monthChanged)
);
