import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Database,
  Plus,
  Scale,
  Trash2,
  TrendingUp,
  Percent
} from 'lucide-react';
import {
  calculateGoalContribution,
  calculateGrowthProjection,
  calculateRebalance,
  calculateXirr,
  compareFxDeals,
  suggestGoalTarget,
  suggestMonthlyContribution,
  type RebalanceItem
} from '../../../lib/financialCalculators';
import {
  buildSnapshotRebalanceRows,
  buildSnapshotReturnFlows,
  getSnapshotFxQuote,
  getSnapshotPortfolioTotal,
  suggestFxQuoteBasis
} from '../../../lib/calculatorSnapshotDefaults';
import { parseNumberExpression } from '../../../lib/numberExpression';
import { useFlowEntries } from '../../../hooks/useFlowEntries';
import { useSettings } from '../../../hooks/useSettings';
import { useSnapshots } from '../../../hooks/useSnapshots';
import { AmountInput } from '../AmountInput';
import { SearchableSelect } from '../graphs/SearchableSelect';
import { SegmentedControl } from '../SegmentedControl';
import { ToolModal } from './ToolModal';

type NumericValue = number | string;

const numeric = (value: NumericValue) => parseNumberExpression(value) ?? 0;
const formatValue = (value: number, maximumFractionDigits = 2) => (
  Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value)
    : '—'
);
const formatMoney = (value: number, currency: string) => `${formatValue(value)} ${currency}`;
const formatRate = (value: number | null) => value === null ? '—' : `${formatValue(value, 2)}%`;

type CalculatorFieldProps = {
  label: string;
  value: NumericValue;
  onChange: (value: NumericValue) => void;
  suffix?: string;
  hint?: string;
};

function CalculatorField({ label, value, onChange, suffix, hint }: CalculatorFieldProps) {
  return (
    <label className="calculator-field">
      <span>{label}</span>
      <div className="calculator-input">
        <AmountInput value={value} onChange={onChange} maximumFractionDigits={2} ariaLabel={label} />
        {suffix && <b>{suffix}</b>}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function CurrencyField({
  label,
  value,
  onChange,
  options,
  disabled = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label className="calculator-field calculator-currency-field">
      <span>{label}</span>
      <SearchableSelect
        ariaLabel={label}
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Currency"
        width="100%"
        dropdownWidth="180px"
        height="34px"
        textAlign="left"
        disabled={disabled}
        primaryOptions={options.slice(0, 1)}
        portal
        portalZIndex={100010}
      />
    </label>
  );
}

function useCalculatorCurrencies() {
  const { settings, loading: settingsLoading } = useSettings();
  const { snapshots, loading: snapshotsLoading } = useSnapshots({ sort: 'desc' });
  const baseCurrency = settings.baseCurrency || settings.currencies[0] || 'RUB';
  const currencies = useMemo(() => Array.from(new Set([
    baseCurrency,
    ...settings.currencies.map(currency => currency.trim()).filter(Boolean)
  ])), [baseCurrency, settings.currencies]);

  return {
    settings,
    baseCurrency,
    currencies,
    snapshots,
    latestSnapshot: snapshots[0] || null,
    currenciesLoading: settingsLoading,
    snapshotLoading: settingsLoading || snapshotsLoading
  };
}

function SnapshotSourceButton({
  month,
  loading,
  label,
  onClick
}: {
  month?: string;
  loading: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="btn calculator-snapshot-source"
      disabled={loading || !month}
      onClick={onClick}
    >
      <Database size={13} />
      {loading ? 'Loading snapshot…' : month ? `${label} · ${month}` : 'No snapshot'}
    </button>
  );
}

function ResultMetric({
  label,
  value,
  tone = 'neutral',
  primary = false
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'accent';
  primary?: boolean;
}) {
  return (
    <div className={`calculator-result is-${tone}${primary ? ' is-primary' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function GrowthGoalCalculatorModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'forecast' | 'goal'>('forecast');
  const {
    baseCurrency,
    currencies,
    currenciesLoading,
    latestSnapshot,
    snapshotLoading
  } = useCalculatorCurrencies();
  const [currencyOverride, setCurrencyOverride] = useState('');
  const [startingCapitalOverride, setStartingCapitalOverride] = useState<NumericValue | null>(null);
  const [monthlyContributionOverride, setMonthlyContributionOverride] = useState<NumericValue | null>(null);
  const [targetAmountOverride, setTargetAmountOverride] = useState<NumericValue | null>(null);
  const [annualReturn, setAnnualReturn] = useState<NumericValue>(6);
  const [annualInflation, setAnnualInflation] = useState<NumericValue>(6);
  const [years, setYears] = useState<NumericValue>(5);
  const currency = currencyOverride || baseCurrency;
  const snapshotCapital = useMemo(
    () => getSnapshotPortfolioTotal(latestSnapshot, currency),
    [currency, latestSnapshot]
  );
  const startingCapital = startingCapitalOverride ?? snapshotCapital ?? 1_000_000;
  const monthlyContribution = monthlyContributionOverride
    ?? suggestMonthlyContribution(numeric(startingCapital));
  const targetAmount = targetAmountOverride ?? suggestGoalTarget(numeric(startingCapital));

  const projection = useMemo(() => calculateGrowthProjection({
    startingCapital: numeric(startingCapital),
    monthlyContribution: numeric(monthlyContribution),
    annualReturnPercent: numeric(annualReturn),
    annualInflationPercent: numeric(annualInflation),
    years: numeric(years)
  }), [annualInflation, annualReturn, monthlyContribution, startingCapital, years]);

  const goal = useMemo(() => calculateGoalContribution({
    startingCapital: numeric(startingCapital),
    targetAmount: numeric(targetAmount),
    annualReturnPercent: numeric(annualReturn),
    annualInflationPercent: numeric(annualInflation),
    years: numeric(years)
  }), [annualInflation, annualReturn, startingCapital, targetAmount, years]);

  const activeProjection = mode === 'forecast' ? projection : goal;

  return (
    <ToolModal
      title="Growth & Goal Planner"
      subtitle="Project compound growth or solve the monthly contribution required for a target"
      icon={TrendingUp}
      accent="var(--success)"
      onClose={onClose}
    >
      <div className="calculator-toolbar">
        <SegmentedControl
          compact
          value={mode}
          onChange={value => {
            setMode(value);
            if (value === 'goal') setTargetAmountOverride(null);
            if (value === 'forecast') setMonthlyContributionOverride(null);
          }}
          options={[
            { value: 'forecast', label: 'Forecast' },
            { value: 'goal', label: 'Goal' }
          ]}
        />
        <CurrencyField
          label="Currency"
          value={currency}
          onChange={value => {
            setCurrencyOverride(value);
            setStartingCapitalOverride(null);
            setMonthlyContributionOverride(null);
            setTargetAmountOverride(null);
          }}
          options={currencies}
          disabled={currenciesLoading}
        />
        <SnapshotSourceButton
          month={latestSnapshot?.month}
          loading={snapshotLoading}
          label="Use portfolio"
          onClick={() => {
            setStartingCapitalOverride(null);
            setMonthlyContributionOverride(null);
            setTargetAmountOverride(null);
          }}
        />
      </div>

      <div className="calculator-shell">
        <section className="calculator-panel">
          <h3>{mode === 'forecast' ? 'Growth assumptions' : 'Goal assumptions'}</h3>
          <div className="calculator-field-grid">
            <CalculatorField
              label="Starting capital"
              value={startingCapital}
              onChange={setStartingCapitalOverride}
              suffix={currency}
              hint={startingCapitalOverride === null && latestSnapshot
                ? `Portfolio value from ${latestSnapshot.month}`
                : undefined}
            />
            {mode === 'forecast'
              ? (
                <CalculatorField
                  label="Monthly contribution"
                  value={monthlyContribution}
                  onChange={setMonthlyContributionOverride}
                  suffix={currency}
                  hint={monthlyContributionOverride === null
                    ? 'Suggested as 1% of current capital'
                    : undefined}
                />
              )
              : <CalculatorField label="Target amount" value={targetAmount} onChange={setTargetAmountOverride} suffix={currency} />}
            <CalculatorField label="Expected annual return" value={annualReturn} onChange={setAnnualReturn} suffix="%" />
            <CalculatorField label="Annual inflation" value={annualInflation} onChange={setAnnualInflation} suffix="%" />
            <CalculatorField label="Time horizon" value={years} onChange={setYears} suffix="years" />
          </div>
          <p className="calculator-note">
            Contributions are added at the end of each month and growth is compounded monthly. Taxes and fees are not included.
          </p>
        </section>

        <section className="calculator-panel calculator-output">
          <h3>{mode === 'forecast' ? 'Projection' : 'Contribution plan'}</h3>
          <div className="calculator-results">
            {mode === 'goal' && (
              <ResultMetric
                primary
                tone="accent"
                label="Required each month"
                value={formatMoney(goal.requiredMonthlyContribution, currency)}
              />
            )}
            <ResultMetric
              primary={mode === 'forecast'}
              tone="positive"
              label={mode === 'forecast' ? 'Future value' : 'Projected value'}
              value={formatMoney(activeProjection.futureValue, currency)}
            />
            <ResultMetric label="Total contributed" value={formatMoney(activeProjection.totalContributions, currency)} />
            <ResultMetric
              label="Investment earnings"
              value={formatMoney(activeProjection.investmentEarnings, currency)}
              tone={activeProjection.investmentEarnings >= 0 ? 'positive' : 'negative'}
            />
            <ResultMetric label="In today’s money" value={formatMoney(activeProjection.realFutureValue, currency)} />
          </div>
        </section>
      </div>
    </ToolModal>
  );
}

type RebalanceDraft = {
  id: string;
  label: string;
  currentAmount: NumericValue;
  targetPercent: NumericValue;
};

const INITIAL_REBALANCE_ROWS: RebalanceDraft[] = [
  { id: 'stocks', label: 'Stocks', currentAmount: 700_000, targetPercent: 60 },
  { id: 'bonds', label: 'Bonds', currentAmount: 200_000, targetPercent: 25 },
  { id: 'cash', label: 'Cash', currentAmount: 100_000, targetPercent: 15 }
];

export function RebalancerCalculatorModal({ onClose }: { onClose: () => void }) {
  const {
    baseCurrency,
    currencies,
    currenciesLoading,
    latestSnapshot,
    snapshotLoading
  } = useCalculatorCurrencies();
  const [currencyOverride, setCurrencyOverride] = useState('');
  const [additionalCash, setAdditionalCash] = useState<NumericValue>(100_000);
  const [buyOnly, setBuyOnly] = useState(true);
  const [rows, setRows] = useState<RebalanceDraft[]>(INITIAL_REBALANCE_ROWS);
  const snapshotInitialized = useRef(false);
  const currency = currencyOverride || baseCurrency;

  useEffect(() => {
    if (snapshotLoading || snapshotInitialized.current || !latestSnapshot) return;
    const snapshotRows = buildSnapshotRebalanceRows(latestSnapshot, currency);
    if (snapshotRows.length > 0) setRows(snapshotRows);
    snapshotInitialized.current = true;
  }, [currency, latestSnapshot, snapshotLoading]);

  const loadSnapshotRows = (nextCurrency: string) => {
    if (!latestSnapshot) return;
    const targets = new Map(rows.map(row => [row.id, numeric(row.targetPercent)]));
    const snapshotRows = buildSnapshotRebalanceRows(latestSnapshot, nextCurrency, targets);
    if (snapshotRows.length > 0) setRows(snapshotRows);
  };

  const items = useMemo<RebalanceItem[]>(() => rows.map(row => ({
    id: row.id,
    label: row.label.trim() || 'Untitled',
    currentAmount: numeric(row.currentAmount),
    targetPercent: numeric(row.targetPercent)
  })), [rows]);
  const result = useMemo(
    () => calculateRebalance(items, numeric(additionalCash), buyOnly),
    [additionalCash, buyOnly, items]
  );
  const targetsValid = Math.abs(result.targetPercentTotal - 100) < 0.01;

  const updateRow = (id: string, patch: Partial<RebalanceDraft>) => {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  return (
    <ToolModal
      title="Portfolio Rebalancer"
      subtitle="Turn target allocations into concrete buy and sell amounts"
      icon={Scale}
      accent="#a78bfa"
      onClose={onClose}
      actions={(
        <button
          type="button"
          className="btn"
          onClick={() => setRows(current => [...current, {
            id: crypto.randomUUID(),
            label: '',
            currentAmount: 0,
            targetPercent: 0
          }])}
        >
          <Plus size={14} /> Add asset
        </button>
      )}
    >
      <div className="calculator-toolbar">
        <CurrencyField
          label="Currency"
          value={currency}
          onChange={value => {
            setCurrencyOverride(value);
            loadSnapshotRows(value);
          }}
          options={currencies}
          disabled={currenciesLoading}
        />
        <CalculatorField label="New cash to invest" value={additionalCash} onChange={setAdditionalCash} suffix={currency} />
        <label className="calculator-checkbox">
          <input type="checkbox" checked={buyOnly} onChange={event => setBuyOnly(event.target.checked)} />
          <span><b>Buy only</b><small>Do not recommend sales</small></span>
        </label>
        <SnapshotSourceButton
          month={latestSnapshot?.month}
          loading={snapshotLoading}
          label="Refresh values"
          onClick={() => loadSnapshotRows(currency)}
        />
      </div>

      {!targetsValid && (
        <div className="tool-message is-warning">
          <div>
            <strong>Targets add up to {formatValue(result.targetPercentTotal)}%</strong>
            <span>Adjust the target percentages to exactly 100% before using the suggested trades.</span>
          </div>
        </div>
      )}

      <div className="rebalance-editor">
        <div className="rebalance-heading">
          <span>Asset</span><span>Current</span><span>Target</span><span />
        </div>
        {rows.map(row => (
          <div className="rebalance-edit-row" key={row.id}>
            <input
              type="text"
              className="input"
              value={row.label}
              placeholder="Asset or group"
              aria-label="Asset name"
              onChange={event => updateRow(row.id, { label: event.target.value })}
            />
            <AmountInput
              value={row.currentAmount}
              onChange={currentAmount => updateRow(row.id, { currentAmount })}
              ariaLabel={`${row.label || 'Asset'} current amount`}
            />
            <div className="calculator-input">
              <AmountInput
                value={row.targetPercent}
                onChange={targetPercent => updateRow(row.id, { targetPercent })}
                ariaLabel={`${row.label || 'Asset'} target percent`}
              />
              <b>%</b>
            </div>
            <button
              type="button"
              className="btn btn-danger cash-flow-icon-button"
              title={`Remove ${row.label || 'asset'}`}
              aria-label={`Remove ${row.label || 'asset'}`}
              disabled={rows.length === 1}
              onClick={() => setRows(current => current.filter(item => item.id !== row.id))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <section className="calculator-panel rebalance-results">
        <div className="calculator-summary">
          <ResultMetric label="Current portfolio" value={formatMoney(result.currentTotal, currency)} />
          <ResultMetric label="After new cash" value={formatMoney(result.portfolioTotal, currency)} />
          {buyOnly && result.unallocatedCash > 0 && (
            <ResultMetric label="Cash left over" value={formatMoney(result.unallocatedCash, currency)} />
          )}
        </div>
        <div className="rebalance-result-list">
          {result.suggestions.map(item => (
            <div className="rebalance-result-row" key={item.id}>
              <span><b>{item.label}</b><small>{formatValue(item.currentPercent)}% now → {formatValue(item.targetPercent)}% target</small></span>
              <span><small>Target value</small><b>{formatMoney(item.targetAmount, currency)}</b></span>
              <strong className={item.difference > 0 ? 'is-buy' : item.difference < 0 ? 'is-sell' : ''}>
                {item.difference > 0 ? 'Buy ' : item.difference < 0 ? 'Sell ' : 'Hold '}
                {formatMoney(Math.abs(item.difference), currency)}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </ToolModal>
  );
}

type CashFlowDraft = {
  id: string;
  date: string;
  amount: NumericValue;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const yearAgoIso = () => {
  const value = new Date();
  value.setFullYear(value.getFullYear() - 1);
  return value.toISOString().slice(0, 10);
};

export function ReturnCalculatorModal({ onClose }: { onClose: () => void }) {
  const {
    baseCurrency,
    currencies,
    currenciesLoading,
    snapshots,
    latestSnapshot,
    snapshotLoading
  } = useCalculatorCurrencies();
  const { entries: flowEntries, loaded: flowsLoaded } = useFlowEntries(true);
  const [currencyOverride, setCurrencyOverride] = useState('');
  const [flows, setFlows] = useState<CashFlowDraft[]>([
    { id: 'start', date: yearAgoIso(), amount: -1_000_000 },
    { id: 'end', date: todayIso(), amount: 1_150_000 }
  ]);
  const snapshotInitialized = useRef(false);
  const currency = currencyOverride || baseCurrency;
  const snapshotFlows = useMemo(
    () => buildSnapshotReturnFlows(snapshots, flowEntries, currency),
    [currency, flowEntries, snapshots]
  );
  const previousSnapshot = snapshots[1] || null;

  useEffect(() => {
    if (snapshotLoading || !flowsLoaded || snapshotInitialized.current) return;
    if (snapshotFlows.length >= 2) setFlows(snapshotFlows);
    snapshotInitialized.current = true;
  }, [flowsLoaded, snapshotFlows, snapshotLoading]);

  const loadSnapshotFlows = (nextCurrency: string) => {
    const nextFlows = buildSnapshotReturnFlows(snapshots, flowEntries, nextCurrency);
    if (nextFlows.length >= 2) setFlows(nextFlows);
  };

  const result = useMemo(() => calculateXirr(flows.map(flow => ({
    date: flow.date,
    amount: numeric(flow.amount)
  }))), [flows]);

  const updateFlow = (id: string, patch: Partial<CashFlowDraft>) => {
    setFlows(current => current.map(flow => flow.id === id ? { ...flow, ...patch } : flow));
  };

  return (
    <ToolModal
      title="Return Calculator"
      subtitle="Calculate money-weighted annual return from dated investments and withdrawals"
      icon={Percent}
      accent="#60a5fa"
      onClose={onClose}
      actions={(
        <button
          type="button"
          className="btn"
          onClick={() => setFlows(current => [...current, {
            id: crypto.randomUUID(),
            date: todayIso(),
            amount: 0
          }])}
        >
          <Plus size={14} /> Add cash flow
        </button>
      )}
    >
      <div className="calculator-toolbar">
        <CurrencyField
          label="Currency"
          value={currency}
          onChange={value => {
            setCurrencyOverride(value);
            loadSnapshotFlows(value);
          }}
          options={currencies}
          disabled={currenciesLoading}
        />
        <SnapshotSourceButton
          month={latestSnapshot?.month}
          loading={snapshotLoading || !flowsLoaded}
          label="Reload latest"
          onClick={() => loadSnapshotFlows(currency)}
        />
      </div>
      <p className="calculator-note return-calculator-note">
        Investments and deposits are negative. Withdrawals and the final portfolio value are positive.
        {previousSnapshot && latestSnapshot && snapshotFlows.length >= 2
          ? ` Defaults use ${previousSnapshot.month} → ${latestSnapshot.month} and ${snapshotFlows.length - 2} recorded external flow${snapshotFlows.length - 2 === 1 ? '' : 's'}.`
          : ''}
      </p>

      <div className="return-flow-editor">
        <div className="return-flow-heading"><span>Date</span><span>Signed amount</span><span /></div>
        {flows.map(flow => (
          <div className="return-flow-row" key={flow.id}>
            <input
              type="date"
              className="input"
              value={flow.date}
              aria-label="Cash flow date"
              onChange={event => updateFlow(flow.id, { date: event.target.value })}
            />
            <AmountInput
              value={flow.amount}
              onChange={amount => updateFlow(flow.id, { amount })}
              ariaLabel={`Cash flow on ${flow.date}`}
            />
            <button
              type="button"
              className="btn btn-danger cash-flow-icon-button"
              title="Remove cash flow"
              aria-label="Remove cash flow"
              disabled={flows.length === 2}
              onClick={() => setFlows(current => current.filter(item => item.id !== flow.id))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="calculator-summary return-summary">
        <ResultMetric
          primary
          label="Annualized MWR / XIRR"
          value={formatRate(result.annualizedReturnPercent)}
          tone={result.annualizedReturnPercent === null ? 'neutral' : result.annualizedReturnPercent >= 0 ? 'positive' : 'negative'}
        />
        <ResultMetric
          label="Net profit"
          value={formatMoney(result.netProfit, currency)}
          tone={result.netProfit >= 0 ? 'positive' : 'negative'}
        />
        <ResultMetric label="Total invested" value={formatMoney(result.totalInvested, currency)} />
        <ResultMetric label="Total returned / value" value={formatMoney(result.totalReturned, currency)} />
      </div>

      {result.annualizedReturnPercent === null && (
        <div className="tool-message is-warning">
          <div>
            <strong>A return cannot be calculated yet</strong>
            <span>Add at least one negative investment and one positive withdrawal or final value on different dates.</span>
          </div>
        </div>
      )}
    </ToolModal>
  );
}

export function FxComparatorCalculatorModal({ onClose }: { onClose: () => void }) {
  const {
    settings,
    baseCurrency,
    currencies,
    currenciesLoading,
    latestSnapshot,
    snapshotLoading
  } = useCalculatorCurrencies();
  const [fromCurrencyOverride, setFromCurrencyOverride] = useState('');
  const [toCurrencyOverride, setToCurrencyOverride] = useState('');
  const [budget, setBudget] = useState<NumericValue>(100_000);
  const [rateAOverride, setRateAOverride] = useState<NumericValue | null>(null);
  const [rateBOverride, setRateBOverride] = useState<NumericValue | null>(null);
  const [feeA, setFeeA] = useState<NumericValue>(0);
  const [feeB, setFeeB] = useState<NumericValue>(0);
  const [basisOverride, setBasisOverride] = useState<number | null>(null);
  const fromCurrency = fromCurrencyOverride || baseCurrency;
  const toCurrency = toCurrencyOverride
    || (settings.secondaryCurrency
      && settings.secondaryCurrency !== fromCurrency
      && currencies.includes(settings.secondaryCurrency)
      ? settings.secondaryCurrency
      : '')
    || currencies.find(currency => currency !== fromCurrency)
    || fromCurrency;
  const suggestedBasis = suggestFxQuoteBasis(latestSnapshot, fromCurrency, toCurrency);
  const basis = basisOverride ?? suggestedBasis;
  const snapshotQuote = getSnapshotFxQuote(
    latestSnapshot,
    fromCurrency,
    toCurrency,
    basis
  );
  const rateA = rateAOverride ?? snapshotQuote ?? 7;
  const rateB = rateBOverride ?? snapshotQuote ?? 7;

  const resetSnapshotRates = () => {
    setBasisOverride(null);
    setRateAOverride(null);
    setRateBOverride(null);
  };

  const comparison = useMemo(() => compareFxDeals({
    budget: numeric(budget),
    rate: numeric(rateA),
    feePercent: numeric(feeA),
    unitsPerQuote: basis
  }, {
    budget: numeric(budget),
    rate: numeric(rateB),
    feePercent: numeric(feeB),
    unitsPerQuote: basis
  }), [basis, budget, feeA, feeB, rateA, rateB]);
  const winner = comparison.betterDeal === 'equal' ? 'Same result' : `Deal ${comparison.betterDeal} is better`;

  return (
    <ToolModal
      title="FX Deal Comparator"
      subtitle="Compare two exchange quotes, their fees, and the amount of currency you receive"
      icon={ArrowLeftRight}
      accent="#14b8a6"
      onClose={onClose}
    >
      <div className="calculator-toolbar fx-toolbar">
        <CurrencyField
          label="Spend currency"
          value={fromCurrency}
          onChange={value => {
            setFromCurrencyOverride(value);
            resetSnapshotRates();
          }}
          options={currencies}
          disabled={currenciesLoading}
        />
        <CurrencyField
          label="Buy currency"
          value={toCurrency}
          onChange={value => {
            setToCurrencyOverride(value);
            resetSnapshotRates();
          }}
          options={currencies}
          disabled={currenciesLoading}
        />
        <CalculatorField label="Budget" value={budget} onChange={setBudget} suffix={fromCurrency} />
        <label className="calculator-field">
          <span>Quote basis</span>
          <select
            className="input"
            value={basis}
            onChange={event => {
              const nextBasis = Number(event.target.value);
              const scale = nextBasis / basis;
              setBasisOverride(nextBasis);
              setRateAOverride(current => current === null ? null : numeric(current) * scale);
              setRateBOverride(current => current === null ? null : numeric(current) * scale);
            }}
          >
            <option value={1}>per 1 {toCurrency}</option>
            <option value={100}>per 100 {toCurrency}</option>
            <option value={1000}>per 1,000 {toCurrency}</option>
          </select>
        </label>
        <SnapshotSourceButton
          month={latestSnapshot?.month}
          loading={snapshotLoading}
          label="Use rates"
          onClick={resetSnapshotRates}
        />
      </div>

      <div className="calculator-shell fx-deals">
        <section className={`calculator-panel fx-deal${comparison.betterDeal === 'A' ? ' is-best' : ''}`}>
          <h3>Deal A</h3>
          <div className="calculator-field-grid">
            <CalculatorField
              label={`Price per ${formatValue(basis, 0)} ${toCurrency}`}
              value={rateA}
              onChange={setRateAOverride}
              suffix={fromCurrency}
              hint={rateAOverride === null && snapshotQuote !== null
                ? `Rate from ${latestSnapshot?.month}`
                : undefined}
            />
            <CalculatorField label="Fee" value={feeA} onChange={setFeeA} suffix="%" />
          </div>
          <ResultMetric
            primary
            tone={comparison.betterDeal === 'A' ? 'positive' : 'neutral'}
            label="You receive"
            value={formatMoney(comparison.dealA.receivedAmount, toCurrency)}
          />
          <small className="fx-effective-rate">
            Effective price: {formatValue(comparison.dealA.effectiveRate, 6)} {fromCurrency} per {formatValue(basis, 0)} {toCurrency}
          </small>
        </section>

        <section className={`calculator-panel fx-deal${comparison.betterDeal === 'B' ? ' is-best' : ''}`}>
          <h3>Deal B</h3>
          <div className="calculator-field-grid">
            <CalculatorField
              label={`Price per ${formatValue(basis, 0)} ${toCurrency}`}
              value={rateB}
              onChange={setRateBOverride}
              suffix={fromCurrency}
              hint={rateBOverride === null && snapshotQuote !== null
                ? `Rate from ${latestSnapshot?.month}`
                : undefined}
            />
            <CalculatorField label="Fee" value={feeB} onChange={setFeeB} suffix="%" />
          </div>
          <ResultMetric
            primary
            tone={comparison.betterDeal === 'B' ? 'positive' : 'neutral'}
            label="You receive"
            value={formatMoney(comparison.dealB.receivedAmount, toCurrency)}
          />
          <small className="fx-effective-rate">
            Effective price: {formatValue(comparison.dealB.effectiveRate, 6)} {fromCurrency} per {formatValue(basis, 0)} {toCurrency}
          </small>
        </section>
      </div>

      <div className={`fx-comparison-result${comparison.betterDeal === 'equal' ? '' : ' has-winner'}`}>
        <ArrowLeftRight size={18} />
        <div>
          <strong>{winner}</strong>
          <span>
            Difference: {formatMoney(Math.abs(comparison.difference), toCurrency)}
            {' · '}
            {formatValue(comparison.differencePercent)}% more currency for the same budget
          </span>
        </div>
      </div>
    </ToolModal>
  );
}
