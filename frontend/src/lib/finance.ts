import type { Balance, ParsedSnapshot, Organization } from '../types';

export type SnapshotTotals = {
  totalBase: number;
  totalSecondary: number;
};

export type FlowDecomposition = {
  organicDelta: number;
  fxImpactDelta: number;
};

export type CommentItem = {
  type: 'snapshot' | 'org' | 'balance';
  orgName?: string;
  currency?: string;
  text: string;
};

const DEFAULT_REFERENCE_CURRENCY = 'RUB';

const toNumber = (value: number | string | undefined): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const inferRateReferenceCurrency = (
  rates: Record<string, number | string>,
  fallback = DEFAULT_REFERENCE_CURRENCY
) => {
  if (toNumber(rates[fallback]) === 1) return fallback;

  const reference = Object.entries(rates).find(([, rate]) => toNumber(rate) === 1);
  return reference?.[0] || fallback;
};

export const getRateToReference = (
  currency: string,
  rates: Record<string, number | string>,
  referenceCurrency = inferRateReferenceCurrency(rates)
) => {
  if (currency === referenceCurrency) return 1;
  return toNumber(rates[currency]);
};

export const convertAmount = (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number | string>
) => {
  if (fromCurrency === toCurrency) return amount;

  const referenceCurrency = inferRateReferenceCurrency(rates);
  const sourceRate = getRateToReference(fromCurrency, rates, referenceCurrency);
  const targetRate = getRateToReference(toCurrency, rates, referenceCurrency);

  if (targetRate === 0) return 0;

  return (amount * sourceRate) / targetRate;
};

export const calculateTotals = (
  snapshot: ParsedSnapshot,
  baseCurrency: string,
  secondaryCurrency?: string
): SnapshotTotals => {
  let totalBase = 0;
  let totalSecondary = 0;

  snapshot.data.organizations.forEach(org => {
    org.balances.forEach(balance => {
      const amount = toNumber(balance.amount);
      if (amount === 0) return;

      totalBase += convertAmount(amount, balance.currency, baseCurrency, snapshot.data.rates);
      if (secondaryCurrency) {
        totalSecondary += convertAmount(amount, balance.currency, secondaryCurrency, snapshot.data.rates);
      }
    });
  });

  return { totalBase, totalSecondary };
};

export const calculateOrganizationTotal = (
  organization: Organization,
  rates: Record<string, number | string>,
  baseCurrency: string
) => {
  return organization.balances.reduce((total, balance) => {
    return total + convertAmount(toNumber(balance.amount), balance.currency, baseCurrency, rates);
  }, 0);
};

export const calculateCurrencyTotals = (snapshot: ParsedSnapshot) => {
  const totals: Record<string, number> = {};

  snapshot.data.organizations.forEach(org => {
    org.balances.forEach(balance => {
      const amount = toNumber(balance.amount);
      if (amount === 0 || !balance.currency) return;

      totals[balance.currency] = (totals[balance.currency] || 0) + amount;
    });
  });

  return totals;
};

export const calculateFlowDecomposition = (
  current: ParsedSnapshot,
  previous: ParsedSnapshot | null,
  baseCurrency: string
): FlowDecomposition => {
  if (!previous) {
    return {
      organicDelta: current.data.organizations.reduce((total, org) => {
        return total + org.balances.reduce((orgTotal, balance) => {
          return orgTotal + convertAmount(toNumber(balance.amount), balance.currency, baseCurrency, current.data.rates);
        }, 0);
      }, 0),
      fxImpactDelta: 0
    };
  }

  const currentCurrencies = calculateCurrencyTotals(current);
  const previousCurrencies = calculateCurrencyTotals(previous);
  const allCurrencies = Array.from(new Set([...Object.keys(currentCurrencies), ...Object.keys(previousCurrencies)]));

  return allCurrencies.reduce<FlowDecomposition>((result, currency) => {
    const currentAmount = currentCurrencies[currency] || 0;
    const previousAmount = previousCurrencies[currency] || 0;
    const amountDelta = currentAmount - previousAmount;

    const currentRateInBase = convertAmount(1, currency, baseCurrency, current.data.rates);
    const previousRateInBase = convertAmount(1, currency, baseCurrency, previous.data.rates);

    result.organicDelta += amountDelta * currentRateInBase;
    result.fxImpactDelta += previousAmount * (currentRateInBase - previousRateInBase);

    return result;
  }, { organicDelta: 0, fxImpactDelta: 0 });
};

export const hasAnyComments = (snapshot: ParsedSnapshot) => {
  if (snapshot.data.comment) return true;

  return snapshot.data.organizations.some(org => {
    return Boolean(org.comment) || org.balances.some(balance => Boolean(balance.comment));
  });
};

export const extractComments = (snapshot: ParsedSnapshot): CommentItem[] => {
  const items: CommentItem[] = [];

  if (snapshot.data.comment) {
    items.push({ type: 'snapshot', text: snapshot.data.comment });
  }

  snapshot.data.organizations.forEach(org => {
    if (org.comment) {
      items.push({ type: 'org', orgName: org.name, text: org.comment });
    }

    org.balances.forEach((balance: Balance) => {
      if (balance.comment) {
        items.push({
          type: 'balance',
          orgName: org.name,
          currency: balance.currency,
          text: balance.comment
        });
      }
    });
  });

  return items;
};
