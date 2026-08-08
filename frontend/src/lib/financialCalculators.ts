type GrowthProjectionInput = {
  startingCapital: number;
  monthlyContribution: number;
  annualReturnPercent: number;
  annualInflationPercent?: number;
  years: number;
};

type GrowthProjection = {
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

type GoalContributionInput = Omit<GrowthProjectionInput, 'monthlyContribution'> & {
  targetAmount: number;
};

type GoalContribution = GrowthProjection & {
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

type RebalanceSuggestion = RebalanceItem & {
  currentPercent: number;
  targetAmount: number;
  difference: number;
  driftPercent: number;
};

type RebalanceResult = {
  suggestions: RebalanceSuggestion[];
  currentTotal: number;
  portfolioTotal: number;
  targetPercentTotal: number;
  unallocatedCash: number;
  tradeVolume: number;
  largestDriftPercent: number;
};

const roundPercent = (value: number) => Math.round(value * 100) / 100;

export const normalizeTargetPercents = (targets: number[]): number[] => {
  const values = targets.map(nonNegative);
  if (values.length === 0) return [];

  const total = values.reduce((sum, value) => sum + value, 0);
  const rounded = (total > 0
    ? values.map(value => value / total * 100)
    : values.map(() => 100 / values.length)
  ).map(roundPercent);
  const residual = roundPercent(100 - rounded.reduce((sum, value) => sum + value, 0));
  if (residual === 0) return rounded;

  const largestIndex = rounded.reduce(
    (best, value, index) => value > rounded[best] ? index : best,
    0
  );
  rounded[largestIndex] = roundPercent(rounded[largestIndex] + residual);
  return rounded;
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
    const currentPercent = currentTotal > 0 ? item.currentAmount / currentTotal * 100 : 0;
    return {
      ...item,
      currentPercent,
      targetAmount,
      difference: targetAmount - item.currentAmount,
      driftPercent: currentPercent - item.targetPercent
    };
  });
  const largestDriftPercent = desired.reduce(
    (largest, item) => Math.max(largest, Math.abs(item.driftPercent)),
    0
  );
  const tradeVolumeOf = (suggestions: RebalanceSuggestion[]) => suggestions.reduce(
    (sum, item) => sum + Math.abs(item.difference),
    0
  );

  if (!buyOnly) {
    return {
      suggestions: desired,
      currentTotal,
      portfolioTotal,
      targetPercentTotal,
      unallocatedCash: 0,
      tradeVolume: tradeVolumeOf(desired),
      largestDriftPercent
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
    unallocatedCash: Math.max(0, cash - amountToAllocate),
    tradeVolume: tradeVolumeOf(suggestions),
    largestDriftPercent
  };
};

type DatedCashFlow = {
  date: string;
  amount: number;
};

type ReturnCalculation = {
  annualizedReturnPercent: number | null;
  simpleReturnPercent: number | null;
  netProfit: number;
  totalInvested: number;
  totalReturned: number;
  periodDays: number;
};

export type ReturnFlowKind = 'open' | 'deposit' | 'withdrawal' | 'close';

export const signReturnFlow = (kind: ReturnFlowKind, amount: number) => {
  const magnitude = Math.abs(finiteOrZero(amount));
  return kind === 'open' || kind === 'deposit' ? -magnitude : magnitude;
};

const daysBetween = (start: number, end: number) => (end - start) / 86_400_000;

export const calculateXirr = (cashFlows: DatedCashFlow[]): ReturnCalculation => {
  const flows = cashFlows
    .map(flow => ({ amount: finiteOrZero(flow.amount), timestamp: Date.parse(flow.date) }))
    .filter(flow => flow.amount !== 0 && Number.isFinite(flow.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
  const totalInvested = flows.reduce((sum, flow) => sum + (flow.amount < 0 ? -flow.amount : 0), 0);
  const totalReturned = flows.reduce((sum, flow) => sum + (flow.amount > 0 ? flow.amount : 0), 0);
  const netProfit = flows.reduce((sum, flow) => sum + flow.amount, 0);
  const result: ReturnCalculation = {
    annualizedReturnPercent: null,
    simpleReturnPercent: totalInvested > 0 ? netProfit / totalInvested * 100 : null,
    netProfit,
    totalInvested,
    totalReturned,
    periodDays: flows.length < 2
      ? 0
      : daysBetween(flows[0].timestamp, flows[flows.length - 1].timestamp)
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

type FxDealInput = {
  budget: number;
  rate: number;
  feePercent?: number;
  unitsPerQuote?: number;
  quoteDirection?: FxQuoteDirection;
};

export type FxQuoteDirection = 'spend-per-buy' | 'buy-per-spend';

type FxDealResult = {
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

type FxComparison = {
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

type FxTargetDealInput = Omit<FxDealInput, 'budget'> & {
  targetAmount: number;
};

type FxTargetDealResult = {
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

type FxTargetComparison = {
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

export type DepositCompounding = 'daily' | 'monthly' | 'quarterly' | 'annually' | 'maturity';

const DEPOSIT_PERIODS_PER_YEAR: Record<Exclude<DepositCompounding, 'maturity'>, number> = {
  daily: 365,
  monthly: 12,
  quarterly: 4,
  annually: 1
};

type DepositInput = {
  principal: number;
  annualRatePercent: number;
  months: number;
  compounding?: DepositCompounding;
  taxRatePercent?: number;
  taxFreeInterest?: number;
};

type DepositResult = {
  principal: number;
  years: number;
  grossInterest: number;
  taxableInterest: number;
  tax: number;
  netInterest: number;
  maturityValue: number;
  netAnnualRatePercent: number;
};

const annualizePercent = (from: number, to: number, years: number) => {
  if (from <= 0 || years <= 0) return 0;
  if (to <= 0) return -100;
  return ((to / from) ** (1 / years) - 1) * 100;
};

export const calculateDeposit = ({
  principal,
  annualRatePercent,
  months,
  compounding = 'monthly',
  taxRatePercent = 0,
  taxFreeInterest = 0
}: DepositInput): DepositResult => {
  const amount = nonNegative(principal);
  const years = nonNegative(months) / 12;
  const annualRate = finiteOrZero(annualRatePercent) / 100;
  const periodsPerYear = compounding === 'maturity' ? 0 : DEPOSIT_PERIODS_PER_YEAR[compounding];
  const grossValue = periodsPerYear === 0
    ? amount * (1 + annualRate * years)
    : amount * (1 + annualRate / periodsPerYear) ** (periodsPerYear * years);
  const grossInterest = grossValue - amount;
  const taxableInterest = Math.max(0, grossInterest - nonNegative(taxFreeInterest));
  const tax = taxableInterest * nonNegative(taxRatePercent) / 100;
  const netInterest = grossInterest - tax;
  const maturityValue = amount + netInterest;

  return {
    principal: amount,
    years,
    grossInterest,
    taxableInterest,
    tax,
    netInterest,
    maturityValue,
    netAnnualRatePercent: annualizePercent(amount, maturityValue, years)
  };
};

type DepositOfferInput = Omit<DepositInput, 'principal'> & {
  investment: number;
  entryRate?: number;
  exitRate?: number;
};

type DepositOfferResult = DepositResult & {
  investment: number;
  maturityValueInBase: number;
  profitInBase: number;
  netAnnualReturnPercent: number;
};

export const calculateDepositOffer = ({
  investment,
  entryRate = 1,
  exitRate = 1,
  ...deposit
}: DepositOfferInput): DepositOfferResult => {
  const invested = nonNegative(investment);
  const entry = nonNegative(entryRate);
  const exit = nonNegative(exitRate);
  const result = calculateDeposit({
    ...deposit,
    principal: entry > 0 ? invested / entry : 0
  });
  const maturityValueInBase = result.maturityValue * exit;

  return {
    ...result,
    investment: invested,
    maturityValueInBase,
    profitInBase: maturityValueInBase - invested,
    netAnnualReturnPercent: annualizePercent(invested, maturityValueInBase, result.years)
  };
};

type DepositComparison = {
  offerA: DepositOfferResult;
  offerB: DepositOfferResult;
  difference: number;
  differencePercent: number;
  betterOffer: 'A' | 'B' | 'equal';
  breakEvenExitRateA: number | null;
  breakEvenExitRateB: number | null;
};

export const compareDepositOffers = (
  offerAInput: DepositOfferInput,
  offerBInput: DepositOfferInput
): DepositComparison => {
  const offerA = calculateDepositOffer(offerAInput);
  const offerB = calculateDepositOffer(offerBInput);
  const rawDifference = offerA.maturityValueInBase - offerB.maturityValueInBase;
  const comparisonScale = Math.max(
    1,
    Math.abs(offerA.maturityValueInBase),
    Math.abs(offerB.maturityValueInBase)
  );
  const materiallyEqual = Math.abs(rawDifference) <= Number.EPSILON * comparisonScale * 16;
  const difference = materiallyEqual ? 0 : rawDifference;
  const baseline = Math.min(offerA.maturityValueInBase, offerB.maturityValueInBase);

  return {
    offerA,
    offerB,
    difference,
    differencePercent: materiallyEqual || baseline <= 0 ? 0 : Math.abs(difference) / baseline * 100,
    betterOffer: materiallyEqual ? 'equal' : difference > 0 ? 'A' : 'B',
    breakEvenExitRateA: offerA.maturityValue > 0
      ? offerB.maturityValueInBase / offerA.maturityValue
      : null,
    breakEvenExitRateB: offerB.maturityValue > 0
      ? offerA.maturityValueInBase / offerB.maturityValue
      : null
  };
};
