export type GrowthProjectionInput = {
  startingCapital: number;
  monthlyContribution: number;
  annualReturnPercent: number;
  annualInflationPercent?: number;
  years: number;
};

export type GrowthProjection = {
  futureValue: number;
  realFutureValue: number;
  totalContributions: number;
  investmentEarnings: number;
  months: number;
};

const finiteOrZero = (value: number) => Number.isFinite(value) ? value : 0;
const nonNegative = (value: number) => Math.max(0, finiteOrZero(value));

export const suggestGoalTarget = (startingCapital: number) => {
  const current = nonNegative(startingCapital);
  if (current === 0) return 0;

  const rawTarget = current * 2;
  const magnitude = 10 ** Math.floor(Math.log10(current));
  let target = Math.floor(rawTarget / magnitude) * magnitude;

  // Values close to an exact power of ten need one more significant digit;
  // otherwise flooring a small increase at a large step could leave the target unchanged.
  if (target <= current) {
    const refinedStep = magnitude / 10;
    target = Math.floor(rawTarget / refinedStep) * refinedStep;
  }
  return target;
};

export const suggestMonthlyContribution = (startingCapital: number) => {
  const rawContribution = nonNegative(startingCapital) * 0.01;
  if (rawContribution === 0) return 0;

  const magnitude = 10 ** Math.floor(Math.log10(rawContribution));
  return Math.floor(rawContribution / magnitude) * magnitude;
};

export const calculateGrowthProjection = ({
  startingCapital,
  monthlyContribution,
  annualReturnPercent,
  annualInflationPercent = 0,
  years
}: GrowthProjectionInput): GrowthProjection => {
  const principal = nonNegative(startingCapital);
  const contribution = nonNegative(monthlyContribution);
  const durationYears = nonNegative(years);
  const months = Math.max(0, Math.round(durationYears * 12));
  const monthlyRate = finiteOrZero(annualReturnPercent) / 100 / 12;
  const growthFactor = monthlyRate === 0 ? 1 : (1 + monthlyRate) ** months;
  const contributionValue = monthlyRate === 0
    ? contribution * months
    : contribution * ((growthFactor - 1) / monthlyRate);
  const futureValue = principal * growthFactor + contributionValue;
  const totalContributions = principal + contribution * months;
  const inflationFactor = (1 + finiteOrZero(annualInflationPercent) / 100) ** durationYears;
  const realFutureValue = inflationFactor > 0 ? futureValue / inflationFactor : futureValue;

  return {
    futureValue,
    realFutureValue,
    totalContributions,
    investmentEarnings: futureValue - totalContributions,
    months
  };
};

export type GoalContributionInput = Omit<GrowthProjectionInput, 'monthlyContribution'> & {
  targetAmount: number;
};

export type GoalContribution = GrowthProjection & {
  targetAmount: number;
  requiredMonthlyContribution: number;
  shortfallWithoutContributions: number;
};

export const calculateGoalContribution = ({
  startingCapital,
  targetAmount,
  annualReturnPercent,
  annualInflationPercent = 0,
  years
}: GoalContributionInput): GoalContribution => {
  const principal = nonNegative(startingCapital);
  const target = nonNegative(targetAmount);
  const durationYears = nonNegative(years);
  const months = Math.max(0, Math.round(durationYears * 12));
  const monthlyRate = finiteOrZero(annualReturnPercent) / 100 / 12;
  const growthFactor = monthlyRate === 0 ? 1 : (1 + monthlyRate) ** months;
  const futureStartingCapital = principal * growthFactor;
  const shortfallWithoutContributions = Math.max(0, target - futureStartingCapital);
  const annuityFactor = monthlyRate === 0
    ? months
    : (growthFactor - 1) / monthlyRate;
  const requiredMonthlyContribution = months > 0 && annuityFactor > 0
    ? shortfallWithoutContributions / annuityFactor
    : 0;
  const projection = calculateGrowthProjection({
    startingCapital: principal,
    monthlyContribution: requiredMonthlyContribution,
    annualReturnPercent,
    annualInflationPercent,
    years: durationYears
  });

  return {
    ...projection,
    futureValue: shortfallWithoutContributions === 0 ? futureStartingCapital : projection.futureValue,
    targetAmount: target,
    requiredMonthlyContribution,
    shortfallWithoutContributions
  };
};

export type RebalanceItem = {
  id: string;
  label: string;
  currentAmount: number;
  targetPercent: number;
};

export type RebalanceSuggestion = RebalanceItem & {
  currentPercent: number;
  targetAmount: number;
  difference: number;
};

export type RebalanceResult = {
  suggestions: RebalanceSuggestion[];
  currentTotal: number;
  portfolioTotal: number;
  targetPercentTotal: number;
  unallocatedCash: number;
};

export const calculateRebalance = (
  items: RebalanceItem[],
  additionalCash: number,
  buyOnly = false
): RebalanceResult => {
  const normalizedItems = items.map(item => ({
    ...item,
    currentAmount: nonNegative(item.currentAmount),
    targetPercent: nonNegative(item.targetPercent)
  }));
  const cash = nonNegative(additionalCash);
  const currentTotal = normalizedItems.reduce((sum, item) => sum + item.currentAmount, 0);
  const portfolioTotal = currentTotal + cash;
  const targetPercentTotal = normalizedItems.reduce((sum, item) => sum + item.targetPercent, 0);
  const desired = normalizedItems.map(item => {
    const targetAmount = portfolioTotal * item.targetPercent / 100;
    return {
      ...item,
      currentPercent: currentTotal > 0 ? item.currentAmount / currentTotal * 100 : 0,
      targetAmount,
      difference: targetAmount - item.currentAmount
    };
  });

  if (!buyOnly) {
    return {
      suggestions: desired,
      currentTotal,
      portfolioTotal,
      targetPercentTotal,
      unallocatedCash: 0
    };
  }

  const totalNeed = desired.reduce((sum, item) => sum + Math.max(0, item.difference), 0);
  const amountToAllocate = Math.min(cash, totalNeed);
  const suggestions = desired.map(item => ({
    ...item,
    difference: totalNeed > 0
      ? Math.max(0, item.difference) / totalNeed * amountToAllocate
      : 0
  }));

  return {
    suggestions,
    currentTotal,
    portfolioTotal,
    targetPercentTotal,
    unallocatedCash: Math.max(0, cash - amountToAllocate)
  };
};

export type DatedCashFlow = {
  date: string;
  amount: number;
};

export type ReturnCalculation = {
  annualizedReturnPercent: number | null;
  netProfit: number;
  totalInvested: number;
  totalReturned: number;
};

const daysBetween = (start: number, end: number) => (end - start) / 86_400_000;

export const calculateXirr = (cashFlows: DatedCashFlow[]): ReturnCalculation => {
  const flows = cashFlows
    .map(flow => ({ amount: finiteOrZero(flow.amount), timestamp: Date.parse(flow.date) }))
    .filter(flow => flow.amount !== 0 && Number.isFinite(flow.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
  const totalInvested = flows.reduce((sum, flow) => sum + (flow.amount < 0 ? -flow.amount : 0), 0);
  const totalReturned = flows.reduce((sum, flow) => sum + (flow.amount > 0 ? flow.amount : 0), 0);
  const result: ReturnCalculation = {
    annualizedReturnPercent: null,
    netProfit: flows.reduce((sum, flow) => sum + flow.amount, 0),
    totalInvested,
    totalReturned
  };

  if (flows.length < 2 || totalInvested === 0 || totalReturned === 0) return result;

  const start = flows[0].timestamp;
  const npv = (rate: number) => flows.reduce((sum, flow) => {
    const years = daysBetween(start, flow.timestamp) / 365;
    return sum + flow.amount / ((1 + rate) ** years);
  }, 0);

  let low = -0.9999;
  let high = 1;
  let lowValue = npv(low);
  let highValue = npv(high);

  for (let attempt = 0; attempt < 24 && lowValue * highValue > 0; attempt += 1) {
    high = high * 2 + 1;
    highValue = npv(high);
  }

  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) return result;

  for (let iteration = 0; iteration < 160; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = npv(middle);
    if (!Number.isFinite(middleValue)) return result;
    if (Math.abs(middleValue) < 1e-8) {
      low = middle;
      high = middle;
      break;
    }
    if (lowValue * middleValue <= 0) {
      high = middle;
      highValue = middleValue;
    } else {
      low = middle;
      lowValue = middleValue;
    }
  }

  result.annualizedReturnPercent = ((low + high) / 2) * 100;
  return result;
};

export type FxDealInput = {
  budget: number;
  rate: number;
  feePercent?: number;
  unitsPerQuote?: number;
  quoteDirection?: FxQuoteDirection;
};

export type FxQuoteDirection = 'spend-per-buy' | 'buy-per-spend';

export type FxDealResult = {
  receivedAmount: number;
  effectiveRate: number;
};

export const calculateFxDeal = ({
  budget,
  rate,
  feePercent = 0,
  unitsPerQuote = 1,
  quoteDirection = 'spend-per-buy'
}: FxDealInput): FxDealResult => {
  const spend = nonNegative(budget);
  const quoteRate = nonNegative(rate);
  const basis = Math.max(1, nonNegative(unitsPerQuote));
  const feeMultiplier = Math.max(0, 1 - nonNegative(feePercent) / 100);
  const receivedAmount = quoteRate <= 0
    ? 0
    : quoteDirection === 'buy-per-spend'
      ? spend / basis * quoteRate * feeMultiplier
      : spend * feeMultiplier / quoteRate * basis;

  return {
    receivedAmount,
    effectiveRate: feeMultiplier <= 0
      ? quoteDirection === 'buy-per-spend' ? 0 : Number.POSITIVE_INFINITY
      : quoteDirection === 'buy-per-spend'
        ? quoteRate * feeMultiplier
        : quoteRate / feeMultiplier
  };
};

export type FxComparison = {
  dealA: FxDealResult;
  dealB: FxDealResult;
  difference: number;
  differencePercent: number;
  betterDeal: 'A' | 'B' | 'equal';
};

export const compareFxDeals = (dealA: FxDealInput, dealB: FxDealInput): FxComparison => {
  const resultA = calculateFxDeal(dealA);
  const resultB = calculateFxDeal(dealB);
  const rawDifference = resultA.receivedAmount - resultB.receivedAmount;
  const comparisonScale = Math.max(
    1,
    Math.abs(resultA.receivedAmount),
    Math.abs(resultB.receivedAmount)
  );
  const materiallyEqual = Math.abs(rawDifference) <= Number.EPSILON * comparisonScale * 16;
  const difference = materiallyEqual ? 0 : rawDifference;
  const baseline = Math.min(resultA.receivedAmount, resultB.receivedAmount);

  return {
    dealA: resultA,
    dealB: resultB,
    difference,
    differencePercent: materiallyEqual || baseline <= 0 ? 0 : Math.abs(difference) / baseline * 100,
    betterDeal: materiallyEqual ? 'equal' : difference > 0 ? 'A' : 'B'
  };
};

export type FxTargetDealInput = Omit<FxDealInput, 'budget'> & {
  targetAmount: number;
};

export type FxTargetDealResult = {
  spendAmount: number;
  effectiveRate: number;
};

export const calculateFxSpendForTarget = ({
  targetAmount,
  rate,
  feePercent = 0,
  unitsPerQuote = 1,
  quoteDirection = 'spend-per-buy'
}: FxTargetDealInput): FxTargetDealResult => {
  const target = nonNegative(targetAmount);
  const quoteRate = nonNegative(rate);
  const basis = Math.max(1, nonNegative(unitsPerQuote));
  const feeMultiplier = Math.max(0, 1 - nonNegative(feePercent) / 100);
  const effectiveRate = calculateFxDeal({
    budget: 1,
    rate: quoteRate,
    feePercent,
    unitsPerQuote: basis,
    quoteDirection
  }).effectiveRate;

  if (target === 0) return { spendAmount: 0, effectiveRate };
  if (quoteRate <= 0 || feeMultiplier <= 0) {
    return { spendAmount: Number.POSITIVE_INFINITY, effectiveRate };
  }

  return {
    spendAmount: quoteDirection === 'buy-per-spend'
      ? target * basis / quoteRate / feeMultiplier
      : target * quoteRate / basis / feeMultiplier,
    effectiveRate
  };
};

export type FxTargetComparison = {
  dealA: FxTargetDealResult;
  dealB: FxTargetDealResult;
  difference: number;
  differencePercent: number;
  betterDeal: 'A' | 'B' | 'equal';
};

export const compareFxDealsForTarget = (
  dealA: FxTargetDealInput,
  dealB: FxTargetDealInput
): FxTargetComparison => {
  const resultA = calculateFxSpendForTarget(dealA);
  const resultB = calculateFxSpendForTarget(dealB);

  if (resultA.spendAmount === resultB.spendAmount) {
    return {
      dealA: resultA,
      dealB: resultB,
      difference: 0,
      differencePercent: 0,
      betterDeal: 'equal'
    };
  }
  if (!Number.isFinite(resultA.spendAmount)) {
    return {
      dealA: resultA,
      dealB: resultB,
      difference: Number.POSITIVE_INFINITY,
      differencePercent: Number.POSITIVE_INFINITY,
      betterDeal: 'B'
    };
  }
  if (!Number.isFinite(resultB.spendAmount)) {
    return {
      dealA: resultA,
      dealB: resultB,
      difference: Number.POSITIVE_INFINITY,
      differencePercent: Number.POSITIVE_INFINITY,
      betterDeal: 'A'
    };
  }

  const rawDifference = resultB.spendAmount - resultA.spendAmount;
  const comparisonScale = Math.max(1, resultA.spendAmount, resultB.spendAmount);
  const materiallyEqual = Math.abs(rawDifference) <= Number.EPSILON * comparisonScale * 16;
  const difference = materiallyEqual ? 0 : rawDifference;
  const baseline = Math.min(resultA.spendAmount, resultB.spendAmount);

  return {
    dealA: resultA,
    dealB: resultB,
    difference,
    differencePercent: materiallyEqual || baseline <= 0
      ? 0
      : Math.abs(difference) / baseline * 100,
    betterDeal: materiallyEqual ? 'equal' : difference > 0 ? 'A' : 'B'
  };
};
