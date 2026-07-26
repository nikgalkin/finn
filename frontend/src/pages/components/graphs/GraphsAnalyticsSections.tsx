import { Fragment, memo, useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Activity, ArrowLeftRight, ArrowRight, BarChart3, Check, ChevronDown, ChevronRight, Clock, Landmark, Layers, LineChart as LineChartIcon, Percent, TrendingUp, X } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, ScatterChart, Scatter, CartesianGrid, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Legend, Cell, LabelList, ReferenceLine } from 'recharts';
import {
  formatCompact,
  formatFriendlyTime,
  formatMoney,
  formatNativeAmount,
  formatNumber,
  formatPercent,
  formatSigned,
  formatSignedMoney,
  getDeltaColor,
  getMoneyDeltaColor,
  getPercentDeltaColor
} from '../../../lib/format';
import type { TaggedReturnKind } from '../../../lib/finance';
import { getCurrencyColor, getTagColor } from '../../../types';
import { HelpTooltip } from '../HelpTooltip';
import { ModalPortal } from '../ModalPortal';
import { ScrollForMore } from '../ScrollForMore';
import { SegmentedControl } from '../SegmentedControl';
import { GraphTooltip, SimpleGraphTooltip } from './GraphTooltip';

type ChartDatum = Record<string, any>;

type SummaryStat = {
  label: string;
  value: number;
  suffix?: string;
  percent?: number;
  help: string;
};

type CapitalReturnMonth = {
  month: string;
  openingCapital: number;
  externalFlow: number;
  result: number;
  ratePercent: number | null;
  recordedMovements: number;
};

type CapitalReturnSummary = {
  organicChange: number;
  externalFlow: number;
  result: number;
  ratePercent: number;
  annualizedRatePercent: number | null;
  fxImpact: number;
  nonYieldingResult: number;
  monthsWithoutRecordedFlow: number;
  monthly: CapitalReturnMonth[];
};

type TagReturnStat = {
  tag: string;
  kind: TaggedReturnKind;
  result: number;
  ratePercent: number | null;
  monthly: Array<{ month: string; openingCapital: number; closingCapital: number; assignedFlow: number; result: number; ratePercent: number | null }>;
};

type OrganizationCurrencyBreakdown = {
  organization: string;
  totalBase: number;
  holdings: Array<{ currency: string; amount: number; valueBase: number; percent: number }>;
};

export type LegendGroup = 'currencies' | 'organizations' | 'tags';
export type HiddenLegendSeries = Record<LegendGroup, Record<string, boolean>>;

type GraphsAnalyticsSectionsProps = {
  baseCurrency: string;
  cashFlowEnabled: boolean;
  capitalReturnSummary?: CapitalReturnSummary;
  activeCurrencies: string[];
  allOrganizations: string[];
  allUsedCurrencies: string[];
  allUsedTags: string[];
  chartColors: string[];
  cashFlowMonthlyData: ChartDatum[];
  cashFlowEventsData: ChartDatum[];
  currencyDistributionData: ChartDatum[];
  currencyRatesData: ChartDatum[];
  decompositionData: ChartDatum[];
  hiddenSeries: HiddenLegendSeries;
  netWorthData: ChartDatum[];
  orgTrendData: ChartDatum[];
  organizationCurrencyBreakdown: OrganizationCurrencyBreakdown[];
  organizationCurrencyMonth?: string;
  summaryStats: SummaryStat[];
  tagDistributionData: ChartDatum[];
  tagReturnCoverage: { assigned: number; total: number; proportional: number; unattributedFlow: number; unknownAccounts: string[] };
  tagReturnStats: TagReturnStat[];
  uxMetricsData: ChartDatum[];
  handleLegendClickSmart: (group: LegendGroup, event: any, allKeys: string[]) => void;
  onOpenSnapshotDiff: (month: string) => void;
};

const LEGEND_STYLE = { cursor: 'pointer', fontSize: '12px', userSelect: 'none' as const };
const CARD_STYLE = { height: '350px', display: 'flex', flexDirection: 'column' as const };
const GRID_2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' };
const SECTION_TITLE_STYLE = { color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' };
const TAG_RETURN_ROW_HEIGHT = 40;
const TAG_RETURN_GROUP_TITLE_HEIGHT = 22;
const TAG_RETURN_LIST_MAX_HEIGHT = 208;

const SignedMoney = ({ value, suffix }: { value: number; suffix: string }) => (
  <span style={{ color: getMoneyDeltaColor(value) }}>{formatSignedMoney(value, suffix)}</span>
);

const normalizeStackData = (data: ChartDatum[], keys: string[]) => {
  return data.map(point => {
    const total = keys.reduce((sum, key) => sum + Number(point[key] || 0), 0);
    return {
      month: point.month,
      ...Object.fromEntries(keys.map(key => [key, total > 0 ? (Number(point[key] || 0) / total) * 100 : 0]))
    };
  });
};

const OrgCustomTooltip = ({ active, payload, label, allocationMode, baseCurrency }: any) => {
  return (
    <SimpleGraphTooltip
      active={active}
      payload={payload?.filter((item: any) => Number(item.value || 0) !== 0)}
      label={label}
      sortByValue
      formatter={(value, name) => [allocationMode === 'percent' ? `${Number(value).toFixed(1)}%` : formatMoney(Number(value), baseCurrency), name]}
      style={{ width: '280px', maxHeight: '260px' }}
    />
  );
};

const OrganizationCurrencyTooltip = ({ active, payload, baseCurrency }: any) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload as OrganizationCurrencyBreakdown;

  return (
    <GraphTooltip
      title={point.organization}
      titleValue={formatMoney(point.totalBase, baseCurrency)}
      rows={point.holdings.map(holding => ({
        key: holding.currency,
        label: holding.currency,
        markerColor: getCurrencyColor(holding.currency),
        value: `${formatNativeAmount(holding.amount)} ${holding.currency}`,
        detail: holding.currency !== baseCurrency ? `≈ ${formatMoney(holding.valueBase, baseCurrency)}` : undefined,
        trailing: `${holding.percent.toFixed(1)}%`
      }))}
      style={{ minWidth: '250px' }}
    />
  );
};

const renderCurrencySegmentLabel = (currency: string) => ({ x, y, width, height, value }: any) => {
  const percent = Number(value || 0);
  if (percent < 8 || Number(width) < 48) return null;
  const lightness = Number(getCurrencyColor(currency).match(/([\d.]+)%\s*\)$/)?.[1] || 50);
  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) + Number(height) / 2}
      fill={lightness >= 60 ? '#172033' : '#f8fafc'}
      fontSize="11"
      fontWeight="850"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ pointerEvents: 'none', letterSpacing: '0.01em' }}
    >
      {currency} · {percent.toFixed(0)}%
    </text>
  );
};

const OrganizationCurrencyChart = memo(function OrganizationCurrencyChart({
  baseCurrency,
  data,
  currencies,
  hiddenCurrencies,
  onLegendClick
}: {
  baseCurrency: string;
  data: ChartDatum[];
  currencies: string[];
  hiddenCurrencies: Record<string, boolean>;
  onLegendClick: (group: LegendGroup, event: any, allKeys: string[]) => void;
}) {
  return (
    <div data-testid="organization-currency-chart" style={{ flex: 1, minHeight: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 4 }} barCategoryGap="16%">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} stroke="var(--text-secondary)" tickFormatter={value => `${value}%`} style={{ fontSize: '11px' }} />
          <YAxis type="category" dataKey="organization" width={108} stroke="var(--text-secondary)" tickLine={false} style={{ fontSize: '11px', fontWeight: 700 }} />
          <Tooltip content={<OrganizationCurrencyTooltip baseCurrency={baseCurrency} />} cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }} />
          <Legend onClick={(event) => onLegendClick('currencies', event, currencies)} wrapperStyle={LEGEND_STYLE} />
          {currencies.map(currency => (
            <Bar
              key={currency}
              dataKey={currency}
              stackId="currency-share"
              name={currency}
              fill={getCurrencyColor(currency)}
              hide={hiddenCurrencies[currency]}
              maxBarSize={36}
              style={{ cursor: 'pointer' }}
              onClick={() => onLegendClick('currencies', { dataKey: currency }, currencies)}
            >
              <LabelList dataKey={currency} content={renderCurrencySegmentLabel(currency)} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

const CashFlowEventTooltip = ({ active, payload, baseCurrency }: any) => {
  if (!active || !payload || !payload.length) return null;
  const event = payload[0].payload;

  return (
    <GraphTooltip title={<span style={{ color: event.fill }}>{event.category}</span>} titleValue={event.month} style={{ minWidth: '220px', maxWidth: '300px' }}>
      <div className="graph-tooltip-highlight" style={{ color: event.fill }}>
        {formatSigned(Number(event.amount))} {baseCurrency}
      </div>
      <div className="graph-tooltip-meta">
        {event.counterparty && <><span>Counterparty</span><strong style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{event.counterparty}</strong></>}
        {Number(event.taxAmount) > 0 && <><span>Gross incoming</span><strong style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{formatMoney(Number(event.grossAmount), baseCurrency)}</strong></>}
        {Number(event.taxAmount) > 0 && <><span>Tax</span><strong style={{ color: '#f97316', textAlign: 'right' }}>−{formatMoney(Number(event.taxAmount), baseCurrency)}</strong></>}
      </div>
      {event.comment && <div className="graph-tooltip-note">{event.comment}</div>}
    </GraphTooltip>
  );
};

const NetWorthTooltip = ({ active, payload, label, baseCurrency }: any) => {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const delta = Number(point.delta || 0);

  return (
    <GraphTooltip
      title={label}
      titleValue="🔎 click to diff"
      rows={[
        { key: 'total', label: <span style={{ color: '#10b981' }}>Net worth</span>, value: formatMoney(Number(point.total || 0), baseCurrency) },
        {
          key: 'delta',
          label: <span style={{ color: '#eab308' }}>Change</span>,
          value: <SignedMoney value={delta} suffix={baseCurrency} />
        }
      ]}
      style={{ minWidth: '210px' }}
    />
  );
};

type DecompositionSeries = { key: string; label: string; color: string };

const DecompositionTooltip = ({ active, payload, label, baseCurrency, item }: any) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <GraphTooltip
      title={label}
      rows={[{
        key: item.key,
        label: item.label,
        markerColor: item.color,
        value: <SignedMoney value={Number(payload[0].value || 0)} suffix={baseCurrency} />
      }]}
    />
  );
};

const DecompositionSmallMultiples = ({
  baseCurrency,
  data,
  series
}: {
  baseCurrency: string;
  data: ChartDatum[];
  series: DecompositionSeries[];
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minHeight: 0 }}>
    {series.map((item, index) => {
      const total = data.reduce((sum, point) => sum + Number(point[item.key] || 0), 0);
      const isLast = index === series.length - 1;
      return (
        <div key={item.key} style={{ flex: 1, minHeight: '118px', display: 'flex', flexDirection: 'column', borderTop: index > 0 ? '1px solid var(--glass-border)' : undefined, paddingTop: index > 0 ? '12px' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginBottom: '4px', fontSize: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700 }}>
              <i style={{ width: '8px', height: '8px', borderRadius: '2px', background: item.color }} />
              {item.label}
            </span>
            <strong><SignedMoney value={total} suffix={baseCurrency} /></strong>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} syncId="balance-decomposition" margin={{ top: 4, right: 10, left: 0, bottom: isLast ? 6 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" hide={!isLast} stroke="var(--text-secondary)" style={{ fontSize: '11px' }} />
                <YAxis width={54} stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '11px' }} />
                <Tooltip content={<DecompositionTooltip baseCurrency={baseCurrency} item={item} />} />
                <ReferenceLine y={0} stroke="rgba(148, 163, 184, 0.55)" />
                <Bar dataKey={item.key} name={item.label} fill={item.color} radius={[3, 3, 0, 0]} maxBarSize={42}>
                  {data.map(point => (
                    <Cell key={`${item.key}-${point.month}`} fill={Number(point[item.key] || 0) < 0 ? '#ef4444' : item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    })}
  </div>
);

const SummaryCard = ({
  stat,
  onOpenDiff
}: {
  stat: SummaryStat;
  onOpenDiff?: () => void;
}) => {
  const color = stat.label === 'Net worth' ? 'var(--text-primary)' : getDeltaColor(stat.value);
  const isClickable = Boolean(onOpenDiff);

  return (
    <div
      className={`glass-panel graphs-summary-card${isClickable ? ' is-clickable' : ''}`}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      title={isClickable ? 'Open diff for the selected period' : undefined}
      onClick={onOpenDiff}
      onKeyDown={event => {
        if (!onOpenDiff || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onOpenDiff();
      }}
      style={{ minHeight: '84px', padding: '14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span>{stat.label}</span>
          <HelpTooltip text={stat.help} />
        </span>
        {stat.percent !== undefined && (
          <span style={{ color: getDeltaColor(stat.percent), fontSize: '12px', fontWeight: 800 }}>
            {stat.percent > 0 ? '+' : ''}{stat.percent.toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <div style={{ color, fontSize: '24px', fontWeight: 800, lineHeight: 1 }}>
          {stat.label === 'Net worth' ? formatNumber(stat.value) : formatSigned(stat.value)}
          {stat.suffix && <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginLeft: '6px', fontWeight: 600 }}>{stat.suffix}</span>}
        </div>
      </div>
    </div>
  );
};

const ChartTitle = ({ icon, children, help, onClick }: { icon: ReactNode; children: ReactNode; help: string; onClick?: () => void }) => {
  return (
    <h4
      className="flex items-center gap-2"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={onClick ? 'Open diff for the selected period' : undefined}
      onClick={onClick}
      onKeyDown={event => {
        if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onClick();
      }}
      style={{ margin: '0 0 16px 0', fontSize: '14px', minWidth: 0, cursor: onClick ? 'pointer' : undefined }}
    >
      {icon}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      <HelpTooltip text={help} />
    </h4>
  );
};

type TitledContentProps = { children: ReactNode; icon: ReactNode; title: ReactNode };
type ChartCardProps = TitledContentProps & { help: string; onTitleClick?: () => void; panel?: boolean; style?: CSSProperties };

const ChartCard = ({ children, help, icon, onTitleClick, title, panel = true, style }: ChartCardProps) => (
  <div className={panel ? 'glass-panel' : undefined} style={{ ...CARD_STYLE, ...style }}>
    <ChartTitle icon={icon} help={help} onClick={onTitleClick}>{title}</ChartTitle>
    {children}
  </div>
);

type CollapsibleSectionProps = Omit<TitledContentProps, 'title'> & { contentStyle: CSSProperties; help?: string; title: string };

const CollapsibleSection = ({ children, contentStyle, help, icon, title }: CollapsibleSectionProps) => (
  <details className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
    <summary style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 20px', cursor: 'pointer', userSelect: 'none', listStyle: 'none', borderBottom: '1px solid var(--glass-border)' }}>
      {icon}
      <span style={{ fontWeight: 800 }}>{title}</span>
      {help && <HelpTooltip text={help} />}
      <ChevronDown size={16} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
    </summary>
    <div style={contentStyle}>{children}</div>
  </details>
);

export function GraphsAnalyticsSections({
  baseCurrency,
  cashFlowEnabled,
  capitalReturnSummary,
  activeCurrencies,
  allOrganizations,
  allUsedCurrencies,
  allUsedTags,
  chartColors,
  cashFlowMonthlyData,
  cashFlowEventsData,
  currencyDistributionData,
  currencyRatesData,
  decompositionData,
  hiddenSeries,
  netWorthData,
  orgTrendData,
  organizationCurrencyBreakdown,
  organizationCurrencyMonth,
  summaryStats,
  tagDistributionData,
  tagReturnCoverage,
  tagReturnStats,
  uxMetricsData,
  handleLegendClickSmart,
  onOpenSnapshotDiff
}: GraphsAnalyticsSectionsProps) {
  const [allocationMode, setAllocationMode] = useState<'percent' | 'value'>('value');
  const [selectedTagReturn, setSelectedTagReturn] = useState<TagReturnStat | null>(null);
  const [showCapitalReturnMonths, setShowCapitalReturnMonths] = useState(false);
  const [expandedTagMonth, setExpandedTagMonth] = useState<string | null>(null);

  const closeTagReturn = useCallback(() => {
    setSelectedTagReturn(null);
    setExpandedTagMonth(null);
  }, []);

  const tagReturnGroups = useMemo(() => ([
    { kind: 'yield' as const, title: 'Estimated capital earnings' },
    { kind: 'spending' as const, title: 'Estimated spending' },
    { kind: 'unknown' as const, title: 'Not classified' }
  ]).map(group => ({ ...group, items: tagReturnStats.filter(item => item.kind === group.kind) }))
    .filter(group => group.items.length > 0), [tagReturnStats]);

  const hasSpendingTags = tagReturnGroups.some(group => group.kind === 'spending');
  const showTagGroupTitles = tagReturnGroups.length > 1;

  const tagListLayout = useMemo(() => {
    const slots = tagReturnGroups.flatMap(group => [
      ...(showTagGroupTitles ? [{ height: TAG_RETURN_GROUP_TITLE_HEIGHT, isRow: false }] : []),
      ...group.items.map(() => ({ height: TAG_RETURN_ROW_HEIGHT, isRow: true }))
    ]);

    const fitted: typeof slots = [];
    let height = 0;
    for (const slot of slots) {
      if (height + slot.height > TAG_RETURN_LIST_MAX_HEIGHT) break;
      fitted.push(slot);
      height += slot.height;
    }
    while (fitted.length > 0 && !fitted[fitted.length - 1].isRow) {
      height -= fitted.pop()!.height;
    }

    return { height: height || TAG_RETURN_ROW_HEIGHT, visible: fitted.filter(slot => slot.isRow).length };
  }, [showTagGroupTitles, tagReturnGroups]);

  const selectedTagReturnFlow = (selectedTagReturn?.monthly || []).reduce((total, month) => total + month.assignedFlow, 0);

  const currencyAllocationData = useMemo(() => {
    return allocationMode === 'percent' ? normalizeStackData(currencyDistributionData, allUsedCurrencies) : currencyDistributionData;
  }, [allocationMode, currencyDistributionData, allUsedCurrencies]);

  const tagAllocationData = useMemo(() => {
    return allocationMode === 'percent' ? normalizeStackData(tagDistributionData, allUsedTags) : tagDistributionData;
  }, [allocationMode, tagDistributionData, allUsedTags]);

  const organizationAllocationData = useMemo(() => {
    return allocationMode === 'percent' ? normalizeStackData(orgTrendData, allOrganizations) : orgTrendData;
  }, [allocationMode, orgTrendData, allOrganizations]);

  const organizationCurrencies = useMemo(() => Array.from(new Set(
    organizationCurrencyBreakdown.flatMap(item => item.holdings.map(holding => holding.currency))
  )), [organizationCurrencyBreakdown]);

  const organizationCurrencyChartData = useMemo(() => organizationCurrencyBreakdown.map(item => ({
    ...item,
    ...Object.fromEntries(item.holdings.map(holding => [holding.currency, holding.percent]))
  })), [organizationCurrencyBreakdown]);

  const visibleOrganizationCurrencyChartData = useMemo(() => organizationCurrencyChartData.filter(item => (
    item.holdings.some(holding => !hiddenSeries.currencies[holding.currency] && holding.percent > 0)
  )), [hiddenSeries.currencies, organizationCurrencyChartData]);

  const decompositionSeries: DecompositionSeries[] = cashFlowEnabled
    ? [
        { key: 'External flow', label: 'External flow', color: '#3b82f6' },
        { key: 'Capital earnings', label: 'Capital earnings', color: '#10b981' },
        { key: 'FX Impact', label: 'FX impact', color: '#6366f1' }
      ]
    : [
        { key: 'Organic flow', label: 'Balance amount change', color: '#10b981' },
        { key: 'FX Impact', label: 'FX impact', color: '#6366f1' }
      ];

  const allocationFormatter = (value: any) => {
    const num = Number(value || 0);
    return allocationMode === 'percent' ? `${num.toFixed(1)}%` : formatMoney(num, baseCurrency);
  };

  const renderAllocationChart = (
    data: ChartDatum[], keys: string[], group: 'currencies' | 'tags', stackId: string,
    getColor: (key: string) => string
  ) => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
        <YAxis
          domain={allocationMode === 'percent' ? [0, 100] : undefined}
          ticks={allocationMode === 'percent' ? [0, 25, 50, 75, 100] : undefined}
          stroke="var(--text-secondary)"
          tickFormatter={(val) => allocationMode === 'percent' ? `${val}%` : formatCompact(val)}
          style={{ fontSize: '12px' }}
        />
        <Tooltip content={<SimpleGraphTooltip formatter={(value, name) => [allocationFormatter(value), name]} />} />
        <Legend onClick={(event) => handleLegendClickSmart(group, event, keys)} wrapperStyle={LEGEND_STYLE} />
        {keys.map(key => <Bar key={key} dataKey={key} stackId={stackId} fill={getColor(key)} hide={hiddenSeries[group][key]} />)}
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <>
      <section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          {summaryStats.map(stat => <SummaryCard key={stat.label} stat={stat} />)}
        </div>
        {cashFlowEnabled && capitalReturnSummary && (
          <div style={{ ...GRID_2, marginTop: '12px' }}>
            <div className="glass-panel capital-return-card" style={{ padding: '16px 18px' }}>
              <ChartTitle
                icon={<TrendingUp size={16} style={{ color: '#10b981' }} />}
                help="This is an estimate from monthly snapshots, not a broker statement. Balance changes are measured without FX impact; recorded external money is removed, leaving estimated investment earnings. Internal transfers do not change external Cash Flow, so any difference between their sent and received legs stays in this reconciliation and in the tag attribution."
              >
                Estimated capital earnings
              </ChartTitle>
              <div className="capital-return-headline">
                <button
                  type="button"
                  className="capital-return-headline-action"
                  onClick={() => setShowCapitalReturnMonths(true)}
                  disabled={capitalReturnSummary.monthly.length === 0}
                  aria-label="View the monthly breakdown of estimated earnings"
                >
                  <span>Estimated earnings</span>
                  <strong style={{ color: getMoneyDeltaColor(capitalReturnSummary.result) }}>{formatSigned(capitalReturnSummary.result)} {baseCurrency}</strong>
                  <small className="capital-return-headline-link">See it month by month <ChevronRight size={12} /></small>
                </button>
                <div>
                  <span>Time-weighted return</span>
                  <div className="capital-return-headline-row">
                    <strong style={{ color: getPercentDeltaColor(capitalReturnSummary.ratePercent) }}>{formatPercent(capitalReturnSummary.ratePercent)}</strong>
                    <div className="capital-return-headline-notes">
                      <small>· over {capitalReturnSummary.monthly.length} month{capitalReturnSummary.monthly.length === 1 ? '' : 's'}</small>
                      {capitalReturnSummary.annualizedRatePercent !== null && (
                        <small className="capital-return-headline-annual"><b>{formatPercent(capitalReturnSummary.annualizedRatePercent)}</b> per year</small>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="capital-return-reconciliation">
                <div><span>Balance change excluding FX</span><strong>{formatSigned(capitalReturnSummary.organicChange)} {baseCurrency}</strong></div>
                <div><span>Less recorded net contributions</span><strong>{formatSigned(-capitalReturnSummary.externalFlow)} {baseCurrency}</strong></div>
                <div className="is-result">
                  <span>Estimated earnings</span>
                  <strong style={{ color: getMoneyDeltaColor(capitalReturnSummary.result) }}>{formatSigned(capitalReturnSummary.result)} {baseCurrency}</strong>
                </div>
                {Math.abs(capitalReturnSummary.nonYieldingResult) >= 1 && (
                  <div className="is-sub">
                    <span className="capital-return-reconciliation-label">
                      of which non-yielding tags
                      <HelpTooltip
                        text="Tags marked as 'Doesn't yield' in Settings cannot earn anything, so their share of this number is an estimate of spending that never reached Cash Flow, not capital earnings."
                        ariaLabel="Non-yielding tags inside estimated earnings"
                        width={320}
                      />
                    </span>
                    <strong style={{ color: getMoneyDeltaColor(capitalReturnSummary.nonYieldingResult) }}>{formatSigned(capitalReturnSummary.nonYieldingResult)} {baseCurrency}</strong>
                  </div>
                )}
                <div className="is-aside">
                  <span className="capital-return-reconciliation-label">
                    FX impact, kept out of earnings
                    <HelpTooltip
                      text="Revaluation of the balances you already held when exchange rates moved. It stays out of the reconciliation above because it is not money the portfolio earned or received."
                      ariaLabel="FX impact outside estimated earnings"
                      width={310}
                    />
                  </span>
                  <strong style={{ color: getMoneyDeltaColor(capitalReturnSummary.fxImpact) }}>{formatSigned(capitalReturnSummary.fxImpact)} {baseCurrency}</strong>
                </div>
              </div>
              {capitalReturnSummary.monthsWithoutRecordedFlow > 0 && (
                <div className="capital-return-flow-warning">
                  {capitalReturnSummary.monthsWithoutRecordedFlow} of {capitalReturnSummary.monthly.length} months have no recorded movements, so their whole balance change counts as earnings here.
                </div>
              )}
            </div>

            <div className="glass-panel capital-return-card" style={{ padding: '16px 18px' }}>
              <ChartTitle
                icon={<Layers size={16} style={{ color: '#14b8a6' }} />}
                help={hasSpendingTags
                  ? "A movement can be attributed to a deposit, stock, or other tag only when its Own account is selected in Cash Flow. For yielding tags the amount is estimated earnings and the percentage is the time-weighted return; for tags marked as 'Doesn't yield' the same difference is read as spending that never reached Cash Flow. The return ignores deposits and withdrawals, so its sign can differ from the amount as invested balances change."
                  : "A movement can be attributed to a deposit, stock, or other tag only when its Own account is selected in Cash Flow. Amount is estimated earnings; percentage is the time-weighted return for the selected period. The return ignores deposits and withdrawals, so its sign can differ from the amount as invested balances change."}
              >
                {hasSpendingTags ? 'Earnings and spending by balance tag' : 'Estimated earnings by balance tag'}
              </ChartTitle>
              <div className="capital-return-tag-panel-body">
                <div id="capital-return-tag-scroll" className="capital-return-tag-scroll" style={{ flexBasis: `${tagListLayout.height}px` }}>
                  <div className="capital-return-tag-list">
                    {tagReturnGroups.map(group => (
                      <Fragment key={group.kind}>
                        {showTagGroupTitles && <div className="capital-return-tag-group-title">{group.title}</div>}
                        {group.items.map(item => {
                          const isSpending = item.kind === 'spending';
                          const unrecordedIncome = isSpending && item.result > 0;
                          return (
                            <button
                              key={item.tag}
                              type="button"
                              className="capital-return-tag-row"
                              onClick={() => {
                                setSelectedTagReturn(item);
                                setExpandedTagMonth(null);
                              }}
                              aria-label={`View monthly breakdown for ${item.tag}`}
                            >
                              <span className="capital-return-tag-name">
                                <i style={{ background: item.tag === 'untagged' ? '#64748b' : getTagColor(item.tag) }} />
                                {item.tag}
                              </span>
                              <strong style={{ color: getMoneyDeltaColor(item.result) }}>
                                {isSpending && !unrecordedIncome
                                  ? `${formatNumber(-item.result)} ${baseCurrency}`
                                  : `${formatSigned(item.result)} ${baseCurrency}`}
                              </strong>
                              {isSpending ? (
                                <span className="capital-return-tag-note" title={unrecordedIncome
                                  ? 'This tag grew beyond its recorded movements, so this is income that never reached Cash Flow, not negative spending.'
                                  : 'Estimated money spent from this tag without a Cash Flow record.'}>
                                  {unrecordedIncome ? 'income' : 'spent'}
                                </span>
                              ) : (
                                <strong className="capital-return-tag-rate" style={{ color: item.ratePercent === null ? 'var(--text-secondary)' : getPercentDeltaColor(item.ratePercent) }}>
                                  {item.ratePercent === null ? '—' : formatPercent(item.ratePercent)}
                                </strong>
                              )}
                              <ChevronRight className="capital-return-tag-chevron" size={14} />
                            </button>
                          );
                        })}
                      </Fragment>
                    ))}
                    {tagReturnStats.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px 0' }}>Choose at least two snapshots to estimate earnings by tag.</div>}
                  </div>
                </div>
                <ScrollForMore
                  compact
                  noun={{ singular: 'tag', plural: 'tags' }}
                  scrollContainerId="capital-return-tag-scroll"
                  total={tagReturnStats.length}
                  visible={tagListLayout.visible}
                />
                <div className="capital-return-tag-footer">
                {Math.abs(tagReturnCoverage.unattributedFlow) >= 1 && (
                  <div className="capital-return-unattributed">
                    <span>Movements without a tag</span>
                    <strong style={{ color: getMoneyDeltaColor(tagReturnCoverage.unattributedFlow) }}>{formatSigned(tagReturnCoverage.unattributedFlow)} {baseCurrency}</strong>
                    <HelpTooltip
                      text="Recorded money that could not be attached to any tag, because the movement has neither a tag nor a known own account. It is not in the rows above, so their earnings are off by this amount."
                      ariaLabel="Unattributed movements help"
                      width={330}
                    />
                  </div>
                )}
                {tagReturnCoverage.unknownAccounts.length > 0 && (
                  <div className="capital-return-coverage-warning">
                    Cash Flow uses {tagReturnCoverage.unknownAccounts.length === 1 ? 'an account' : 'accounts'} no snapshot in this period knows: {tagReturnCoverage.unknownAccounts.join(', ')}. Fix the name or set a tag on those movements.
                  </div>
                )}
                {tagReturnCoverage.total > 0 && tagReturnCoverage.assigned < tagReturnCoverage.total && (
                  <div className="capital-return-coverage-warning">
                    Only {tagReturnCoverage.assigned} of {tagReturnCoverage.total} external movements reach a tag. Give the rest an own account or a tag in Cash Flow to make this breakdown reliable.
                  </div>
                )}
                {tagReturnCoverage.proportional > 0 && (
                  <div className="capital-return-coverage-warning">
                    {tagReturnCoverage.proportional} {tagReturnCoverage.proportional === 1 ? 'movement was' : 'movements were'} assigned to an account with multiple tags and split in proportion to its tagged balances. Set a tag on the movement to place it exactly.
                  </div>
                )}
                {tagReturnCoverage.total > 0 && tagReturnCoverage.assigned === tagReturnCoverage.total && tagReturnCoverage.proportional === 0 && tagReturnCoverage.unknownAccounts.length === 0 && (
                  <div className="capital-return-coverage-complete">
                    <Check size={13} />
                    Every external movement in this period reaches a tag.
                  </div>
                )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {showCapitalReturnMonths && capitalReturnSummary && (
        <ModalPortal className="capital-return-tag-modal-backdrop" zIndex={null} onClose={() => setShowCapitalReturnMonths(false)} closeOnEscape>
          <div
            className="capital-return-tag-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="capital-return-months-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="capital-return-tag-modal-header">
              <div>
                <span>Monthly breakdown</span>
                <h3 id="capital-return-months-title">Estimated capital earnings</h3>
              </div>
              <button type="button" className="capital-return-tag-modal-close" onClick={() => setShowCapitalReturnMonths(false)} aria-label="Close monthly breakdown">
                <X size={17} />
              </button>
            </div>
            <div className="capital-return-tag-modal-summary">
              <div>
                <span>Estimated earnings</span>
                <strong style={{ color: getMoneyDeltaColor(capitalReturnSummary.result) }}>{formatSigned(capitalReturnSummary.result)} {baseCurrency}</strong>
              </div>
              <div>
                <span>Time-weighted return</span>
                <strong style={{ color: getPercentDeltaColor(capitalReturnSummary.ratePercent) }}>{formatPercent(capitalReturnSummary.ratePercent)}</strong>
              </div>
            </div>
            <div id="capital-return-months-scroll" className="capital-return-tag-modal-months is-portfolio">
              <div className="capital-return-tag-modal-month-heading">
                <span>Month</span><span>Opening → closing</span><span>Movements</span><span>Earnings</span><span>Return</span>
              </div>
              {[...capitalReturnSummary.monthly].sort((left, right) => right.month.localeCompare(left.month)).map(month => (
                <div key={month.month} className="capital-return-tag-modal-month-row is-static">
                  <span>{month.month}</span>
                  <strong className="capital-return-tag-modal-balance">
                    <span>{formatNumber(month.openingCapital)}</span>
                    <ArrowRight size={11} />
                    <span>{formatNumber(month.openingCapital + month.externalFlow + month.result)} {baseCurrency}</span>
                  </strong>
                  <strong style={{ color: month.recordedMovements === 0 ? 'var(--warning)' : getMoneyDeltaColor(month.externalFlow) }}>
                    {month.recordedMovements === 0 ? 'none recorded' : `${formatSigned(month.externalFlow)} ${baseCurrency}`}
                  </strong>
                  <strong style={{ color: getMoneyDeltaColor(month.result) }}>{formatSigned(month.result)} {baseCurrency}</strong>
                  <strong style={{ color: month.ratePercent === null ? 'var(--text-secondary)' : getPercentDeltaColor(month.ratePercent) }}>
                    {month.ratePercent === null ? '—' : formatPercent(month.ratePercent)}
                  </strong>
                </div>
              ))}
            </div>
            <ScrollForMore
              compact
              noun={{ singular: 'month', plural: 'months' }}
              scrollContainerId="capital-return-months-scroll"
              total={capitalReturnSummary.monthly.length}
              rowHeight={42}
            />
            <div className="capital-return-tag-modal-note">
              Opening and closing balances are valued in {baseCurrency} at each month's closing rates, so FX movement stays out of them. Earnings are what the balance changed by beyond the movements recorded in Cash Flow; a month with no recorded movements counts its whole change as earnings.
            </div>
          </div>
        </ModalPortal>
      )}

      {selectedTagReturn && (
        <ModalPortal className="capital-return-tag-modal-backdrop" zIndex={null} onClose={closeTagReturn} closeOnEscape>
          <div
            className="capital-return-tag-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="capital-return-tag-modal-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="capital-return-tag-modal-header">
              <div>
                <span>Monthly breakdown</span>
                <h3 id="capital-return-tag-modal-title">
                  <i style={{ background: selectedTagReturn.tag === 'untagged' ? '#64748b' : getTagColor(selectedTagReturn.tag) }} />
                  {selectedTagReturn.tag}
                </h3>
              </div>
              <button type="button" className="capital-return-tag-modal-close" onClick={closeTagReturn} aria-label="Close monthly breakdown">
                <X size={17} />
              </button>
            </div>
            <div className="capital-return-tag-modal-summary">
              <div>
                <span>{selectedTagReturn.kind === 'spending' ? (selectedTagReturn.result > 0 ? 'Unrecorded income' : 'Estimated spending') : 'Estimated earnings'}</span>
                <strong style={{ color: getMoneyDeltaColor(selectedTagReturn.result) }}>
                  {selectedTagReturn.kind === 'spending' && selectedTagReturn.result <= 0
                    ? `${formatNumber(-selectedTagReturn.result)} ${baseCurrency}`
                    : `${formatSigned(selectedTagReturn.result)} ${baseCurrency}`}
                </strong>
              </div>
              {selectedTagReturn.kind === 'spending' ? (
                <div>
                  <span>Recorded movements</span>
                  <strong style={{ color: getMoneyDeltaColor(selectedTagReturnFlow) }}>{formatSigned(selectedTagReturnFlow)} {baseCurrency}</strong>
                </div>
              ) : (
                <div>
                  <span>Time-weighted return</span>
                  <strong style={{ color: selectedTagReturn.ratePercent === null ? 'var(--text-secondary)' : getPercentDeltaColor(selectedTagReturn.ratePercent) }}>
                    {selectedTagReturn.ratePercent === null ? '—' : formatPercent(selectedTagReturn.ratePercent)}
                  </strong>
                </div>
              )}
            </div>
            <div id="capital-return-tag-months-scroll" className="capital-return-tag-modal-months">
              <div className="capital-return-tag-modal-month-heading"><span>Month</span><span>Opening → closing</span><span>{selectedTagReturn.kind === 'spending' ? 'Spending' : 'Earnings'}</span><span>Return</span><span /></div>
              {[...selectedTagReturn.monthly].sort((left, right) => right.month.localeCompare(left.month)).map(month => {
                const isExpanded = expandedTagMonth === month.month;
                return (
                  <Fragment key={month.month}>
                    <button
                      type="button"
                      className={`capital-return-tag-modal-month-row${isExpanded ? ' is-expanded' : ''}`}
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedTagMonth(isExpanded ? null : month.month)}
                    >
                      <span>{month.month}</span>
                      <strong className="capital-return-tag-modal-balance">
                        <span>{formatNumber(month.openingCapital)}</span>
                        <ArrowRight size={11} />
                        <span>{formatNumber(month.closingCapital)} {baseCurrency}</span>
                      </strong>
                      <strong style={{ color: getMoneyDeltaColor(month.result) }}>
                        {selectedTagReturn.kind === 'spending' && month.result <= 0
                          ? `${formatNumber(-month.result)} ${baseCurrency}`
                          : `${formatSigned(month.result)} ${baseCurrency}`}
                      </strong>
                      <strong style={{ color: month.ratePercent === null ? 'var(--text-secondary)' : getPercentDeltaColor(month.ratePercent) }}>
                        {month.ratePercent === null ? '—' : formatPercent(month.ratePercent)}
                      </strong>
                      <ChevronDown className="capital-return-tag-modal-month-chevron" size={13} />
                    </button>
                    {isExpanded && (
                      <div className="capital-return-tag-modal-month-detail">
                        <div className="capital-return-tag-modal-formula">
                          <div>
                            <span>Opening balance</span>
                            <strong>{formatNumber(month.openingCapital)} {baseCurrency}</strong>
                          </div>
                          <i>+</i>
                          <div>
                            <span>Recorded movements</span>
                            <strong style={{ color: getMoneyDeltaColor(month.assignedFlow) }}>{formatSigned(month.assignedFlow)} {baseCurrency}</strong>
                          </div>
                          <i>+</i>
                          <div>
                            <span>{selectedTagReturn.kind === 'spending' ? 'Estimated spending' : 'Estimated earnings'}</span>
                            <strong style={{ color: getMoneyDeltaColor(month.result) }}>{formatSigned(month.result)} {baseCurrency}</strong>
                          </div>
                          <i>=</i>
                          <div className="is-closing">
                            <span>Closing balance</span>
                            <strong>{formatNumber(month.closingCapital)} {baseCurrency}</strong>
                          </div>
                        </div>
                        <p>Recorded movements include Cash Flow entries and internal transfers attributed to accounts carrying this tag.</p>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
            <ScrollForMore
              compact
              noun={{ singular: 'month', plural: 'months' }}
              scrollContainerId="capital-return-tag-months-scroll"
              total={selectedTagReturn.monthly.length}
              rowHeight={42}
            />
            <div className="capital-return-tag-modal-note">
              {selectedTagReturn.kind === 'spending'
                ? `Opening and closing balances are valued in ${baseCurrency} at each month's closing rates. This tag is marked as non-yielding in Settings, so whatever its balance lost beyond the recorded movements is shown as estimated spending.`
                : `Opening and closing balances are valued in ${baseCurrency} at each month's closing rates. Earnings exclude recorded external flows attributed to this tag; return is time-weighted and not annualized.`}
            </div>
          </div>
        </ModalPortal>
      )}

      <section>
        <h3 className="mb-4" style={SECTION_TITLE_STYLE}>BALANCE OVER TIME</h3>
        <div style={GRID_2}>
          <ChartCard
            icon={<TrendingUp size={16} style={{ color: '#10b981' }} />}
            help={`Total portfolio value in ${baseCurrency} at each snapshot. The green area is net worth; the yellow line is the change from the previous snapshot on its own scale.`}
            title={<>Net worth ({baseCurrency})</>}
            style={{ gridColumn: 'span 2', height: '390px' }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={netWorthData}
                margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                onClick={(chartState: any) => {
                  const month = chartState?.activeLabel || chartState?.activePayload?.[0]?.payload?.month;
                  if (month) onOpenSnapshotDiff(String(month));
                }}
              >
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="net-worth" stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <YAxis yAxisId="delta" orientation="right" stroke="#eab308" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip content={<NetWorthTooltip baseCurrency={baseCurrency} />} />
                <Area yAxisId="net-worth" type="monotone" dataKey="total" name="total" stroke="#10b981" fillOpacity={1} fill="url(#netWorthFill)" strokeWidth={3} dot={{ r: 3 }} />
                <Line yAxisId="delta" type="monotone" dataKey="delta" name="Monthly change" stroke="#eab308" strokeWidth={2} dot={{ r: 3, fill: 'var(--bg-color)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            icon={<ArrowLeftRight size={16} style={{ color: '#10b981' }} />}
            help={cashFlowEnabled
              ? `Each component has its own scale so smaller earnings and FX changes remain visible next to large deposits or withdrawals. Red bars are negative. Internal transfers are excluded from external flow.`
              : `Balance amount change and exchange-rate impact use separate scales so both remain readable. Red bars are negative.`}
            title={<>{cashFlowEnabled ? 'What changed the balance' : 'Balance change and FX'} ({baseCurrency})</>}
            style={{ gridColumn: 'span 2', height: cashFlowEnabled ? '520px' : '390px' }}
          >
            <DecompositionSmallMultiples
              baseCurrency={baseCurrency}
              data={decompositionData}
              series={decompositionSeries}
            />
          </ChartCard>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 style={{ ...SECTION_TITLE_STYLE, margin: 0 }}>ALLOCATION</h3>
          <SegmentedControl
            compact
            value={allocationMode}
            onChange={setAllocationMode}
            options={[
              { value: 'percent', label: 'Share', icon: <Percent size={13} /> },
              { value: 'value', label: 'Value', icon: <BarChart3 size={13} /> }
            ]}
          />
        </div>

        <div style={GRID_2}>
          <ChartCard
            icon={<Layers size={16} className="text-secondary" />}
            help={`Shows portfolio split by currency over time. In Percent mode each month is normalized to 100%; in Value mode every currency is converted to ${baseCurrency} using that snapshot's rates.`}
            title="Currency mix"
          >
            {renderAllocationChart(currencyAllocationData, allUsedCurrencies, 'currencies', 'currency_stack', getCurrencyColor)}
          </ChartCard>

          <ChartCard
            icon={<Layers size={16} style={{ color: 'var(--accent)' }} />}
            help={`Shows portfolio structure by balance tags. Tagged balances are converted to ${baseCurrency}; if a balance has multiple tags, its value is split evenly between them. Untagged balances go to "untagged".`}
            title="Balance tags"
          >
            {renderAllocationChart(tagAllocationData, allUsedTags, 'tags', 'tags_stack', tag => tag === 'untagged' ? '#475569' : getTagColor(tag))}
          </ChartCard>

          <ChartCard
            icon={<Landmark size={16} className="text-secondary" />}
            help={`Shows balances grouped by organization. Share mode normalizes every snapshot to 100%; Value mode converts balances to ${baseCurrency}. Click a legend item to hide it; double-click to isolate it.`}
            title={<>Organizations ({allocationMode === 'percent' ? 'share' : baseCurrency})</>}
            style={{ gridColumn: 'span 2' }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={organizationAllocationData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis
                  domain={allocationMode === 'percent' ? [0, 100] : undefined}
                  ticks={allocationMode === 'percent' ? [0, 25, 50, 75, 100] : undefined}
                  stroke="var(--text-secondary)"
                  tickFormatter={(value) => allocationMode === 'percent' ? `${value}%` : formatCompact(value)}
                  style={{ fontSize: '12px' }}
                />
                <Tooltip content={<OrgCustomTooltip allocationMode={allocationMode} baseCurrency={baseCurrency} />} />
                <Legend onClick={(event) => handleLegendClickSmart('organizations', event, allOrganizations)} wrapperStyle={LEGEND_STYLE} />
                {allOrganizations.map((orgName, idx) => (
                  <Area key={orgName} type="monotone" dataKey={orgName} stackId="1" stroke={chartColors[idx % chartColors.length]} fill={chartColors[idx % chartColors.length]} fillOpacity={0.4} hide={hiddenSeries.organizations[orgName]} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            icon={<Landmark size={16} style={{ color: '#60a5fa' }} />}
            help={`Shows the currency mix inside each organization for the latest selected snapshot. Percentages use absolute values converted to ${baseCurrency}. Hover a bar to see native amounts and their ${baseCurrency} equivalents. Click a currency in the legend or chart to hide it; double-click to isolate it.`}
            title={<>Currency mix by organization ({organizationCurrencyMonth || 'latest'})</>}
            style={{ gridColumn: 'span 2', height: '410px' }}
          >
            {organizationCurrencyBreakdown.length > 0 ? (
              <OrganizationCurrencyChart
                baseCurrency={baseCurrency}
                data={visibleOrganizationCurrencyChartData}
                currencies={organizationCurrencies}
                hiddenCurrencies={hiddenSeries.currencies}
                onLegendClick={handleLegendClickSmart}
              />
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No organization balances in the selected snapshot.</div>
            )}
          </ChartCard>
        </div>
      </section>

      <CollapsibleSection
        icon={<LineChartIcon size={16} style={{ color: 'var(--accent)' }} />}
        title="Exchange Rates"
        help={`Shows historical rates stored in each snapshot. Values are rendered against ${baseCurrency}; very low nominal rates may be inverted so the line remains readable.`}
        contentStyle={{ height: '350px', padding: '20px' }}
      >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={currencyRatesData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
              <YAxis yAxisId="left" stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
              <Tooltip
                content={<SimpleGraphTooltip formatter={(value, name, item) => {
                  const isInverted = item.payload[`${name}_isInverted`];
                  const num = Number(value).toLocaleString('en-US');
                  return [isInverted ? `${num} per ${baseCurrency}` : `${num} ${baseCurrency}`, name];
                }} />}
              />
              <Legend onClick={(event) => handleLegendClickSmart('currencies', event, activeCurrencies)} wrapperStyle={LEGEND_STYLE} />
              {activeCurrencies.map(currency => {
                const samplePoint = currencyRatesData[0];
                const isHighNominal = samplePoint && samplePoint[`${currency}_isInverted`] === true;
                const yAxisId = isHighNominal ? 'right' : 'left';

                return (
                  <Line key={currency} yAxisId={yAxisId} type="monotone" dataKey={currency} stroke={getCurrencyColor(currency)} strokeWidth={2} dot={{ r: 3 }} hide={hiddenSeries.currencies[currency]} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
      </CollapsibleSection>

      {cashFlowEnabled && (
        <CollapsibleSection
          icon={<ArrowLeftRight size={16} style={{ color: '#3b82f6' }} />}
          title="Cash Flow"
          help={`Shows recorded external Cash Flow converted to ${baseCurrency} with each month's snapshot rates. Internal transfers are excluded from income, spending, savings rate, and event analysis.`}
          contentStyle={{ ...GRID_2, padding: '20px' }}
        >
            <ChartCard
              panel={false}
              icon={<ArrowLeftRight size={16} style={{ color: '#3b82f6' }} />}
              help={`Shows after-tax incoming and spending converted to ${baseCurrency} with each month's snapshot rates. The line is how much remained after spending. Internal transfers are excluded.`}
              title={<>Monthly Cash Flow ({baseCurrency})</>}
              style={{ height: '320px' }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowMonthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                  <YAxis stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                  <Tooltip content={<SimpleGraphTooltip formatter={(value, name) => [formatMoney(Number(value), baseCurrency), name]} />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <Bar dataKey="After-tax income" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Spending" fill="#ef4444" radius={[0, 0, 4, 4]} />
                  <Line type="monotone" dataKey="Net saved" stroke="#60a5fa" strokeWidth={3} dot={{ r: 3, fill: 'var(--bg-color)', strokeWidth: 2 }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              panel={false}
              icon={<Percent size={16} style={{ color: '#60a5fa' }} />}
              help="Monthly share of after-tax income left after spending. The bars show each month; the line is a rolling three-month average. Months without incoming money have no rate. Internal transfers are excluded."
              title="Savings Rate"
              style={{ height: '320px' }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowMonthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                  <YAxis stroke="var(--text-secondary)" tickFormatter={(value) => `${Math.round(value)}%`} style={{ fontSize: '12px' }} />
                  <Tooltip content={<SimpleGraphTooltip formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]} />} />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <ReferenceLine y={0} stroke="rgba(148, 163, 184, 0.55)" />
                  <Bar dataKey="Savings rate" fill="#10b981" radius={[4, 4, 0, 0]}>
                    {cashFlowMonthlyData.map(point => (
                      <Cell key={point.month} fill={Number(point['Savings rate']) >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="3M average" stroke="#60a5fa" strokeWidth={3} connectNulls dot={{ r: 3, fill: 'var(--bg-color)', strokeWidth: 2 }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              panel={false}
              icon={<Activity size={16} style={{ color: '#a78bfa' }} />}
              help={`Shows every external movement in the selected period. Incoming events are green and above zero; spending is red and below zero. Bubble size reflects the amount. Incoming points use the after-tax value, while the tooltip also shows gross incoming and tax. Internal transfers are excluded.`}
              title={<>Cash Flow Events ({baseCurrency})</>}
              style={{ height: '380px', gridColumn: '1 / -1' }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 18, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="category" dataKey="month" name="Month" stroke="var(--text-secondary)" allowDuplicatedCategory={false} style={{ fontSize: '12px' }} />
                  <YAxis type="number" dataKey="amount" name="Amount" stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                  <ZAxis type="number" dataKey="magnitude" range={[70, 520]} />
                  <Tooltip content={<CashFlowEventTooltip baseCurrency={baseCurrency} />} cursor={{ strokeDasharray: '3 3' }} />
                  <ReferenceLine y={0} stroke="rgba(148, 163, 184, 0.55)" />
                  <Scatter data={cashFlowEventsData} name="Cash Flow event" fill="#10b981">
                    {cashFlowEventsData.map(point => <Cell key={point.id} fill={point.fill} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </ChartCard>
        </CollapsibleSection>
      )}

      <CollapsibleSection
        icon={<Clock size={16} style={{ color: '#eab308' }} />}
        title="Snapshot Time & Operational Metrics"
        contentStyle={{ ...GRID_2, padding: '20px' }}
      >
          <ChartCard
            panel={false}
            icon={<Clock size={16} style={{ color: 'var(--accent)' }} />}
            help="Shows how long each snapshot editing session took. It uses the snapshot duration_seconds field and formats it as seconds or minutes."
            title="Time Invested in Snapshot Management"
            style={{ height: '320px' }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={uxMetricsData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="colorUxDuration" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" tickFormatter={(value) => formatFriendlyTime(Number(value))} style={{ fontSize: '11px' }} />
                <Tooltip content={<SimpleGraphTooltip formatter={(value) => [formatFriendlyTime(Number(value)), 'Session Duration']} />} />
                <Area type="monotone" dataKey="duration_seconds_raw" stroke="var(--accent)" fillOpacity={1} fill="url(#colorUxDuration)" strokeWidth={2} dot={{ r: 4, fill: 'var(--bg-color)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            panel={false}
            icon={<BarChart3 size={16} style={{ color: '#10b981' }} />}
            help="Compares account count with time cost per account. Account count is the number of balance rows in the snapshot; seconds per account is duration_seconds divided by that count."
            title="Operational Effort per Financial Account"
            style={{ height: '320px' }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={uxMetricsData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="left" stroke="#10b981" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#eab308" label={{ value: 'Sec / Account', angle: 90, position: 'insideRight', fill: '#eab308', offset: 10, style: { fontSize: '12px' } }} style={{ fontSize: '12px' }} />
                <Tooltip content={<SimpleGraphTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px', userSelect: 'none' }} />
                <Bar yAxisId="left" dataKey="accounts_count" name="Total Tracked Accounts" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Line yAxisId="right" type="monotone" dataKey="cost_per_account" name="Time Cost per Account (Sec)" stroke="#eab308" strokeWidth={3} dot={{ r: 3, fill: 'var(--bg-color)' }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
      </CollapsibleSection>

    </>
  );
}
