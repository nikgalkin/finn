import type { Organization, OrganizationDraft } from '../types';
import { parseNumberExpression } from './numberExpression.ts';

type UncalculatedAmount = {
  organization: string;
  currency: string;
  value: string;
};

type NormalizedSnapshotAmounts = {
  organizations: Organization[];
  uncalculatedAmounts: UncalculatedAmount[];
};

export const normalizeSnapshotAmounts = (organizations: OrganizationDraft[]): NormalizedSnapshotAmounts => {
  const uncalculatedAmounts: UncalculatedAmount[] = [];

  const normalized = organizations.map(organization => ({
    ...organization,
    balances: organization.balances.map(balance => {
      const raw = typeof balance.amount === 'string' ? balance.amount.trim() : balance.amount;
      if (raw === '') return { ...balance, amount: 0 };

      const parsed = parseNumberExpression(raw);
      if (parsed === null) {
        uncalculatedAmounts.push({
          organization: organization.name.trim(),
          currency: balance.currency,
          value: String(balance.amount)
        });
        return { ...balance, amount: 0 };
      }

      return { ...balance, amount: parsed };
    })
  }));

  return { organizations: normalized, uncalculatedAmounts };
};
