import type { Balance, FlowEntry, ParsedSnapshot, Organization } from '../types';

export type SnapshotTotals = {
  totalBase: number;
  totalSecondary: number;
};

export type FlowDecomposition = {
  organicDelta: number;
  fxImpactDelta: number;
};

export type EstimatedCapitalReturn = {
  externalFlow: number;
  result: number;
  ratePercent: number | null;
};

export type TaggedCapitalReturn = {
  tag: string;
  openingCapital: number;
  assignedFlow: number;
  result: number;
  ratePercent: number | null;
};

export type TaggedCapitalReturnBreakdown = {
  returns: TaggedCapitalReturn[];
  assignedExternalEntries: number;
  totalExternalEntries: number;
};

export type CommentItem = {
  type: 'snapshot' | 'org' | 'balance';
  orgName?: string;
  currency?: string;
  tags?: string[];
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

export const calculateSnapshotTotalAtRates = (
  snapshot: ParsedSnapshot,
  rates: Record<string, number | string>,
  baseCurrency: string
) => Object.entries(calculateCurrencyTotals(snapshot)).reduce((total, [currency, amount]) => (
  total + convertAmount(amount, currency, baseCurrency, rates)
), 0);

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

export const calculateNetExternalFlow = (
  entries: FlowEntry[],
  rates: Record<string, number | string>,
  baseCurrency: string
) => entries.reduce((total, entry) => {
  if (entry.entryType === 'transfer') return total;
  const tax = entry.direction === 'in' ? entry.amount * (entry.taxRate || 0) / 100 : 0;
  const signedNetAmount = entry.direction === 'in' ? entry.amount - tax : -entry.amount;
  return total + convertAmount(signedNetAmount, entry.currency, baseCurrency, rates);
}, 0);

export const calculateEstimatedCapitalReturn = (
  organicDelta: number,
  previousCapitalAtCurrentRates: number,
  externalFlow: number
): EstimatedCapitalReturn => {
  const result = organicDelta - externalFlow;
  // Balance changes and Cash Flow are valued at current snapshot rates, so the
  // opening capital must use the same rates. Cash Flow only has month precision,
  // therefore movements are assumed to happen halfway through the month.
  const averageInvestedCapital = previousCapitalAtCurrentRates + externalFlow / 2;
  const ratePercent = averageInvestedCapital > 0 ? (result / averageInvestedCapital) * 100 : null;
  return { externalFlow, result, ratePercent };
};

const balanceAccountKey = (account: string, currency: string) => `${account}\u001f${currency}`;
const analyticalTags = (tags?: string[]) => tags && tags.length > 0 ? tags.filter(Boolean) : ['untagged'];

export const calculateTaggedCapitalReturns = (
  current: ParsedSnapshot,
  previous: ParsedSnapshot,
  entries: FlowEntry[],
  baseCurrency: string
): TaggedCapitalReturnBreakdown => {
  type AccountBalance = { amount: number; tags: string[] };
  const collectBalances = (snapshot: ParsedSnapshot) => {
    const balances = new Map<string, AccountBalance>();
    snapshot.data.organizations.forEach(organization => {
      organization.balances.forEach(balance => {
        if (!organization.name || !balance.currency) return;
        const key = balanceAccountKey(organization.name, balance.currency);
        const existing = balances.get(key);
        const amount = toNumber(balance.amount);
        const tags = analyticalTags(balance.tags);
        balances.set(key, {
          amount: (existing?.amount || 0) + amount,
          tags: Array.from(new Set([...(existing?.tags || []), ...tags]))
        });
      });
    });
    return balances;
  };

  const currentBalances = collectBalances(current);
  const previousBalances = collectBalances(previous);
  const accountTags = new Map<string, string[]>();
  [previous, current].forEach(snapshot => {
    snapshot.data.organizations.forEach(organization => {
      if (!organization.name) return;
      const tags = organization.balances.flatMap(balance => balance.tags?.filter(Boolean) || []);
      accountTags.set(organization.name, Array.from(new Set([...(accountTags.get(organization.name) || []), ...tags])));
    });
  });
  const assignedFlows = new Map<string, number>();
  const addAssignedFlow = (account: string, currency: string, amount: number) => {
    if (!account || !currency || amount === 0) return;
    const key = balanceAccountKey(account, currency);
    assignedFlows.set(key, (assignedFlows.get(key) || 0) + convertAmount(amount, currency, baseCurrency, current.data.rates));
  };

  let totalExternalEntries = 0;
  let assignedExternalEntries = 0;
  entries.forEach(entry => {
    if (entry.entryType === 'transfer') {
      addAssignedFlow(entry.account, entry.currency, -entry.amount);
      addAssignedFlow(entry.toAccount, entry.toCurrency, entry.toAmount);
      return;
    }
    totalExternalEntries += 1;
    if (!entry.account) return;
    assignedExternalEntries += 1;
    const tax = entry.direction === 'in' ? entry.amount * (entry.taxRate || 0) / 100 : 0;
    addAssignedFlow(entry.account, entry.currency, entry.direction === 'in' ? entry.amount - tax : -entry.amount);
  });

  const totals = new Map<string, { openingCapital: number; assignedFlow: number; result: number }>();
  const addToTag = (tag: string, field: 'openingCapital' | 'assignedFlow' | 'result', value: number) => {
    const total = totals.get(tag) || { openingCapital: 0, assignedFlow: 0, result: 0 };
    total[field] += value;
    totals.set(tag, total);
  };

  const allKeys = new Set([...currentBalances.keys(), ...previousBalances.keys(), ...assignedFlows.keys()]);
  allKeys.forEach(key => {
    const separator = key.lastIndexOf('\u001f');
    const account = key.slice(0, separator);
    const currency = key.slice(separator + 1);
    const currentBalance = currentBalances.get(key);
    const previousBalance = previousBalances.get(key);
    const tags = currentBalance?.tags.length
      ? currentBalance.tags
      : previousBalance?.tags.length
        ? previousBalance.tags
        : accountTags.get(account)?.length
          ? accountTags.get(account)!
          : ['untagged'];
    const tagShare = 1 / tags.length;
    // Keep the return denominator in the same valuation basis as organicDelta
    // and assignedFlow, while FX impact remains a separate reconciliation item.
    const openingCapital = convertAmount(previousBalance?.amount || 0, currency, baseCurrency, current.data.rates);
    const organicDelta = convertAmount((currentBalance?.amount || 0) - (previousBalance?.amount || 0), currency, baseCurrency, current.data.rates);
    const assignedFlow = assignedFlows.get(key) || 0;

    tags.forEach(tag => {
      addToTag(tag, 'openingCapital', openingCapital * tagShare);
      addToTag(tag, 'assignedFlow', assignedFlow * tagShare);
      addToTag(tag, 'result', (organicDelta - assignedFlow) * tagShare);
    });
  });

  const returns = Array.from(totals.entries()).map(([tag, total]) => {
    const averageCapital = total.openingCapital + total.assignedFlow / 2;
    return {
      tag,
      ...total,
      ratePercent: averageCapital > 0 ? (total.result / averageCapital) * 100 : null
    };
  }).sort((left, right) => Math.abs(right.result) - Math.abs(left.result));

  return { returns, assignedExternalEntries, totalExternalEntries };
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
          tags: balance.tags,
          text: balance.comment
        });
      }
    });
  });

  return items;
};
