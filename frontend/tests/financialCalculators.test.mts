import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateDeposit,
  calculateDepositOffer,
  calculateFxDeal,
  calculateFxSpendForTarget,
  calculateGoalContribution,
  calculateGrowthProjection,
  calculateRebalance,
  calculateXirr,
  compareDepositOffers,
  compareFxDeals,
  compareFxDealsForTarget,
  normalizeTargetPercents,
  signReturnFlow,
  suggestGoalTarget,
  suggestMonthlyContribution,
  type DepositCompounding
} from '../src/lib/financialCalculators.ts';
import {
  buildSnapshotCurrencyRebalanceRows,
  buildSnapshotRebalanceRows,
  buildSnapshotReturnFlows,
  getSnapshotConversionRate,
  getSnapshotCurrencyHolding,
  getSnapshotFxQuote,
  getSnapshotPortfolioTotal
} from '../src/lib/calculatorSnapshotDefaults.ts';
import type { FlowEntry, ParsedSnapshot } from '../src/types.ts';

const snapshot = (
  id: number,
  month: string,
  usdRate: number,
  rub: number,
  usd: number
): ParsedSnapshot => ({
  id,
  month,
  data: {
    rates: { RUB: 1, USD: usdRate, UZS: 0.007 },
    organizations: [
      {
        id: 'bank',
        name: 'Bank',
        balances: [{ currency: 'RUB', amount: rub }]
      },
      {
        id: 'broker',
        name: 'Broker',
        balances: [{ currency: 'USD', amount: usd }]
      }
    ]
  }
});

test('projects monthly contributions with monthly compounding', () => {
  const result = calculateGrowthProjection({
    startingCapital: 100_000,
    monthlyContribution: 10_000,
    annualReturnPercent: 12,
    annualInflationPercent: 6,
    years: 1
  });

  assert.equal(result.months, 12);
  assert.equal(result.totalContributions, 220_000);
  assert.ok(result.futureValue > result.totalContributions);
  assert.ok(result.realFutureValue < result.futureValue);
});

test('solves the monthly contribution needed for a goal', () => {
  const result = calculateGoalContribution({
    startingCapital: 0,
    targetAmount: 120_000,
    annualReturnPercent: 0,
    years: 1
  });

  assert.equal(result.requiredMonthlyContribution, 10_000);
  assert.equal(result.futureValue, 120_000);
});

test('suggests a clean goal around twice the current capital', () => {
  assert.equal(suggestGoalTarget(5_123), 10_000);
  assert.equal(suggestGoalTarget(512_332), 1_000_000);
  assert.equal(suggestGoalTarget(5_123_321), 10_000_000);
  assert.equal(suggestGoalTarget(1_000_000), 2_000_000);
  assert.equal(suggestGoalTarget(0), 0);
});

test('suggests a clean monthly contribution at one percent of current capital', () => {
  assert.equal(suggestMonthlyContribution(5_123_321), 50_000);
  assert.equal(suggestMonthlyContribution(512_332), 5_000);
  assert.equal(suggestMonthlyContribution(51_233), 500);
  assert.equal(suggestMonthlyContribution(1_000_000), 10_000);
  assert.equal(suggestMonthlyContribution(0), 0);
});

test('calculates a full rebalance and preserves cash in the target total', () => {
  const result = calculateRebalance([
    { id: 'stocks', label: 'Stocks', currentAmount: 80, targetPercent: 50 },
    { id: 'bonds', label: 'Bonds', currentAmount: 20, targetPercent: 50 }
  ], 20);

  assert.equal(result.portfolioTotal, 120);
  assert.equal(result.suggestions[0].difference, -20);
  assert.equal(result.suggestions[1].difference, 40);
});

test('buy-only rebalance never recommends a sale', () => {
  const result = calculateRebalance([
    { id: 'stocks', label: 'Stocks', currentAmount: 80, targetPercent: 50 },
    { id: 'bonds', label: 'Bonds', currentAmount: 20, targetPercent: 50 }
  ], 20, true);

  assert.equal(result.suggestions[0].difference, 0);
  assert.equal(result.suggestions[1].difference, 20);
});

test('reports drift and the volume a rebalance would trade', () => {
  const result = calculateRebalance([
    { id: 'stocks', label: 'Stocks', currentAmount: 80, targetPercent: 50 },
    { id: 'bonds', label: 'Bonds', currentAmount: 20, targetPercent: 50 }
  ], 0);

  assert.equal(result.suggestions[0].driftPercent, 30);
  assert.equal(result.suggestions[1].driftPercent, -30);
  assert.equal(result.largestDriftPercent, 30);
  assert.equal(result.tradeVolume, 60);
});

test('buy-only trade volume counts only the cash that gets allocated', () => {
  const result = calculateRebalance([
    { id: 'stocks', label: 'Stocks', currentAmount: 80, targetPercent: 50 },
    { id: 'bonds', label: 'Bonds', currentAmount: 20, targetPercent: 50 }
  ], 20, true);

  assert.equal(result.tradeVolume, 20);
  assert.equal(result.largestDriftPercent, 30);
});

test('normalizes target percentages to exactly one hundred', () => {
  assert.deepEqual(normalizeTargetPercents([60, 25, 15]), [60, 25, 15]);
  assert.deepEqual(normalizeTargetPercents([1, 1, 1]), [33.34, 33.33, 33.33]);
  assert.deepEqual(normalizeTargetPercents([700_000, 200_000, 100_000]), [70, 20, 10]);
  assert.deepEqual(normalizeTargetPercents([0, 0]), [50, 50]);
  assert.deepEqual(normalizeTargetPercents([]), []);
  assert.equal(
    normalizeTargetPercents([3, 3, 3, 7]).reduce((sum, value) => sum + value, 0),
    100
  );
});

test('calculates an annualized XIRR for dated cash flows', () => {
  const result = calculateXirr([
    { date: '2025-01-01', amount: -1_000 },
    { date: '2026-01-01', amount: 1_100 }
  ]);

  assert.ok(result.annualizedReturnPercent !== null);
  assert.ok(Math.abs(result.annualizedReturnPercent - 10) < 0.0001);
  assert.equal(result.netProfit, 100);
  assert.equal(result.simpleReturnPercent, 10);
  assert.equal(result.periodDays, 365);
});

test('signs return flow rows from their kind rather than the typed sign', () => {
  assert.equal(signReturnFlow('open', 1_000), -1_000);
  assert.equal(signReturnFlow('deposit', -1_000), -1_000);
  assert.equal(signReturnFlow('withdrawal', -250), 250);
  assert.equal(signReturnFlow('close', 1_150), 1_150);
});

test('compares FX quotes including basis and fees', () => {
  const deal = calculateFxDeal({
    budget: 100_000,
    rate: 7,
    feePercent: 1,
    unitsPerQuote: 1_000
  });
  const comparison = compareFxDeals(
    { budget: 100_000, rate: 7, unitsPerQuote: 1_000 },
    { budget: 100_000, rate: 7.5, unitsPerQuote: 1_000 }
  );

  assert.equal(deal.receivedAmount, 100_000 * 0.99 / 7 * 1_000);
  assert.equal(comparison.betterDeal, 'A');
  assert.ok(comparison.difference > 0);
});

test('compares buy-per-spend FX quotes without reversing the deal', () => {
  const comparison = compareFxDeals(
    { budget: 1_000, rate: 153, quoteDirection: 'buy-per-spend' },
    { budget: 1_000, rate: 152, quoteDirection: 'buy-per-spend' }
  );

  assert.equal(comparison.dealA.receivedAmount, 153_000);
  assert.equal(comparison.dealB.receivedAmount, 152_000);
  assert.equal(comparison.betterDeal, 'A');
});

test('calculates spend required for the same target amount', () => {
  const costQuote = calculateFxSpendForTarget({
    targetAmount: 1_000,
    rate: 90,
    quoteDirection: 'spend-per-buy'
  });
  const returnQuote = calculateFxSpendForTarget({
    targetAmount: 153_000,
    rate: 153,
    quoteDirection: 'buy-per-spend'
  });
  const comparison = compareFxDealsForTarget(
    { targetAmount: 1_000, rate: 90, quoteDirection: 'spend-per-buy' },
    { targetAmount: 1_000, rate: 91, quoteDirection: 'spend-per-buy' }
  );

  assert.equal(costQuote.spendAmount, 90_000);
  assert.equal(returnQuote.spendAmount, 1_000);
  assert.equal(comparison.dealA.spendAmount, 90_000);
  assert.equal(comparison.dealB.spendAmount, 91_000);
  assert.equal(comparison.betterDeal, 'A');
  assert.equal(comparison.difference, 1_000);
});

test('treats FX offers with the same visible rate as equal', () => {
  const displayedRateA = Math.round(100 * 100) / 100;
  const displayedRateB = Math.round(100.0001 * 100) / 100;
  const comparison = compareFxDeals(
    { budget: 1_000, rate: displayedRateA },
    { budget: 1_000, rate: displayedRateB }
  );

  assert.equal(comparison.betterDeal, 'equal');
  assert.equal(comparison.difference, 0);
  assert.equal(comparison.differencePercent, 0);
});

test('chooses the better FX offer even when received amounts round to the same cents', () => {
  const comparison = compareFxDeals(
    { budget: 100, rate: 153.97 },
    { budget: 100, rate: 154 }
  );

  assert.equal(comparison.dealA.receivedAmount.toFixed(2), comparison.dealB.receivedAmount.toFixed(2));
  assert.equal(comparison.betterDeal, 'A');
  assert.ok(comparison.difference > 0);
});

const assertClose = (actual: number | null, expected: number, tolerance = 1e-6) => {
  assert.ok(
    actual !== null && Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
};

test('compounds deposit interest on the chosen schedule', () => {
  const schedule = (compounding: DepositCompounding) => calculateDeposit({
    principal: 100_000,
    annualRatePercent: 12,
    months: 12,
    compounding
  });
  const daily = schedule('daily');
  const monthly = schedule('monthly');
  const atMaturity = schedule('maturity');

  assertClose(daily.maturityValue, 100_000 * (1 + 0.12 / 365) ** 365);
  assertClose(monthly.maturityValue, 100_000 * 1.01 ** 12);
  assertClose(atMaturity.maturityValue, 112_000);
  assertClose(atMaturity.netAnnualRatePercent, 12);
  assert.ok(daily.netAnnualRatePercent > monthly.netAnnualRatePercent);
  assert.ok(monthly.netAnnualRatePercent > atMaturity.netAnnualRatePercent);
});

test('taxes only the interest above the tax-free amount', () => {
  const deposit = (taxFreeInterest: number) => calculateDeposit({
    principal: 100_000,
    annualRatePercent: 12,
    months: 12,
    compounding: 'maturity',
    taxRatePercent: 13,
    taxFreeInterest
  });
  const taxed = deposit(10_000);
  const covered = deposit(20_000);

  assertClose(taxed.grossInterest, 12_000);
  assertClose(taxed.taxableInterest, 2_000);
  assertClose(taxed.tax, 260);
  assertClose(taxed.maturityValue, 111_740);
  assert.equal(covered.tax, 0);
  assertClose(covered.maturityValue, 112_000);
});

test('converts a foreign deposit in at the entry rate and out at the maturity rate', () => {
  const offer = calculateDepositOffer({
    investment: 100_000,
    annualRatePercent: 4,
    months: 12,
    compounding: 'maturity',
    entryRate: 100,
    exitRate: 110
  });

  assert.equal(offer.principal, 1_000);
  assertClose(offer.maturityValue, 1_040);
  assertClose(offer.maturityValueInBase, 114_400);
  assertClose(offer.profitInBase, 14_400);
  assertClose(offer.netAnnualRatePercent, 4);
  assertClose(offer.netAnnualReturnPercent, 14.4);
});

test('compares deposits and reports the rate that would tie them', () => {
  const local = {
    investment: 100_000,
    annualRatePercent: 10,
    months: 12,
    compounding: 'maturity' as const
  };
  const foreign = {
    investment: 100_000,
    annualRatePercent: 0,
    months: 12,
    compounding: 'maturity' as const,
    entryRate: 100,
    exitRate: 100
  };
  const comparison = compareDepositOffers(local, foreign);

  assert.equal(comparison.betterOffer, 'A');
  assertClose(comparison.difference, 10_000);
  assertClose(comparison.differencePercent, 10);
  assertClose(comparison.breakEvenExitRateB, 110);

  const tied = compareDepositOffers(local, { ...foreign, exitRate: 110 });
  assert.equal(tied.betterOffer, 'equal');
  assert.equal(tied.difference, 0);
});

test('reads a deposit conversion rate from the latest snapshot', () => {
  const latest = snapshot(2, '2026-02', 90, 100_000, 10_000);

  assert.equal(getSnapshotConversionRate(latest, 'USD', 'RUB'), 90);
  assert.equal(getSnapshotConversionRate(latest, 'RUB', 'RUB'), 1);
  assert.equal(getSnapshotConversionRate(latest, 'EUR', 'RUB'), null);
  assert.equal(getSnapshotConversionRate(null, 'USD', 'RUB'), null);
});

test('uses the latest snapshot for portfolio and rebalance defaults', () => {
  const latest = snapshot(2, '2026-02', 90, 100_000, 10_000);
  const rows = buildSnapshotRebalanceRows(latest, 'RUB');

  assert.equal(getSnapshotPortfolioTotal(latest, 'RUB'), 1_000_000);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].currentAmount, 100_000);
  assert.equal(rows[1].currentAmount, 900_000);
  assert.equal(rows[0].targetPercent + rows[1].targetPercent, 100);
  assert.equal(getSnapshotCurrencyHolding(latest, 'USD'), 10_000);
  assert.equal(getSnapshotCurrencyHolding(latest, 'RUB'), 100_000);
});

test('can group snapshot rebalance defaults by held currency', () => {
  const latest = snapshot(2, '2026-02', 90, 100_000, 10_000);
  const rows = buildSnapshotCurrencyRebalanceRows(latest, 'RUB');

  assert.deepEqual(rows.map(row => row.label), ['USD', 'RUB']);
  assert.deepEqual(rows.map(row => row.currentAmount), [900_000, 100_000]);
});

test('rounds snapshot-derived monetary defaults to two decimal places', () => {
  const latest = snapshot(2, '2026-02', 3, 1, 1);
  const rows = buildSnapshotRebalanceRows(latest, 'USD');

  assert.equal(getSnapshotPortfolioTotal(latest, 'USD'), 1.33);
  assert.equal(rows[0].currentAmount, 0.33);
  assert.equal(rows[1].currentAmount, 1);

  const rubRows = buildSnapshotRebalanceRows(latest, 'UZS');
  assert.equal(rubRows[1].currentAmount, 428.57);
});

test('builds return defaults from the latest snapshot period and external flows', () => {
  const previous = snapshot(1, '2026-01', 80, 100_000, 10_000);
  const latest = snapshot(2, '2026-02', 90, 150_000, 10_000);
  const entries: FlowEntry[] = [{
    id: 7,
    month: '2026-02',
    entryType: 'external',
    direction: 'in',
    counterparty: '',
    account: '',
    tag: '',
    currency: 'RUB',
    amount: 100_000,
    taxRate: 10,
    category: '',
    comment: '',
    toAccount: '',
    toTag: '',
    toCurrency: '',
    toAmount: 0
  }];
  const flows = buildSnapshotReturnFlows([latest, previous], entries, 'RUB');

  assert.deepEqual(flows.map(flow => flow.kind), ['open', 'deposit', 'close']);
  assert.equal(flows[0].amount, 900_000);
  assert.equal(flows[1].amount, 90_000);
  assert.equal(flows[2].amount, 1_050_000);
  assert.equal(flows[0].date, '2026-01-31');
  assert.equal(flows[2].date, '2026-02-28');
  assert.deepEqual(
    flows.map(flow => signReturnFlow(flow.kind, flow.amount)),
    [-900_000, -90_000, 1_050_000]
  );
});

test('keeps the FX deal direction while choosing a readable quote', () => {
  const latest = snapshot(2, '2026-02', 90, 100_000, 10_000);

  assert.deepEqual(getSnapshotFxQuote(latest, 'RUB', 'UZS'), {
    rate: 1 / 0.007,
    direction: 'buy-per-spend'
  });
  assert.deepEqual(getSnapshotFxQuote(latest, 'RUB', 'USD'), {
    rate: 90,
    direction: 'spend-per-buy'
  });
  assert.deepEqual(getSnapshotFxQuote(latest, 'UZS', 'RUB'), {
    rate: 1 / 0.007,
    direction: 'spend-per-buy'
  });
  assert.deepEqual(getSnapshotFxQuote(latest, 'USD', 'RUB'), {
    rate: 90,
    direction: 'buy-per-spend'
  });
});
