import type { Balance, FlowEntry, ParsedSnapshot, Organization } from '../types';
import { toNumber } from './number.ts';
import type { SnapshotFlowPeriod } from './snapshotMonth';

type SnapshotTotals = {
  totalBase: number;
  totalSecondary: number;
};

export type FlowDecomposition = {
  organicDelta: number;
  fxImpactDelta: number;
};

type EstimatedCapitalReturn = {
  externalFlow: number;
  result: number;
  ratePercent: number | null;
};

export type TaggedReturnKind = 'yield' | 'spending' | 'unknown';

export type TaggedCapitalReturnDetail = {
  account: string;
  currency: string;
  openingBalance: number;
  inflow: number;
  outflow: number;
  closingBalance: number;
  classificationChange: number;
  result: number;
  resultBase: number;
  proportional: boolean;
  tagsChanged: boolean;
};

export type TaggedCapitalReturn = {
  tag: string;
  kind: TaggedReturnKind;
  openingCapital: number;
  closingCapital: number;
  assignedFlow: number;
  classificationChange: number;
  result: number;
  ratePercent: number | null;
  tagsChanged: boolean;
  hasReclassification: boolean;
  details: TaggedCapitalReturnDetail[];
};

export type TaggedCapitalReturnMonth = TaggedCapitalReturn & { month: string; flowPeriod?: SnapshotFlowPeriod };

export type TaggedCapitalReturnSummary = Pick<TaggedCapitalReturn, 'tag' | 'kind' | 'result' | 'ratePercent'> & {
  monthly: TaggedCapitalReturnMonth[];
  returnCoverage: { rated: number; total: number; excludedMonths: string[] };
};

export const summarizeTaggedCapitalReturns = (months: TaggedCapitalReturnMonth[]): TaggedCapitalReturnSummary[] => {
  const byTag = new Map<string, TaggedCapitalReturnMonth[]>();
  months.forEach(month => {
    const history = byTag.get(month.tag) || [];
    history.push(month);
    byTag.set(month.tag, history);
  });
  return Array.from(byTag, ([tag, monthly]) => {
    let multiplier = 1;
    let ratedMonths = 0;
    const excludedMonths: string[] = [];
    monthly.forEach(month => {
      if (month.ratePercent !== null && Number.isFinite(month.ratePercent)) {
        multiplier *= 1 + month.ratePercent / 100;
        ratedMonths += 1;
      } else if (month.openingCapital !== 0 || month.closingCapital !== 0 || month.result !== 0
        || month.details.some(detail => detail.inflow !== 0 || detail.outflow !== 0 || detail.classificationChange !== 0)) {
        excludedMonths.push(month.month);
      }
    });
    const kind = monthly[0].kind;
    return {
      tag, kind, monthly,
      result: monthly.reduce((sum, month) => sum + month.result, 0),
      ratePercent: kind === 'spending' || ratedMonths === 0 ? null : (multiplier - 1) * 100,
      returnCoverage: { rated: ratedMonths, total: ratedMonths + excludedMonths.length, excludedMonths }
    };
  }).filter(item => Math.abs(item.result) >= 0.01 || item.ratePercent !== null || item.monthly.some(month => month.tagsChanged))
    .sort((left, right) => Math.abs(right.result) - Math.abs(left.result));
};

type TaggedCapitalReturnBreakdown = {
  returns: TaggedCapitalReturn[];
  assignedExternalEntries: number;
  totalExternalEntries: number;
  proportionallyAllocatedEntries: number;
  unattributedFlow: number;
  unknownAccounts: string[];
};

export type CommentItem = {
  type: 'snapshot' | 'org' | 'balance';
  orgId?: string;
  balanceIndex?: number;
  orgName?: string;
  currency?: string;
  tags?: string[];
  text: string;
};

const DEFAULT_REFERENCE_CURRENCY = 'RUB';

export const inferRateReferenceCurrency = (
  rates: Record<string, number | string>,
  fallback = DEFAULT_REFERENCE_CURRENCY
) => {
  if (toNumber(rates[fallback]) === 1) return fallback;

  const reference = Object.entries(rates).find(([, rate]) => toNumber(rate) === 1);
  return reference?.[0] || fallback;
};

const getRateToReference = (
  currency: string,
  rates: Record<string, number | string>,
  referenceCurrency = inferRateReferenceCurrency(rates)
) => {
  if (currency === referenceCurrency) return 1;
  return toNumber(rates[currency]);
};

export const monthsBetween = (fromMonth: string, toMonth: string) => {
  const [fromYear, fromMonthNumber] = fromMonth.split('-').map(Number);
  const [toYear, toMonthNumber] = toMonth.split('-').map(Number);
  if (![fromYear, fromMonthNumber, toYear, toMonthNumber].every(Number.isFinite)) return 0;

  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
};

export const normalizeRates = (
  rates: Record<string, number | string>,
  baseCurrency: string
): Record<string, number> => {
  const numericRates: Record<string, number> = {};
  Object.entries(rates || {}).forEach(([currency, rate]) => {
    numericRates[currency] = toNumber(rate);
  });

  const baseRate = numericRates[baseCurrency];
  if (!(baseRate > 0)) return { ...numericRates, [baseCurrency]: 1 };
  if (baseRate === 1) return numericRates;

  return Object.fromEntries(Object.entries(numericRates).map(
    ([currency, rate]) => [currency, rate / baseRate]
  ));
};

export const normalizeSnapshotRates = <T extends { data: { rates: Record<string, number | string> } }>(
  snapshot: T,
  baseCurrency: string
): T => ({
  ...snapshot,
  data: { ...snapshot.data, rates: normalizeRates(snapshot.data.rates, baseCurrency) }
});

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

export const orientExchangeRate = (
  fromCurrency: string,
  toCurrency: string,
  rate: number
) => {
  const inverted = Number.isFinite(rate) && rate > 0 && rate < 1;
  return {
    fromCurrency: inverted ? toCurrency : fromCurrency,
    toCurrency: inverted ? fromCurrency : toCurrency,
    rate: inverted ? 1 / rate : rate,
    inverted
  };
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
const analyticalTags = (tags?: string[]) => {
  const filteredTags = tags?.filter(Boolean) || [];
  return filteredTags.length > 0 ? filteredTags : ['untagged'];
};

export const calculateTaggedCapitalReturns = (
  current: ParsedSnapshot,
  previous: ParsedSnapshot,
  entries: FlowEntry[],
  baseCurrency: string,
  nonYieldingTags: string[] = []
): TaggedCapitalReturnBreakdown => {
  type AccountBalance = { amountsByTag: Map<string, number> };
  const collectBalances = (snapshot: ParsedSnapshot) => {
    const balances = new Map<string, AccountBalance>();
    snapshot.data.organizations.forEach(organization => {
      organization.balances.forEach(balance => {
        if (!organization.name || !balance.currency) return;
        const key = balanceAccountKey(organization.name, balance.currency);
        const existing = balances.get(key) || { amountsByTag: new Map<string, number>() };
        const amount = toNumber(balance.amount);
        const tags = analyticalTags(balance.tags);
        const tagShare = amount / tags.length;
        tags.forEach(tag => {
          existing.amountsByTag.set(tag, (existing.amountsByTag.get(tag) || 0) + tagShare);
        });
        balances.set(key, existing);
      });
    });
    return balances;
  };

  const currentBalances = collectBalances(current);
  const previousBalances = collectBalances(previous);
  const accountTags = new Map<string, Set<string>>();
  [previous, current].forEach(snapshot => {
    snapshot.data.organizations.forEach(organization => {
      if (!organization.name) return;
      const tags = accountTags.get(organization.name) || new Set<string>();
      organization.balances.forEach(balance => analyticalTags(balance.tags).forEach(tag => tags.add(tag)));
      accountTags.set(organization.name, tags);
    });
  });
  type Movement = { inflow: number; outflow: number };
  const assignedFlows = new Map<string, Movement>();
  const directTagFlows = new Map<string, Map<string, Movement>>();
  const automaticFlowKeys: string[][] = [];
  const unknownAccounts = new Set<string>();
  let unattributedFlow = 0;

  const addMovement = (movements: Map<string, Movement>, key: string, amount: number) => {
    const movement = movements.get(key) || { inflow: 0, outflow: 0 };
    if (amount > 0) movement.inflow += amount;
    else movement.outflow -= amount;
    movements.set(key, movement);
  };
  const routeFlow = (tag: string, account: string, currency: string, amount: number) => {
    const explicitTag = tag?.trim() || '';
    const knownAccount = Boolean(account) && accountTags.has(account);
    if (!explicitTag && !knownAccount && account) unknownAccounts.add(account);
    const key = balanceAccountKey(account, currency);

    if (explicitTag) {
      const movements = directTagFlows.get(key) || new Map<string, Movement>();
      addMovement(movements, explicitTag, amount);
      directTagFlows.set(key, movements);
      return true;
    }
    if (knownAccount) {
      addMovement(assignedFlows, key, amount);
      return true;
    }
    unattributedFlow += currency ? convertAmount(amount, currency, baseCurrency, current.data.rates) : 0;
    return false;
  };

  let totalExternalEntries = 0;
  let assignedExternalEntries = 0;
  entries.forEach(entry => {
    if (entry.entryType === 'transfer') {
      routeFlow(entry.tag, entry.account, entry.currency, -entry.amount);
      routeFlow(entry.toTag, entry.toAccount, entry.toCurrency, entry.toAmount);
      automaticFlowKeys.push([
        ...(!entry.tag?.trim() ? [balanceAccountKey(entry.account, entry.currency)] : []),
        ...(!entry.toTag?.trim() ? [balanceAccountKey(entry.toAccount, entry.toCurrency)] : [])
      ]);
      return;
    }
    totalExternalEntries += 1;
    const tax = entry.direction === 'in' ? entry.amount * (entry.taxRate || 0) / 100 : 0;
    const netAmount = entry.direction === 'in' ? entry.amount - tax : -entry.amount;
    if (!routeFlow(entry.tag, entry.account, entry.currency, netAmount)) return;
    assignedExternalEntries += 1;
    if (!entry.tag?.trim()) automaticFlowKeys.push([balanceAccountKey(entry.account, entry.currency)]);
  });

  const detailsByTag = new Map<string, TaggedCapitalReturnDetail[]>();
  const allKeys = new Set([...currentBalances.keys(), ...previousBalances.keys(), ...assignedFlows.keys(), ...directTagFlows.keys()]);
  const allocationTagCounts = new Map<string, number>();
  allKeys.forEach(key => {
    const separator = key.lastIndexOf('\u001f');
    const account = key.slice(0, separator);
    const currency = key.slice(separator + 1);
    const currentBalance = currentBalances.get(key);
    const previousBalance = previousBalances.get(key);
    const previousTags = Array.from(previousBalance?.amountsByTag.keys() || []);
    const currentTags = Array.from(currentBalance?.amountsByTag.keys() || []);
    const balanceTags = Array.from(new Set([...previousTags, ...currentTags]));
    const allocationTags = balanceTags.length > 0 ? balanceTags : Array.from(accountTags.get(account) || []);
    if (allocationTags.length === 0 && assignedFlows.has(key)) allocationTags.push('untagged');
    const tags = Array.from(new Set([...allocationTags, ...(directTagFlows.get(key)?.keys() || [])]));
    const tagsChanged = previousTags.length > 0 && currentTags.length > 0
      && (previousTags.length !== currentTags.length || previousTags.some(tag => !currentTags.includes(tag)));

    // Preserve the actual tagged balances. Adding a checking balance alongside
    // a deposit must never redistribute the deposit's opening or closing value.
    const flowWeights = new Map(allocationTags.map(tag => [tag,
      Math.max(0, previousBalance?.amountsByTag.get(tag) || 0) + Math.max(0, currentBalance?.amountsByTag.get(tag) || 0)
    ]));
    let flowWeightTotal = Array.from(flowWeights.values()).reduce((sum, value) => sum + value, 0);
    if (flowWeightTotal === 0) {
      allocationTags.forEach(tag => flowWeights.set(tag,
        Math.abs(previousBalance?.amountsByTag.get(tag) || 0) + Math.abs(currentBalance?.amountsByTag.get(tag) || 0)));
      flowWeightTotal = Array.from(flowWeights.values()).reduce((sum, value) => sum + value, 0);
    }
    allocationTagCounts.set(key, allocationTags.length);
    const automaticFlow = assignedFlows.get(key);
    const details = new Map(tags.map(tag => {
      const share = flowWeightTotal > 0 ? (flowWeights.get(tag) || 0) / flowWeightTotal
        : allocationTags.includes(tag) ? 1 / allocationTags.length : 0;
      const explicitFlow = directTagFlows.get(key)?.get(tag);
      const openingBalance = previousBalance?.amountsByTag.get(tag) || 0;
      const closingBalance = currentBalance?.amountsByTag.get(tag) || 0;
      const inflow = (explicitFlow?.inflow || 0) + (automaticFlow?.inflow || 0) * share;
      const outflow = (explicitFlow?.outflow || 0) + (automaticFlow?.outflow || 0) * share;
      return [tag, {
        account, currency, openingBalance, closingBalance, inflow, outflow,
        classificationChange: 0,
        result: closingBalance - openingBalance - inflow + outflow,
        resultBase: 0,
        proportional: Boolean(automaticFlow && allocationTags.length > 1 && share > 0),
        tagsChanged
      } satisfies TaggedCapitalReturnDetail];
    }));

    // A complete tag replacement can be a classification edit. Reconcile only
    // the offsetting, unexplained principal, after recorded flows, and expose
    // this assumption separately instead of inventing blended snapshot values.
    if (tagsChanged && !previousTags.some(tag => currentTags.includes(tag))) {
      const removed = previousTags.map(tag => details.get(tag)!);
      const added = currentTags.map(tag => details.get(tag)!);
      for (const source of removed) {
        for (const destination of added) {
          const amount = Math.min(
            Math.max(0, -source.result), Math.max(0, source.openingBalance + source.classificationChange),
            Math.max(0, destination.result), Math.max(0, destination.closingBalance - destination.classificationChange)
          );
          source.classificationChange -= amount;
          source.result += amount;
          destination.classificationChange += amount;
          destination.result -= amount;
        }
      }
    }
    details.forEach((detail, tag) => {
      detail.resultBase = currency ? convertAmount(detail.result, currency, baseCurrency, current.data.rates) : 0;
      const tagDetails = detailsByTag.get(tag) || [];
      tagDetails.push(detail);
      detailsByTag.set(tag, tagDetails);
    });
  });

  const nonYielding = new Set(nonYieldingTags.map(tag => tag.trim()).filter(Boolean));
  const returns = Array.from(detailsByTag.entries()).map(([tag, details]) => {
    const total = details.reduce((sum, detail) => {
      const convert = (amount: number) => detail.currency
        ? convertAmount(amount, detail.currency, baseCurrency, current.data.rates) : 0;
      sum.openingCapital += convert(detail.openingBalance);
      sum.closingCapital += convert(detail.closingBalance);
      sum.assignedFlow += convert(detail.inflow - detail.outflow);
      sum.classificationChange += convert(detail.classificationChange);
      return sum;
    }, { openingCapital: 0, closingCapital: 0, assignedFlow: 0, classificationChange: 0 });
    const estimated = calculateEstimatedCapitalReturn(
      total.closingCapital - total.openingCapital - total.classificationChange,
      total.openingCapital,
      total.assignedFlow
    );
    const tagsChanged = details.some(detail => detail.tagsChanged);
    const hasReclassification = details.some(detail => detail.classificationChange !== 0);
    const kind: TaggedReturnKind = tag === 'untagged'
      ? 'unknown'
      : nonYielding.has(tag.trim()) ? 'spending' : 'yield';
    return {
      tag,
      kind,
      ...total,
      result: estimated.result,
      // Only inferred reclassification makes the investment basis uncertain;
      // adding another tagged balance does not invalidate this tag's return.
      ratePercent: kind === 'spending' || hasReclassification ? null : estimated.ratePercent,
      tagsChanged,
      hasReclassification,
      details
    };
  }).sort((left, right) => Math.abs(right.result) - Math.abs(left.result));

  const proportionallyAllocatedEntries = automaticFlowKeys.filter(keys => keys.some(key => (allocationTagCounts.get(key) || 0) > 1)).length;
  return {
    returns,
    assignedExternalEntries,
    totalExternalEntries,
    proportionallyAllocatedEntries,
    unattributedFlow,
    unknownAccounts: Array.from(unknownAccounts)
  };
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
      items.push({ type: 'org', orgId: org.id, orgName: org.name, text: org.comment });
    }

    org.balances.forEach((balance: Balance, balanceIndex) => {
      if (balance.comment) {
        items.push({
          type: 'balance',
          orgId: org.id,
          balanceIndex,
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
