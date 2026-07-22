import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Activity, ArrowLeftRight, ArrowRight, BarChart3, ChevronDown, ChevronRight, Clock, Landmark, Layers, LineChart as LineChartIcon, Percent, TrendingUp, X } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, ScatterChart, Scatter, CartesianGrid, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Legend, Cell, LabelList, ReferenceLine } from 'recharts';
import { getCurrencyColor, getTagColor } from '../../../types';
import { HelpTooltip } from '../HelpTooltip';
import { GraphTooltip, SimpleGraphTooltip } from './GraphTooltip';

type ChartDatum = Record<string, any>;

type SummaryStat = {
  label: string;
  value: number;
  suffix?: string;
  percent?: number;
  help: string;
};

type CapitalReturnSummary = {
  organicChange: number;
  externalFlow: number;
  result: number;
  ratePercent: number;
};

type TagReturnStat = {
  tag: string;
  result: number;
  ratePercent: number | null;
  monthly: Array<{ month: string; openingCapital: number; closingCapital: number; result: number; ratePercent: number | null }>;
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
  tagReturnCoverage: { assigned: number; total: number; proportional: number };
  tagReturnStats: TagReturnStat[];
  uxMetricsData: ChartDatum[];
  formatCompact: (value: number) => string;
  formatFriendlyTime: (seconds: number) => string;
  handleLegendClickSmart: (group: LegendGroup, event: any, allKeys: string[]) => void;
};

const LEGEND_STYLE = { cursor: 'pointer', fontSize: '12px', userSelect: 'none' as const };
const CARD_STYLE = { height: '350px', display: 'flex', flexDirection: 'column' as const };
const GRID_2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' };
const SECTION_TITLE_STYLE = { color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' };
const VISIBLE_TAG_RETURN_ROWS = 3;

const normalizeDisplayNumber = (value: number, precision = 0.005) => Math.abs(value) < precision ? 0 : value;
const formatNumber = (value: number) => Math.round(normalizeDisplayNumber(value, 0.5)).toLocaleString('en-US');
const formatMoney = (value: number, suffix: string) => `${formatNumber(value)} ${suffix}`;
const formatNativeAmount = (value: number) => {
  const absolute = Math.abs(value);
  const maximumFractionDigits = absolute >= 1000 ? 0 : absolute >= 1 ? 2 : 6;
  return normalizeDisplayNumber(value).toLocaleString('en-US', { maximumFractionDigits });
};

const getDeltaColor = (value: number) => {
  if (value > 0) return 'var(--diff-positive, hsl(142, 45%, 55%))';
  if (value < 0) return 'var(--diff-negative, hsl(0, 45%, 60%))';
  return 'var(--text-secondary)';
};

const getMoneyDeltaColor = (value: number) => getDeltaColor(normalizeDisplayNumber(value, 0.5));
const getPercentDeltaColor = (value: number) => getDeltaColor(normalizeDisplayNumber(value));

const formatSigned = (value: number) => {
  const normalized = normalizeDisplayNumber(value, 0.5);
  return `${normalized > 0 ? '+' : ''}${formatNumber(normalized)}`;
};
const formatPercent = (value: number) => {
  const normalized = normalizeDisplayNumber(value);
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(2)}%`;
};

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
      rows={[
        { key: 'total', label: 'Net worth', value: formatMoney(Number(point.total || 0), baseCurrency) },
        { key: 'delta', label: 'Change', value: `${formatSigned(delta)} ${baseCurrency}`, color: getDeltaColor(delta) }
      ]}
      style={{ minWidth: '210px' }}
    />
  );
};

type DecompositionSeries = { key: string; label: string; color: string };

const DecompositionSmallMultiples = ({
  baseCurrency,
  data,
  formatCompact,
  series
}: {
  baseCurrency: string;
  data: ChartDatum[];
  formatCompact: (value: number) => string;
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
            <strong style={{ color: getDeltaColor(total) }}>{formatSigned(total)} {baseCurrency}</strong>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} syncId="balance-decomposition" margin={{ top: 4, right: 10, left: 0, bottom: isLast ? 6 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" hide={!isLast} stroke="var(--text-secondary)" style={{ fontSize: '11px' }} />
                <YAxis width={54} stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '11px' }} />
                <Tooltip content={<SimpleGraphTooltip formatter={(value) => [formatMoney(Number(value), baseCurrency), item.label]} />} />
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

const SummaryCard = ({ stat }: { stat: SummaryStat }) => {
  const color = stat.label === 'Net worth' ? 'var(--text-primary)' : getDeltaColor(stat.value);

  return (
    <div className="glass-panel" style={{ minHeight: '92px', padding: '14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px' }}>
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

const ChartTitle = ({ icon, children, help }: { icon: ReactNode; children: ReactNode; help: string }) => {
  return (
    <h4 className="flex items-center gap-2" style={{ margin: '0 0 16px 0', fontSize: '14px', minWidth: 0 }}>
      {icon}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      <HelpTooltip text={help} />
    </h4>
  );
};

type TitledContentProps = { children: ReactNode; icon: ReactNode; title: ReactNode };
type ChartCardProps = TitledContentProps & { help: string; panel?: boolean; style?: CSSProperties };

const ChartCard = ({ children, help, icon, title, panel = true, style }: ChartCardProps) => (
  <div className={panel ? 'glass-panel' : undefined} style={{ ...CARD_STYLE, ...style }}>
    <ChartTitle icon={icon} help={help}>{title}</ChartTitle>
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
  formatCompact,
  formatFriendlyTime,
  handleLegendClickSmart
}: GraphsAnalyticsSectionsProps) {
  const [allocationMode, setAllocationMode] = useState<'percent' | 'value'>('value');
  const [selectedTagReturn, setSelectedTagReturn] = useState<TagReturnStat | null>(null);

  useEffect(() => {
    if (!selectedTagReturn) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSelectedTagReturn(null);
    };
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [selectedTagReturn]);

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
                help="This is an estimate from monthly snapshots, not a broker statement. Balance changes are measured without FX impact; recorded external money is removed, leaving estimated investment earnings."
              >
                Estimated capital earnings
              </ChartTitle>
              <div className="capital-return-headline">
                <div>
                  <span>Estimated earnings</span>
                  <strong style={{ color: getMoneyDeltaColor(capitalReturnSummary.result) }}>{formatSigned(capitalReturnSummary.result)} {baseCurrency}</strong>
                </div>
                <div>
                  <span>Time-weighted return</span>
                  <strong style={{ color: getPercentDeltaColor(capitalReturnSummary.ratePercent) }}>{formatPercent(capitalReturnSummary.ratePercent)}</strong>
                  <small>Selected period · not annualized</small>
                </div>
              </div>
              <div className="capital-return-reconciliation">
                <div><span>Balance change excluding FX</span><strong>{formatSigned(capitalReturnSummary.organicChange)} {baseCurrency}</strong></div>
                <div><span>Less recorded net contributions</span><strong>{formatSigned(-capitalReturnSummary.externalFlow)} {baseCurrency}</strong></div>
              </div>
              <div className="capital-return-transfer-note">
                Internal transfers do not change external Cash Flow. Any difference between their sent and received legs remains in the balance reconciliation and tag attribution.
              </div>
            </div>

            <div className="glass-panel capital-return-card" style={{ padding: '16px 18px' }}>
              <ChartTitle
                icon={<Layers size={16} style={{ color: '#14b8a6' }} />}
                help="A movement can be attributed to a deposit, stock, or other tag only when its Own account is selected in Cash Flow. Amount is estimated earnings; percentage is the time-weighted return for the selected period."
              >
                Estimated earnings by balance tag
              </ChartTitle>
              <div className="capital-return-tag-panel-body">
                <div className="capital-return-tag-scroll">
                  <div className="capital-return-tag-list">
                    {tagReturnStats.map(item => (
                      <button
                        key={item.tag}
                        type="button"
                        className="capital-return-tag-row"
                        onClick={() => setSelectedTagReturn(item)}
                        aria-label={`View monthly breakdown for ${item.tag}`}
                      >
                          <span className="capital-return-tag-name">
                            <i style={{ background: item.tag === 'untagged' ? '#64748b' : getTagColor(item.tag) }} />
                            {item.tag}
                          </span>
                          <strong style={{ color: getMoneyDeltaColor(item.result) }}>{formatSigned(item.result)} {baseCurrency}</strong>
                          <strong className="capital-return-tag-rate" style={{ color: item.ratePercent === null ? 'var(--text-secondary)' : getPercentDeltaColor(item.ratePercent) }}>
                            {item.ratePercent === null ? '—' : formatPercent(item.ratePercent)}
                          </strong>
                          <ChevronRight className="capital-return-tag-chevron" size={14} />
                      </button>
                    ))}
                    {tagReturnStats.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px 0' }}>Choose at least two snapshots to estimate earnings by tag.</div>}
                  </div>
                </div>
                {tagReturnStats.length > VISIBLE_TAG_RETURN_ROWS && (
                  <div className="capital-return-tag-scroll-hint">
                    <ChevronDown size={13} /> Scroll for {tagReturnStats.length - VISIBLE_TAG_RETURN_ROWS} more {tagReturnStats.length - VISIBLE_TAG_RETURN_ROWS === 1 ? 'tag' : 'tags'}
                  </div>
                )}
                {tagReturnCoverage.total > 0 && tagReturnCoverage.assigned < tagReturnCoverage.total && (
                  <div className="capital-return-coverage-warning">
                    Only {tagReturnCoverage.assigned} of {tagReturnCoverage.total} external movements have an own account. Assign the rest in Cash Flow to make this breakdown reliable.
                  </div>
                )}
                {tagReturnCoverage.proportional > 0 && (
                  <div className="capital-return-coverage-warning">
                    {tagReturnCoverage.proportional} {tagReturnCoverage.proportional === 1 ? 'movement was' : 'movements were'} assigned to an account with multiple tags and split in proportion to its tagged balances.
                  </div>
                )}
                {tagReturnCoverage.total > 0 && tagReturnCoverage.assigned === tagReturnCoverage.total && tagReturnCoverage.proportional === 0 && (
                  <div className="capital-return-coverage-complete">All external movements in this period are assigned to accounts.</div>
                )}
                {tagReturnStats.length > 0 && (
                  <div className="capital-return-transfer-note">
                    Earnings are estimated; time-weighted return ignores deposits and withdrawals, so their signs may differ as invested balances change.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {selectedTagReturn && (
        <div
          className="capital-return-tag-modal-backdrop"
          data-escape-guard="true"
          data-hotkeys-guard="true"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setSelectedTagReturn(null);
          }}
        >
          <div className="capital-return-tag-modal" role="dialog" aria-modal="true" aria-labelledby="capital-return-tag-modal-title">
            <div className="capital-return-tag-modal-header">
              <div>
                <span>Monthly breakdown</span>
                <h3 id="capital-return-tag-modal-title">
                  <i style={{ background: selectedTagReturn.tag === 'untagged' ? '#64748b' : getTagColor(selectedTagReturn.tag) }} />
                  {selectedTagReturn.tag}
                </h3>
              </div>
              <button type="button" className="capital-return-tag-modal-close" onClick={() => setSelectedTagReturn(null)} aria-label="Close monthly breakdown">
                <X size={17} />
              </button>
            </div>
            <div className="capital-return-tag-modal-summary">
              <div>
                <span>Estimated earnings</span>
                <strong style={{ color: getMoneyDeltaColor(selectedTagReturn.result) }}>{formatSigned(selectedTagReturn.result)} {baseCurrency}</strong>
              </div>
              <div>
                <span>Time-weighted return</span>
                <strong style={{ color: selectedTagReturn.ratePercent === null ? 'var(--text-secondary)' : getPercentDeltaColor(selectedTagReturn.ratePercent) }}>
                  {selectedTagReturn.ratePercent === null ? '—' : formatPercent(selectedTagReturn.ratePercent)}
                </strong>
              </div>
            </div>
            <div className="capital-return-tag-modal-months">
              <div className="capital-return-tag-modal-month-heading"><span>Month</span><span>Opening → closing</span><span>Earnings</span><span>Return</span></div>
              {[...selectedTagReturn.monthly].sort((left, right) => right.month.localeCompare(left.month)).map(month => (
                <div key={month.month} className="capital-return-tag-modal-month-row">
                  <span>{month.month}</span>
                  <strong className="capital-return-tag-modal-balance">
                    <span>{formatNumber(month.openingCapital)}</span>
                    <ArrowRight size={11} />
                    <span>{formatNumber(month.closingCapital)} {baseCurrency}</span>
                  </strong>
                  <strong style={{ color: getMoneyDeltaColor(month.result) }}>{formatSigned(month.result)} {baseCurrency}</strong>
                  <strong style={{ color: month.ratePercent === null ? 'var(--text-secondary)' : getPercentDeltaColor(month.ratePercent) }}>
                    {month.ratePercent === null ? '—' : formatPercent(month.ratePercent)}
                  </strong>
                </div>
              ))}
            </div>
            <div className="capital-return-tag-modal-note">
              Opening and closing balances are valued in {baseCurrency} at each month's closing rates. Earnings exclude recorded external flows attributed to this tag; return is time-weighted and not annualized.
            </div>
          </div>
        </div>
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
              <AreaChart data={netWorthData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
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
              formatCompact={formatCompact}
              series={decompositionSeries}
            />
          </ChartCard>
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h3 style={{ ...SECTION_TITLE_STYLE, margin: 0 }}>ALLOCATION</h3>
          <div style={{ display: 'flex', gap: '4px', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '3px', background: 'rgba(255,255,255,0.03)' }}>
            {(['percent', 'value'] as const).map(mode => (
              <button
                key={mode}
                className="btn"
                onClick={() => setAllocationMode(mode)}
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                  border: 'none',
                  background: allocationMode === mode ? 'var(--accent)' : 'transparent',
                  color: allocationMode === mode ? 'white' : 'var(--text-secondary)'
                }}
              >
                {mode === 'percent' ? <Percent size={13} /> : <BarChart3 size={13} />}
                {mode === 'percent' ? 'Share' : 'Value'}
              </button>
            ))}
          </div>
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
              <div data-testid="organization-currency-chart" style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={visibleOrganizationCurrencyChartData} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 4 }} barCategoryGap="16%">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} stroke="var(--text-secondary)" tickFormatter={value => `${value}%`} style={{ fontSize: '11px' }} />
                    <YAxis type="category" dataKey="organization" width={108} stroke="var(--text-secondary)" tickLine={false} style={{ fontSize: '11px', fontWeight: 700 }} />
                    <Tooltip content={<OrganizationCurrencyTooltip baseCurrency={baseCurrency} />} cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }} />
                    <Legend onClick={(event) => handleLegendClickSmart('currencies', event, organizationCurrencies)} wrapperStyle={LEGEND_STYLE} />
                    {organizationCurrencies.map(currency => (
                      <Bar
                        key={currency}
                        dataKey={currency}
                        stackId="currency-share"
                        name={currency}
                        fill={getCurrencyColor(currency)}
                        hide={hiddenSeries.currencies[currency]}
                        maxBarSize={36}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleLegendClickSmart('currencies', { dataKey: currency }, organizationCurrencies)}
                      >
                        <LabelList dataKey={currency} content={renderCurrencySegmentLabel(currency)} />
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
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
