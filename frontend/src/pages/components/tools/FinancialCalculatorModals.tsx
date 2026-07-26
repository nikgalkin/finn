import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRightLeft,
  CircleCheck,
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
  compareFxDealsForTarget,
  suggestGoalTarget,
  suggestMonthlyContribution,
  type RebalanceItem
} from '../../../lib/financialCalculators';
import {
  buildSnapshotCurrencyRebalanceRows,
  buildSnapshotRebalanceRows,
  buildSnapshotReturnFlows,
  getSnapshotCurrencyHolding,
  getSnapshotFxQuote,
  getSnapshotPortfolioTotal
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
  const [capitalSource, setCapitalSource] = useState<'portfolio' | 'currency'>('portfolio');
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
    () => capitalSource === 'portfolio'
      ? getSnapshotPortfolioTotal(latestSnapshot, currency)
      : getSnapshotCurrencyHolding(latestSnapshot, currency),
    [capitalSource, currency, latestSnapshot]
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
        <SegmentedControl
          compact
          value={capitalSource}
          onChange={value => {
            setCapitalSource(value);
            setStartingCapitalOverride(null);
            setMonthlyContributionOverride(null);
            setTargetAmountOverride(null);
          }}
          options={[
            { value: 'portfolio', label: 'Whole portfolio' },
            { value: 'currency', label: `${currency} held` }
          ]}
        />
        <SnapshotSourceButton
          month={latestSnapshot?.month}
          loading={snapshotLoading}
          label={capitalSource === 'portfolio' ? 'Use portfolio' : `Use ${currency} held`}
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
                ? capitalSource === 'portfolio'
                  ? `Whole portfolio valued in ${currency} · ${latestSnapshot.month}`
                  : `${currency} held without converting other currencies`
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
  const [grouping, setGrouping] = useState<'organizations' | 'currencies'>('organizations');
  const [additionalCash, setAdditionalCash] = useState<NumericValue>(100_000);
  const [buyOnly, setBuyOnly] = useState(true);
  const [rows, setRows] = useState<RebalanceDraft[]>(INITIAL_REBALANCE_ROWS);
  const snapshotInitialized = useRef(false);
  const currency = currencyOverride || baseCurrency;

  const buildRowsFromSnapshot = useCallback((
    nextCurrency: string,
    nextGrouping: 'organizations' | 'currencies',
    targets: ReadonlyMap<string, number> = new Map()
  ) => nextGrouping === 'organizations'
    ? buildSnapshotRebalanceRows(latestSnapshot, nextCurrency, targets)
    : buildSnapshotCurrencyRebalanceRows(latestSnapshot, nextCurrency, targets), [latestSnapshot]);

  useEffect(() => {
    if (snapshotLoading || snapshotInitialized.current || !latestSnapshot) return;
    const snapshotRows = buildRowsFromSnapshot(currency, grouping);
    if (snapshotRows.length > 0) setRows(snapshotRows);
    snapshotInitialized.current = true;
  }, [buildRowsFromSnapshot, currency, grouping, latestSnapshot, snapshotLoading]);

  const loadSnapshotRows = (
    nextCurrency: string,
    nextGrouping = grouping,
    preserveTargets = true
  ) => {
    if (!latestSnapshot) return;
    const targets = preserveTargets
      ? new Map(rows.map(row => [row.id, numeric(row.targetPercent)]))
      : new Map<string, number>();
    const snapshotRows = buildRowsFromSnapshot(nextCurrency, nextGrouping, targets);
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

      <div className="rebalance-source-guide">
        <div>
          <strong>Build allocation from the latest snapshot</strong>
          <span>
            Choose a grouping, set the desired Target percentages to 100%, then review the suggested trades.
            Tags are not imported because one balance can carry several tags.
          </span>
        </div>
        <SegmentedControl
          compact
          value={grouping}
          onChange={value => {
            setGrouping(value);
            loadSnapshotRows(currency, value, false);
          }}
          options={[
            { value: 'organizations', label: 'Organizations' },
            { value: 'currencies', label: 'Currencies' }
          ]}
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
          <span>{grouping === 'organizations' ? 'Organization' : 'Currency'}</span>
          <span>Current</span><span>Target</span><span />
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
  const [amountMode, setAmountMode] = useState<'spend' | 'receive'>('spend');
  const [budget, setBudget] = useState<NumericValue>(100_000);
  const [targetReceiveOverride, setTargetReceiveOverride] = useState<NumericValue | null>(null);
  const [rateAOverride, setRateAOverride] = useState<NumericValue | null>(null);
  const [rateBOverride, setRateBOverride] = useState<NumericValue | null>(null);
  const [feeA, setFeeA] = useState<NumericValue>(0);
  const [feeB, setFeeB] = useState<NumericValue>(0);
  const fromCurrency = fromCurrencyOverride || baseCurrency;
  const toCurrency = toCurrencyOverride
    || (settings.secondaryCurrency
      && settings.secondaryCurrency !== fromCurrency
      && currencies.includes(settings.secondaryCurrency)
      ? settings.secondaryCurrency
      : '')
    || currencies.find(currency => currency !== fromCurrency)
    || fromCurrency;
  const snapshotQuote = getSnapshotFxQuote(
    latestSnapshot,
    fromCurrency,
    toCurrency
  );
  const quoteDirection = snapshotQuote?.direction ?? 'spend-per-buy';
  const rateA = rateAOverride ?? snapshotQuote?.rate ?? 7;
  const rateB = rateBOverride ?? snapshotQuote?.rate ?? 7;
  const usesCostQuote = quoteDirection === 'spend-per-buy';
  const ratePrompt = usesCostQuote
    ? `Enter how much 1 ${toCurrency} costs in ${fromCurrency}`
    : `Enter how much ${toCurrency} you receive for 1 ${fromCurrency}`;
  const rateLabel = usesCostQuote
    ? `Cost of 1 ${toCurrency}`
    : `${toCurrency} per 1 ${fromCurrency}`;

  const resetSnapshotRates = () => {
    setRateAOverride(null);
    setRateBOverride(null);
  };

  const resetCurrencyPair = () => {
    resetSnapshotRates();
    setTargetReceiveOverride(null);
  };

  const swapCurrencies = () => {
    setFromCurrencyOverride(toCurrency);
    setToCurrencyOverride(fromCurrency);
    resetCurrencyPair();
  };

  const comparison = useMemo(() => compareFxDeals({
    budget: numeric(budget),
    rate: Math.round(numeric(rateA) * 100) / 100,
    feePercent: numeric(feeA),
    quoteDirection
  }, {
    budget: numeric(budget),
    rate: Math.round(numeric(rateB) * 100) / 100,
    feePercent: numeric(feeB),
    quoteDirection
  }), [budget, feeA, feeB, quoteDirection, rateA, rateB]);
  const targetReceive = targetReceiveOverride ?? comparison.dealA.receivedAmount;
  const targetComparison = useMemo(() => compareFxDealsForTarget({
    targetAmount: numeric(targetReceive),
    rate: Math.round(numeric(rateA) * 100) / 100,
    feePercent: numeric(feeA),
    quoteDirection
  }, {
    targetAmount: numeric(targetReceive),
    rate: Math.round(numeric(rateB) * 100) / 100,
    feePercent: numeric(feeB),
    quoteDirection
  }), [feeA, feeB, quoteDirection, rateA, rateB, targetReceive]);
  const betterDeal = amountMode === 'spend'
    ? comparison.betterDeal
    : targetComparison.betterDeal;
  const activeDifference = amountMode === 'spend'
    ? comparison.difference
    : targetComparison.difference;
  const activeDifferencePercent = amountMode === 'spend'
    ? comparison.differencePercent
    : targetComparison.differencePercent;
  const winner = betterDeal === 'equal'
    ? 'Both offers give the same result'
    : amountMode === 'spend'
      ? `Offer ${betterDeal} gives more ${toCurrency}`
      : `Offer ${betterDeal} costs less ${fromCurrency}`;
  const effectiveRateDifference = Number.isFinite(comparison.dealA.effectiveRate)
    && Number.isFinite(comparison.dealB.effectiveRate)
    ? Math.abs(comparison.dealA.effectiveRate - comparison.dealB.effectiveRate)
    : null;
  const effectiveRateBaseline = Math.min(
    comparison.dealA.effectiveRate,
    comparison.dealB.effectiveRate
  );
  const effectiveRateDifferencePercent = effectiveRateDifference !== null
    && Number.isFinite(effectiveRateBaseline)
    && effectiveRateBaseline > 0
    ? effectiveRateDifference / effectiveRateBaseline * 100
    : null;
  const effectiveRateUnit = usesCostQuote
    ? `${fromCurrency} per 1 ${toCurrency}`
    : `${toCurrency} per 1 ${fromCurrency}`;

  return (
    <ToolModal
      title="FX Deal Comparator"
      subtitle="Compare two exchange quotes by the amount you spend or want to receive"
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
            resetCurrencyPair();
          }}
          options={currencies}
          disabled={currenciesLoading}
        />
        <button
          type="button"
          className="btn fx-swap-button"
          title="Swap spend and buy currencies"
          aria-label="Swap spend and buy currencies"
          onClick={swapCurrencies}
        >
          <ArrowRightLeft size={15} />
        </button>
        <CurrencyField
          label="Buy currency"
          value={toCurrency}
          onChange={value => {
            setToCurrencyOverride(value);
            resetCurrencyPair();
          }}
          options={currencies}
          disabled={currenciesLoading}
        />
        <div className="calculator-field fx-amount-mode">
          <span>Calculate by</span>
          <SegmentedControl
            compact
            value={amountMode}
            onChange={value => {
              if (value === 'receive' && targetReceiveOverride === null) {
                setTargetReceiveOverride(
                  Math.round(comparison.dealA.receivedAmount * 100) / 100
                );
              }
              setAmountMode(value);
            }}
            options={[
              { value: 'spend', label: 'Spend' },
              { value: 'receive', label: 'Receive' }
            ]}
          />
        </div>
        {amountMode === 'spend'
          ? <CalculatorField label="You spend" value={budget} onChange={setBudget} suffix={fromCurrency} />
          : (
            <CalculatorField
              label="You receive"
              value={targetReceive}
              onChange={setTargetReceiveOverride}
              suffix={toCurrency}
            />
          )}
      </div>

      <div className="fx-rate-guide">
        <div>
          <strong>{ratePrompt}</strong>
          <span>
            {snapshotQuote && latestSnapshot
              ? `Snapshot reference: ${formatValue(snapshotQuote.rate)} ${usesCostQuote ? fromCurrency : toCurrency} · ${latestSnapshot.month}. `
              : ''}
            {usesCostQuote
              ? 'A lower effective price is the better offer after fees.'
              : 'A higher effective rate is the better offer after fees.'}
          </span>
        </div>
        <SnapshotSourceButton
          month={latestSnapshot?.month}
          loading={snapshotLoading}
          label="Reset to reference"
          onClick={resetSnapshotRates}
        />
      </div>

      <div className="calculator-shell fx-deals">
        <section className={`calculator-panel fx-deal is-offer-a${betterDeal === 'A' ? ' is-best' : ''}`}>
          <div className="fx-deal-heading">
            <h3>Offer A</h3>
            <span className={betterDeal === 'A' ? 'is-best-badge' : undefined}>
              {betterDeal === 'A' && <CircleCheck size={12} />}
              {betterDeal === 'equal'
                ? 'Same result'
                : betterDeal === 'A' ? 'Best offer' : 'First quote'}
            </span>
          </div>
          <div className="calculator-field-grid">
            <CalculatorField
              label={rateLabel}
              value={rateA}
              onChange={setRateAOverride}
              suffix={usesCostQuote ? fromCurrency : toCurrency}
              hint={rateAOverride === null && snapshotQuote
                ? `Rate from ${latestSnapshot?.month}`
                : undefined}
            />
            <CalculatorField label="Fee" value={feeA} onChange={setFeeA} suffix="%" />
          </div>
          <ResultMetric
            primary
            tone={betterDeal === 'A' ? 'positive' : 'neutral'}
            label={amountMode === 'spend' ? 'You receive' : 'You spend'}
            value={amountMode === 'spend'
              ? formatMoney(comparison.dealA.receivedAmount, toCurrency)
              : formatMoney(targetComparison.dealA.spendAmount, fromCurrency)}
          />
          <small className="fx-effective-rate">
            {usesCostQuote ? 'Effective price' : 'Effective rate'}:
            {' '}
            {formatValue(comparison.dealA.effectiveRate, 6)}
            {' '}
            {usesCostQuote ? `${fromCurrency} per 1 ${toCurrency}` : `${toCurrency} per 1 ${fromCurrency}`}
          </small>
        </section>

        <section className={`calculator-panel fx-deal is-offer-b${betterDeal === 'B' ? ' is-best' : ''}`}>
          <div className="fx-deal-heading">
            <h3>Offer B</h3>
            <span className={betterDeal === 'B' ? 'is-best-badge' : undefined}>
              {betterDeal === 'B' && <CircleCheck size={12} />}
              {betterDeal === 'equal'
                ? 'Same result'
                : betterDeal === 'B' ? 'Best offer' : 'Second quote'}
            </span>
          </div>
          <div className="calculator-field-grid">
            <CalculatorField
              label={rateLabel}
              value={rateB}
              onChange={setRateBOverride}
              suffix={usesCostQuote ? fromCurrency : toCurrency}
              hint={rateBOverride === null && snapshotQuote
                ? `Rate from ${latestSnapshot?.month}`
                : undefined}
            />
            <CalculatorField label="Fee" value={feeB} onChange={setFeeB} suffix="%" />
          </div>
          <ResultMetric
            primary
            tone={betterDeal === 'B' ? 'positive' : 'neutral'}
            label={amountMode === 'spend' ? 'You receive' : 'You spend'}
            value={amountMode === 'spend'
              ? formatMoney(comparison.dealB.receivedAmount, toCurrency)
              : formatMoney(targetComparison.dealB.spendAmount, fromCurrency)}
          />
          <small className="fx-effective-rate">
            {usesCostQuote ? 'Effective price' : 'Effective rate'}:
            {' '}
            {formatValue(comparison.dealB.effectiveRate, 6)}
            {' '}
            {usesCostQuote ? `${fromCurrency} per 1 ${toCurrency}` : `${toCurrency} per 1 ${fromCurrency}`}
          </small>
        </section>
      </div>

      <div className="fx-rate-comparison">
        <div className="fx-rate-comparison-heading">
          <strong>{usesCostQuote ? 'Effective price comparison' : 'Effective rate comparison'}</strong>
          <span>Includes offer fees</span>
        </div>
        <div className="fx-rate-comparison-values">
          <div className="fx-rate-value is-offer-a">
            <span>Offer A</span>
            <strong>{formatValue(comparison.dealA.effectiveRate, 6)}</strong>
          </div>
          <div className="fx-rate-gap">
            <span>Difference</span>
            <strong>
              {effectiveRateDifference === null ? '—' : formatValue(effectiveRateDifference, 6)}
              <small>{effectiveRateUnit}</small>
            </strong>
            <em>
              {effectiveRateDifferencePercent === null
                ? '—'
                : `${formatValue(effectiveRateDifferencePercent)}%`}
            </em>
          </div>
          <div className="fx-rate-value is-offer-b">
            <span>Offer B</span>
            <strong>{formatValue(comparison.dealB.effectiveRate, 6)}</strong>
          </div>
        </div>
      </div>

      <div className={`fx-comparison-result${betterDeal === 'equal' ? '' : ' has-winner'}`}>
        <ArrowLeftRight size={18} />
        <div>
          <strong>{winner}</strong>
          {betterDeal === 'equal'
            ? (
              <span>
                {amountMode === 'spend'
                  ? `Both return ${formatMoney(comparison.dealA.receivedAmount, toCurrency)} after fees.`
                  : `Both require ${formatMoney(targetComparison.dealA.spendAmount, fromCurrency)} after fees.`}
              </span>
            )
            : (
              <span>
                {amountMode === 'spend'
                  ? `The better offer returns ${formatMoney(Math.abs(activeDifference), toCurrency)} more`
                  : `The better offer requires ${formatMoney(Math.abs(activeDifference), fromCurrency)} less`}
                {' · '}
                {formatValue(activeDifferencePercent)}% advantage
                {amountMode === 'spend' ? ' for the same budget' : ' for the same target'}
              </span>
            )}
        </div>
      </div>
    </ToolModal>
  );
}
