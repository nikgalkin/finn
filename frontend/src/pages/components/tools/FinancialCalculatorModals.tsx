import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  ArrowRightLeft,
  ChevronDown,
  CircleCheck,
  Database,
  Landmark,
  Plus,
  RefreshCw,
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
  compareDepositOffers,
  compareFxDeals,
  compareFxDealsForTarget,
  normalizeTargetPercents,
  signReturnFlow,
  suggestGoalTarget,
  suggestMonthlyContribution,
  type DepositCompounding,
  type RebalanceItem,
  type ReturnFlowKind
} from '../../../lib/financialCalculators';
import {
  buildSnapshotCurrencyRebalanceRows,
  buildSnapshotRebalanceRows,
  buildSnapshotReturnFlows,
  getSnapshotConversionRate,
  getSnapshotCurrencyHolding,
  getSnapshotFxQuote,
  getSnapshotPortfolioTotal
} from '../../../lib/calculatorSnapshotDefaults';
import {
  fetchLatestCurrencyRates,
  getFetchedCurrencyQuote,
  type FetchedCurrencyQuote,
} from '../../../lib/exchangeRates';
import { orientExchangeRate } from '../../../lib/finance';
import { parseNumberExpression } from '../../../lib/numberExpression';
import { useFlowEntries } from '../../../hooks/useFlowEntries';
import { useSettings } from '../../../hooks/useSettings';
import { useSnapshots } from '../../../hooks/useSnapshots';
import { AppSelect } from '../AppSelect';
import { AmountInput } from '../AmountInput';
import { HelpTooltip } from '../HelpTooltip';
import { Spinner } from '../PageLoader';
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
  help?: ReactNode;
  maximumFractionDigits?: number;
};

function CalculatorField({
  label,
  value,
  onChange,
  suffix,
  hint,
  help,
  maximumFractionDigits = 2
}: CalculatorFieldProps) {
  return (
    <label className="calculator-field">
      <span>
        <span title={label}>{label}</span>
        {help && <HelpTooltip text={help} ariaLabel={`${label} help`} width={300} />}
      </span>
      <div className="calculator-input">
        <AmountInput
          value={value}
          onChange={onChange}
          maximumFractionDigits={maximumFractionDigits}
          ariaLabel={label}
        />
        {suffix && <b>{suffix}</b>}
      </div>
      {hint && <small title={hint}>{hint}</small>}
    </label>
  );
}

function ChoiceField<Value extends string>({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: Value;
  onChange: (value: Value) => void;
  options: { value: Value; label: string }[];
}) {
  const selectOptions = useMemo(
    () => options.map(option => ({ value: option.value, label: option.label })),
    [options]
  );

  return (
    <label className="calculator-field">
      <span><span title={label}>{label}</span></span>
      <AppSelect
        ariaLabel={label}
        value={value}
        onChange={next => onChange(next as Value)}
        options={selectOptions}
        placeholder={label}
        width="100%"
        dropdownMatchTriggerWidth
        height="34px"
        textAlign="left"
      />
    </label>
  );
}

const panelStorageKey = (id: string) => `finn:calculator-panel:${id}`;

const readPanelExpanded = (id: string) => {
  try {
    return window.localStorage.getItem(panelStorageKey(id)) === 'expanded';
  } catch {
    return false;
  }
};

const writePanelExpanded = (id: string, expanded: boolean) => {
  try {
    window.localStorage.setItem(panelStorageKey(id), expanded ? 'expanded' : 'collapsed');
  } catch {
    return;
  }
};

function useExpandablePanel(id: string) {
  const [expanded, setExpanded] = useState(() => readPanelExpanded(id));

  return {
    expanded,
    toggle: () => setExpanded(current => {
      writePanelExpanded(id, !current);
      return !current;
    })
  };
}

function CalculatorGuide({
  id,
  steps,
  actions
}: {
  id: string;
  steps: ReactNode[];
  actions?: ReactNode;
}) {
  const { expanded, toggle } = useExpandablePanel(id);

  return (
    <div className={`calculator-guide${expanded ? ' is-expanded' : ''}`}>
      <div className="calculator-guide-copy">
        <button type="button" className="calculator-guide-toggle" aria-expanded={expanded} onClick={toggle}>
          <ChevronDown size={13} />
          How to use it
        </button>
        {expanded && (
          <ol>
            {steps.map((step, index) => <li key={index}><span>{step}</span></li>)}
          </ol>
        )}
      </div>
      {actions && <div className="calculator-guide-actions">{actions}</div>}
    </div>
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
  const selectOptions = useMemo(
    () => options.map((option, index) => ({ value: option, primary: index === 0 })),
    [options]
  );

  return (
    <label className="calculator-field calculator-currency-field">
      <span><span title={label}>{label}</span></span>
      <AppSelect
        ariaLabel={label}
        value={value}
        onChange={onChange}
        options={selectOptions}
        placeholder="Currency"
        searchable
        searchPlaceholder="Find currency…"
        width="100%"
        dropdownWidth={180}
        height="34px"
        textAlign="left"
        disabled={disabled}
      />
    </label>
  );
}

function useCalculatorCurrencies() {
  const { settings, loading: settingsLoading } = useSettings();
  const baseCurrency = settings.baseCurrency || settings.currencies[0] || 'RUB';
  const { snapshots, loading: snapshotsLoading } = useSnapshots({ sort: 'desc', baseCurrency });
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
  aside,
  tone = 'neutral',
  primary = false
}: {
  label: string;
  value: string;
  aside?: ReactNode;
  tone?: 'neutral' | 'positive' | 'negative' | 'accent';
  primary?: boolean;
}) {
  return (
    <div className={`calculator-result is-${tone}${primary ? ' is-primary' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {aside && <div className="calculator-result-aside">{aside}</div>}
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
      accent="var(--diff-positive)"
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
              help={`Whole portfolio converts every holding into ${currency} at the snapshot rates. ${currency} held counts only what is already in ${currency}, leaving other currencies out.`}
              hint={startingCapitalOverride === null && latestSnapshot
                ? capitalSource === 'portfolio'
                  ? `Portfolio · ${latestSnapshot.month}`
                  : `${currency} held · ${latestSnapshot.month}`
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
                    ? '1% of current capital'
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
  const balanced = result.tradeVolume < 0.01;

  const updateRow = (id: string, patch: Partial<RebalanceDraft>) => {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const applyTargets = (weights: number[]) => {
    const percents = normalizeTargetPercents(weights);
    setRows(current => current.map((row, index) => ({ ...row, targetPercent: percents[index] ?? 0 })));
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
          <input id="rebalance-buy-only" name="rebalance-buy-only" type="checkbox" checked={buyOnly} onChange={event => setBuyOnly(event.target.checked)} />
          <span><b>Buy only</b><small>Do not recommend sales</small></span>
        </label>
        <SnapshotSourceButton
          month={latestSnapshot?.month}
          loading={snapshotLoading}
          label="Refresh values"
          onClick={() => loadSnapshotRows(currency)}
        />
      </div>

      <CalculatorGuide
        id="rebalancer"
        steps={[
          <>Pick a grouping — the rows below are filled from the <b>{latestSnapshot?.month || 'latest'}</b> snapshot, and <b>Target</b> starts at your current allocation, so nothing needs trading yet.</>,
          <>Change <b>Target</b> to the allocation you want. The three buttons below fill it for you; the total has to reach 100%.</>,
          <>Optionally enter new cash you are about to invest, and keep <b>Buy only</b> on if you would rather not sell anything.</>,
          <>Follow the <b>Buy</b> and <b>Sell</b> amounts at the bottom. Nothing is written back to your data — this is a plan, not a transaction.</>
        ]}
        actions={(
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
        )}
      />

      <div className={`rebalance-targets-bar${targetsValid ? '' : ' is-incomplete'}`}>
        <div>
          <strong>
            Target allocation · {formatValue(result.targetPercentTotal)}%
          </strong>
          <span>
            {targetsValid
              ? 'Targets add up to 100%, so the suggested trades are complete.'
              : `${formatValue(Math.abs(100 - result.targetPercentTotal))}% ${result.targetPercentTotal > 100 ? 'over' : 'still unallocated'} — the trades below are incomplete until the total is 100%.`}
          </span>
        </div>
        <div className="rebalance-target-actions">
          <button
            type="button"
            className="btn"
            title="Set every target to the share it holds today"
            onClick={() => applyTargets(items.map(item => item.currentAmount))}
          >
            Match current
          </button>
          <button
            type="button"
            className="btn"
            title="Split the portfolio evenly across the rows"
            onClick={() => applyTargets(items.map(() => 1))}
          >
            Equal split
          </button>
          <button
            type="button"
            className="btn"
            title="Keep the proportions you typed and scale them to 100%"
            disabled={targetsValid}
            onClick={() => applyTargets(items.map(item => item.targetPercent))}
          >
            Scale to 100%
          </button>
        </div>
      </div>

      <div className="rebalance-editor">
        <div className="rebalance-heading">
          <span>{grouping === 'organizations' ? 'Organization' : 'Currency'}</span>
          <span>Current</span><span>Target</span><span />
        </div>
        {rows.map(row => (
          <div className="rebalance-edit-row" key={row.id}>
            <input
              id={`rebalance-${row.id}-label`}
              name={`rebalance-${row.id}-label`}
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
          <ResultMetric
            label={buyOnly ? 'To buy in total' : 'To trade in total'}
            value={formatMoney(result.tradeVolume, currency)}
            tone={balanced ? 'neutral' : 'accent'}
          />
          <ResultMetric label="Largest drift" value={formatRate(result.largestDriftPercent)} />
          {buyOnly && result.unallocatedCash > 0 && (
            <ResultMetric label="Cash left over" value={formatMoney(result.unallocatedCash, currency)} />
          )}
        </div>
        {balanced && (
          <p className="rebalance-balanced-note">
            Every row already sits on its target, so there is nothing to trade. Change a target
            percentage or add new cash to see suggestions.
          </p>
        )}
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
  kind: ReturnFlowKind;
  amount: NumericValue;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const yearAgoIso = () => {
  const value = new Date();
  value.setFullYear(value.getFullYear() - 1);
  return value.toISOString().slice(0, 10);
};

const RETURN_FLOW_KINDS: { value: ReturnFlowKind; label: string }[] = [
  { value: 'open', label: 'Opening value' },
  { value: 'deposit', label: 'Money in' },
  { value: 'withdrawal', label: 'Money out' },
  { value: 'close', label: 'Final value' }
];

const formatPeriod = (days: number) => {
  if (!Number.isFinite(days) || days <= 0) return '—';
  if (days < 60) return `${formatValue(days, 0)} days`;
  if (days < 730) return `${formatValue(days / 30.4375, 1)} months`;
  return `${formatValue(days / 365.25, 1)} years`;
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
    { id: 'start', date: yearAgoIso(), kind: 'open', amount: 1_000_000 },
    { id: 'end', date: todayIso(), kind: 'close', amount: 1_150_000 }
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
    amount: signReturnFlow(flow.kind, numeric(flow.amount))
  }))), [flows]);

  const updateFlow = (id: string, patch: Partial<CashFlowDraft>) => {
    setFlows(current => current.map(flow => flow.id === id ? { ...flow, ...patch } : flow));
  };

  return (
    <ToolModal
      title="Return Calculator"
      subtitle="Work out the annual return behind a set of dated deposits, withdrawals and values"
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
            kind: 'deposit',
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
      <CalculatorGuide
        id="return"
        steps={[
          <>Every row is one movement of money between you and the portfolio, on the day it happened. Pick the row type and type a <b>positive</b> amount — the sign is applied for you.</>,
          <>Open with <b>Opening value</b> (what the portfolio was worth at the start) and close with <b>Final value</b> (what it is worth today).</>,
          <>In between, add <b>Money in</b> for deposits and <b>Money out</b> for withdrawals. Growth inside the portfolio is never a row — that is exactly what the calculator solves for.</>,
          <>The result is XIRR: the annual rate that makes those dated amounts add up to the final value, so <b>when</b> money arrived matters as much as how much.</>
        ]}
      />

      {previousSnapshot && latestSnapshot && snapshotFlows.length >= 2 && (
        <p className="calculator-note return-calculator-note">
          Prefilled from {previousSnapshot.month} → {latestSnapshot.month} with{' '}
          {snapshotFlows.length - 2} recorded external flow{snapshotFlows.length - 2 === 1 ? '' : 's'}
          {' '}from Cash Flow, valued in {currency}.
        </p>
      )}

      <div className="return-flow-editor">
        <div className="return-flow-heading">
          <span>Date</span><span>Row type</span><span>Amount</span><span />
        </div>
        {flows.map(flow => (
          <div className="return-flow-row" key={flow.id}>
            <input
              id={`return-flow-${flow.id}-date`}
              name={`return-flow-${flow.id}-date`}
              type="date"
              className="input"
              value={flow.date}
              aria-label="Cash flow date"
              onChange={event => updateFlow(flow.id, { date: event.target.value })}
            />
            <AppSelect
              ariaLabel={`Row type for ${flow.date}`}
              value={flow.kind}
              onChange={value => updateFlow(flow.id, { kind: value as ReturnFlowKind })}
              options={RETURN_FLOW_KINDS}
              placeholder="Row type"
              width="100%"
              dropdownMatchTriggerWidth
              height="34px"
              textAlign="left"
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
          label="Annualized (XIRR)"
          value={formatRate(result.annualizedReturnPercent)}
          tone={result.annualizedReturnPercent === null ? 'neutral' : result.annualizedReturnPercent >= 0 ? 'positive' : 'negative'}
        />
        <ResultMetric
          label="Total over the period"
          value={formatRate(result.simpleReturnPercent)}
          tone={result.simpleReturnPercent === null ? 'neutral' : result.simpleReturnPercent >= 0 ? 'positive' : 'negative'}
        />
        <ResultMetric label="Period" value={formatPeriod(result.periodDays)} />
        <ResultMetric
          label="Net profit"
          value={formatMoney(result.netProfit, currency)}
          tone={result.netProfit >= 0 ? 'positive' : 'negative'}
        />
        <ResultMetric label="Opening value + money in" value={formatMoney(result.totalInvested, currency)} />
        <ResultMetric label="Final value + money out" value={formatMoney(result.totalReturned, currency)} />
      </div>

      {result.annualizedReturnPercent === null && (
        <div className="tool-message is-warning">
          <div>
            <strong>A return cannot be calculated yet</strong>
            <span>
              At least one row has to put money in (Opening value or Money in) and one has to take it
              back out (Final value or Money out), on two different dates.
            </span>
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
  const [fetchedQuoteA, setFetchedQuoteA] = useState<FetchedCurrencyQuote | null>(null);
  const [fetchingLatestRate, setFetchingLatestRate] = useState(false);
  const latestRateRequestRef = useRef(0);
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
  const quoteDirection = fetchedQuoteA?.direction ?? snapshotQuote?.direction ?? 'spend-per-buy';
  const snapshotReferenceRate = !snapshotQuote
    ? null
    : snapshotQuote.direction === quoteDirection
      ? snapshotQuote.rate
      : 1 / snapshotQuote.rate;
  const rateA = rateAOverride ?? fetchedQuoteA?.rate ?? snapshotReferenceRate ?? 7;
  const rateB = rateBOverride ?? snapshotReferenceRate ?? 7;
  const usesCostQuote = quoteDirection === 'spend-per-buy';
  const ratePrompt = usesCostQuote
    ? `Enter how much 1 ${toCurrency} costs in ${fromCurrency}`
    : `Enter how much ${toCurrency} you receive for 1 ${fromCurrency}`;
  const rateLabel = usesCostQuote
    ? `Cost of 1 ${toCurrency}`
    : `${toCurrency} per 1 ${fromCurrency}`;

  const resetSnapshotRates = () => {
    latestRateRequestRef.current += 1;
    setFetchingLatestRate(false);
    setFetchedQuoteA(null);
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

  const fetchLatestRate = async () => {
    const requestID = latestRateRequestRef.current + 1;
    latestRateRequestRef.current = requestID;
    setFetchingLatestRate(true);

    try {
      const rates = await fetchLatestCurrencyRates(fromCurrency);
      if (latestRateRequestRef.current !== requestID) return;
      const fetchedQuote = getFetchedCurrencyQuote(rates, toCurrency, snapshotQuote?.direction);
      if (fetchedQuote === null) {
        throw new Error(`Exchange rate response does not contain ${toCurrency}`);
      }

      setFetchedQuoteA(fetchedQuote);
      setRateAOverride(null);
    } catch (error) {
      if (latestRateRequestRef.current !== requestID) return;
      console.error(error);
      alert(`Failed to fetch the latest ${fromCurrency}/${toCurrency} rate`);
    } finally {
      if (latestRateRequestRef.current === requestID) setFetchingLatestRate(false);
    }
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
  const rateHint = (override: NumericValue | null, fetched = false) => {
    if (override !== null) return 'Custom rate';
    if (fetched) return 'Latest fetched rate';
    if (!snapshotQuote) return undefined;
    return `Rate from ${latestSnapshot?.month}`;
  };

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
      </div>

      <div className="fx-rate-guide">
        <div>
          <strong>{ratePrompt}</strong>
          <span>
            {snapshotQuote && latestSnapshot
              ? `Snapshot reference: ${formatValue(snapshotReferenceRate ?? snapshotQuote.rate)} ${usesCostQuote ? fromCurrency : toCurrency} · ${latestSnapshot.month}. `
              : ''}
            {usesCostQuote
              ? 'A lower effective price is the better offer after fees.'
              : 'A higher effective rate is the better offer after fees.'}
          </span>
        </div>
        <div className="fx-rate-guide-actions">
          <button
            type="button"
            className="btn"
            disabled={fetchingLatestRate || fromCurrency === toCurrency}
            onClick={fetchLatestRate}
            title={`Fetch the latest ${fromCurrency}/${toCurrency} rate into Offer A`}
          >
            {fetchingLatestRate
              ? <Spinner label="Fetching latest exchange rate" size={13} />
              : <RefreshCw size={13} />}
            {fetchingLatestRate ? 'Fetching…' : 'Fetch Latest · Offer A'}
          </button>
          <SnapshotSourceButton
            month={latestSnapshot?.month}
            loading={snapshotLoading}
            label="Reset to reference"
            onClick={resetSnapshotRates}
          />
        </div>
      </div>

      <div className="calculator-shell offer-cards">
        <section className={`calculator-panel offer-card is-offer-a${betterDeal === 'A' ? ' is-best' : ''}`}>
          <div className="offer-card-heading">
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
              hint={rateHint(rateAOverride, fetchedQuoteA !== null)}
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

        <section className={`calculator-panel offer-card is-offer-b${betterDeal === 'B' ? ' is-best' : ''}`}>
          <div className="offer-card-heading">
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
              hint={rateHint(rateBOverride)}
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

      <div className="offer-comparison">
        <div className="offer-comparison-heading">
          <strong>{usesCostQuote ? 'Effective price comparison' : 'Effective rate comparison'}</strong>
          <span>Includes offer fees</span>
        </div>
        <div className="offer-comparison-values">
          <div className="offer-comparison-value is-offer-a">
            <span>Offer A</span>
            <strong>{formatValue(comparison.dealA.effectiveRate, 6)}</strong>
          </div>
          <div className="offer-comparison-gap">
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
          <div className="offer-comparison-value is-offer-b">
            <span>Offer B</span>
            <strong>{formatValue(comparison.dealB.effectiveRate, 6)}</strong>
          </div>
        </div>
      </div>

      <div className={`offer-verdict${betterDeal === 'equal' ? '' : ' has-winner'}`}>
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

type DepositOfferDraft = {
  currency: string;
  annualRate: NumericValue;
  compounding: DepositCompounding;
  taxRate: NumericValue;
  taxFreeInterest: NumericValue;
  exitRate: NumericValue | null;
};

type DepositSide = 'A' | 'B';

const DEPOSIT_COMPOUNDING_OPTIONS: { value: DepositCompounding; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
  { value: 'maturity', label: 'At maturity' }
];

const INITIAL_DEPOSIT_OFFERS: Record<DepositSide, DepositOfferDraft> = {
  A: { currency: '', annualRate: 16, compounding: 'monthly', taxRate: 13, taxFreeInterest: 0, exitRate: null },
  B: { currency: '', annualRate: 4, compounding: 'monthly', taxRate: 13, taxFreeInterest: 0, exitRate: null }
};

export function DepositComparatorCalculatorModal({ onClose }: { onClose: () => void }) {
  const {
    settings,
    baseCurrency,
    currencies,
    currenciesLoading,
    latestSnapshot,
    snapshotLoading
  } = useCalculatorCurrencies();
  const [currencyOverride, setCurrencyOverride] = useState('');
  const [investmentOverride, setInvestmentOverride] = useState<NumericValue | null>(null);
  const [termMonths, setTermMonths] = useState<NumericValue>(12);
  const [offers, setOffers] = useState(INITIAL_DEPOSIT_OFFERS);
  const currency = currencyOverride || baseCurrency;
  const snapshotHolding = getSnapshotCurrencyHolding(latestSnapshot, currency);
  const investment = investmentOverride ?? (snapshotHolding || 100_000);
  const fallbackSecondCurrency = (
    settings.secondaryCurrency
    && settings.secondaryCurrency !== currency
    && currencies.includes(settings.secondaryCurrency)
      ? settings.secondaryCurrency
      : ''
  ) || currencies.find(option => option !== currency) || currency;

  const patchOffer = (side: DepositSide, patch: Partial<DepositOfferDraft>) => {
    setOffers(current => ({ ...current, [side]: { ...current[side], ...patch } }));
  };

  const resolveOffer = (side: DepositSide) => {
    const draft = offers[side];
    const offerCurrency = draft.currency || (side === 'A' ? currency : fallbackSecondCurrency);
    const snapshotRate = getSnapshotConversionRate(latestSnapshot, offerCurrency, currency);
    const orientation = orientExchangeRate(offerCurrency, currency, snapshotRate ?? 1);
    const quotedRate = Math.round(orientation.rate * 100) / 100;
    const quotedExitRate = draft.exitRate ?? quotedRate;
    const toBaseRate = (quoted: number) => orientation.inverted
      ? quoted > 0 ? 1 / quoted : 0
      : quoted;
    return {
      draft,
      currency: offerCurrency,
      isForeign: offerCurrency !== currency,
      snapshotRate,
      orientation,
      quotedRate,
      quotedExitRate,
      entryRate: toBaseRate(quotedRate),
      exitRate: toBaseRate(numeric(quotedExitRate))
    };
  };

  const sides = { A: resolveOffer('A'), B: resolveOffer('B') };
  const toInput = (side: DepositSide) => ({
    investment: numeric(investment),
    months: numeric(termMonths),
    annualRatePercent: numeric(sides[side].draft.annualRate),
    compounding: sides[side].draft.compounding,
    taxRatePercent: numeric(sides[side].draft.taxRate),
    taxFreeInterest: numeric(sides[side].draft.taxFreeInterest),
    entryRate: sides[side].entryRate,
    exitRate: sides[side].exitRate
  });
  const comparison = compareDepositOffers(toInput('A'), toInput('B'));
  const results = { A: comparison.offerA, B: comparison.offerB };
  const breakEven = { A: comparison.breakEvenExitRateA, B: comparison.breakEvenExitRateB };
  const returnGap = Math.abs(
    comparison.offerA.netAnnualReturnPercent - comparison.offerB.netAnnualReturnPercent
  );

  const { expanded: workingExpanded, toggle: toggleWorking } = useExpandablePanel('deposit-working');

  const resetRates = () => {
    patchOffer('A', { exitRate: null });
    patchOffer('B', { exitRate: null });
  };

  const renderOffer = (side: DepositSide) => {
    const {
      draft,
      currency: offerCurrency,
      isForeign,
      snapshotRate,
      orientation,
      quotedRate,
      quotedExitRate
    } = sides[side];
    const result = results[side];
    const isBest = comparison.betterOffer === side;
    const rateUnit = `${orientation.toCurrency} per 1 ${orientation.fromCurrency}`;
    const mathBreakEven = breakEven[side];
    const breakEvenRate = mathBreakEven === null || mathBreakEven <= 0
      ? null
      : Math.round((orientation.inverted ? 1 / mathBreakEven : mathBreakEven) * 100) / 100;

    return (
      <section className={`calculator-panel offer-card is-offer-${side.toLowerCase()}${isBest ? ' is-best' : ''}`}>
        <div className="offer-card-heading">
          <h3>Offer {side}</h3>
          <span className={isBest ? 'is-best-badge' : undefined}>
            {isBest && <CircleCheck size={12} />}
            {comparison.betterOffer === 'equal'
              ? 'Same result'
              : isBest ? 'Best offer' : `${side === 'A' ? 'First' : 'Second'} deposit`}
          </span>
        </div>
        <div className="calculator-field-grid">
          <CurrencyField
            label="Deposit currency"
            value={offerCurrency}
            onChange={value => patchOffer(side, { currency: value, exitRate: null })}
            options={currencies}
            disabled={currenciesLoading}
          />
          <CalculatorField
            label="Annual rate"
            value={draft.annualRate}
            onChange={annualRate => patchOffer(side, { annualRate })}
            suffix="%"
          />
          <ChoiceField
            label="Interest added"
            value={draft.compounding}
            onChange={compounding => patchOffer(side, { compounding })}
            options={DEPOSIT_COMPOUNDING_OPTIONS}
          />
          <CalculatorField
            label="Tax on interest"
            value={draft.taxRate}
            onChange={taxRate => patchOffer(side, { taxRate })}
            suffix="%"
          />
          <CalculatorField
            label="Tax-free interest"
            value={draft.taxFreeInterest}
            onChange={taxFreeInterest => patchOffer(side, { taxFreeInterest })}
            suffix={offerCurrency}
            help={`Interest up to this amount is not taxed. The tax rate applies only to whatever is left above it, once, at the end of the term. Leave it at zero for a plain flat tax on all interest.`}
          />
          {isForeign && (
            <CalculatorField
              label="Rate at maturity"
              value={quotedExitRate}
              onChange={value => patchOffer(side, { exitRate: value })}
              suffix={orientation.toCurrency}
              help={`How much 1 ${orientation.fromCurrency} is worth in ${orientation.toCurrency} when the deposit closes. Left alone it repeats today's rate, which assumes the currency does not move.`}
              hint={`per 1 ${orientation.fromCurrency} · ${draft.exitRate !== null
                ? 'expected'
                : snapshotRate === null
                  ? 'type one'
                  : latestSnapshot?.month}`}
            />
          )}
        </div>
        <ResultMetric
          primary
          tone={result.profitInBase < 0 ? 'negative' : isBest ? 'positive' : 'neutral'}
          label={`Interest earned in ${currency}`}
          value={formatMoney(result.profitInBase, currency)}
          aside={(
            <div className="offer-facts">
              <div>
                <span>Net rate in {offerCurrency}</span>
                <b>{formatRate(result.netAnnualRatePercent)}</b>
              </div>
              <div>
                <span>In hand at maturity</span>
                <b>{formatMoney(result.maturityValueInBase, currency)}</b>
              </div>
            </div>
          )}
        />
        <div className={`offer-breakeven${isForeign ? '' : ' is-quiet'}`}>
          <span>{isForeign ? `Ties Offer ${side === 'A' ? 'B' : 'A'} at` : 'Currency risk'}</span>
          <b>
            {!isForeign
              ? `None — already in ${currency}`
              : breakEvenRate === null
                ? '—'
                : (
                  <>
                    {formatValue(breakEvenRate)} {rateUnit}
                    {quotedRate > 0 && (
                      <small>
                        {breakEvenRate >= quotedRate ? '+' : ''}
                        {formatValue((breakEvenRate / quotedRate - 1) * 100)}% vs today
                      </small>
                    )}
                  </>
                )}
          </b>
        </div>
        <button
          type="button"
          className="offer-breakdown-toggle"
          aria-expanded={workingExpanded}
          onClick={toggleWorking}
        >
          <ChevronDown size={12} />
          {workingExpanded ? 'Hide the working' : `Show the working in ${offerCurrency}`}
        </button>
        {workingExpanded && (
          <dl className="offer-breakdown is-working">
            <div><dt>Deposit</dt><dd>{formatMoney(result.principal, offerCurrency)}</dd></div>
            {isForeign && (
              <div><dt>Bought at</dt><dd>{formatValue(quotedRate)} {rateUnit}</dd></div>
            )}
            <div><dt>Interest before tax</dt><dd>{formatMoney(result.grossInterest, offerCurrency)}</dd></div>
            <div><dt>Tax withheld</dt><dd>{formatMoney(result.tax, offerCurrency)}</dd></div>
            <div><dt>Interest after tax</dt><dd>{formatMoney(result.netInterest, offerCurrency)}</dd></div>
            {isForeign && (
              <div><dt>At maturity</dt><dd>{formatMoney(result.maturityValue, offerCurrency)}</dd></div>
            )}
          </dl>
        )}
      </section>
    );
  };

  return (
    <ToolModal
      title="Deposit Comparator"
      subtitle="Compare two deposits across currencies, rates, compounding and tax"
      icon={Landmark}
      accent="#f0b429"
      onClose={onClose}
    >
      <div className="calculator-toolbar">
        <CurrencyField
          label="Compare in"
          value={currency}
          onChange={value => {
            setCurrencyOverride(value);
            setInvestmentOverride(null);
            resetRates();
          }}
          options={currencies}
          disabled={currenciesLoading}
        />
        <CalculatorField
          label="Amount to deposit"
          value={investment}
          onChange={setInvestmentOverride}
          suffix={currency}
          hint={investmentOverride === null && snapshotHolding
            ? `${currency} held · ${latestSnapshot?.month}`
            : undefined}
        />
        <CalculatorField label="Term" value={termMonths} onChange={setTermMonths} suffix="months" />
        <SnapshotSourceButton
          month={latestSnapshot?.month}
          loading={snapshotLoading}
          label="Reset rates"
          onClick={() => {
            setInvestmentOverride(null);
            resetRates();
          }}
        />
      </div>

      <CalculatorGuide
        id="deposit"
        steps={[
          <>The same <b>amount</b> goes into both offers, so whatever wins, wins on merit. A deposit in another currency is bought at today’s rate and sold back at maturity, and every result is stated in <b>{currency}</b>.</>,
          <>Per offer, set the rate, how often interest is <b>added to the balance</b>, and the tax. Tax is charged on interest above the tax-free amount, once, at the end.</>,
          <>Leave the <b>maturity rate</b> untouched to assume the currency does not move. Change it to test a specific expectation.</>,
          <>Read <b>Ties Offer …at</b>: that is the rate the currency has to reach for the two offers to end up equal. Anything beyond it and the foreign deposit wins.</>
        ]}
      />

      <div className="calculator-shell offer-cards">
        {renderOffer('A')}
        {renderOffer('B')}
      </div>

      <div className={`offer-verdict${comparison.betterOffer === 'equal' ? '' : ' has-winner'}`}>
        <Landmark size={18} />
        <div>
          <strong>
            {comparison.betterOffer === 'equal'
              ? 'Both deposits end up the same'
              : `Offer ${comparison.betterOffer} keeps more ${currency}`}
          </strong>
          <span>
            {comparison.betterOffer === 'equal'
              ? `Both return ${formatMoney(comparison.offerA.maturityValueInBase, currency)} after ${formatValue(numeric(termMonths))} months.`
              : `${formatMoney(Math.abs(comparison.difference), currency)} more after ${formatValue(numeric(termMonths))} months · ${formatValue(comparison.differencePercent)}% ahead.`}
          </span>
        </div>
        <div className="offer-verdict-rates">
          <div className="is-offer-a">
            <span>Offer A</span>
            <b>{formatRate(comparison.offerA.netAnnualReturnPercent)}</b>
          </div>
          <div className="offer-verdict-gap">
            <span>a year in {currency}</span>
            <b>{formatRate(returnGap)}</b>
          </div>
          <div className="is-offer-b">
            <span>Offer B</span>
            <b>{formatRate(comparison.offerB.netAnnualReturnPercent)}</b>
          </div>
        </div>
      </div>
    </ToolModal>
  );
}
