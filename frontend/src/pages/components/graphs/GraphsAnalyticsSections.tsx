import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Activity, ArrowLeftRight, BarChart3, ChevronDown, Clock, Grid, Landmark, Layers, LineChart as LineChartIcon, ListFilter, Percent, TrendingUp } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, ScatterChart, Scatter, CartesianGrid, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine } from 'recharts';
import { getCurrencyColor, getTagColor } from '../../../types';
import { HelpTooltip } from '../HelpTooltip';

type ChartDatum = Record<string, any>;

type SummaryStat = {
  label: string;
  value: number;
  suffix?: string;
  percent?: number;
  help: string;
};

type MoverDatum = {
  name: string;
  value: number;
  delta: number;
  percent: number;
};

type ConcentrationStat = {
  label: string;
  name: string;
  value: number;
  percent: number;
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
  concentrationStats: ConcentrationStat[];
  cashFlowMonthlyData: ChartDatum[];
  cashFlowEventsData: ChartDatum[];
  currencyDistributionData: ChartDatum[];
  currencyRatesData: ChartDatum[];
  decompositionData: ChartDatum[];
  flowChartData: ChartDatum[];
  hiddenSeries: HiddenLegendSeries;
  latestSnapshotMonth?: string;
  netWorthData: ChartDatum[];
  orgTrendData: ChartDatum[];
  summaryStats: SummaryStat[];
  tagDistributionData: ChartDatum[];
  tagReturnCoverage: { assigned: number; total: number };
  tagReturnStats: TagReturnStat[];
  topCurrencyMovers: MoverDatum[];
  topOrganizationMovers: MoverDatum[];
  topTagMovers: MoverDatum[];
  treemapData: ChartDatum[];
  uxMetricsData: ChartDatum[];
  formatCompact: (value: number) => string;
  formatFriendlyTime: (seconds: number) => string;
  handleLegendClickSmart: (group: LegendGroup, event: any, allKeys: string[]) => void;
};

const LEGEND_STYLE = { cursor: 'pointer', fontSize: '12px', userSelect: 'none' as const };
const CARD_STYLE = { height: '350px', display: 'flex', flexDirection: 'column' as const };
const GRID_2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' };
const SECTION_TITLE_STYLE = { color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' };
const TOOLTIP_STYLE = { backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 };

const formatNumber = (value: number) => Math.round(value).toLocaleString('en-US');
const formatMoney = (value: number, suffix: string) => `${formatNumber(value)} ${suffix}`;

const getDeltaColor = (value: number) => {
  if (value > 0) return 'var(--diff-positive, hsl(142, 45%, 55%))';
  if (value < 0) return 'var(--diff-negative, hsl(0, 45%, 60%))';
  return 'var(--text-secondary)';
};

const formatSigned = (value: number) => `${value > 0 ? '+' : ''}${formatNumber(value)}`;

const normalizeStackData = (data: ChartDatum[], keys: string[]) => {
  return data.map(point => {
    const total = keys.reduce((sum, key) => sum + Number(point[key] || 0), 0);
    return {
      month: point.month,
      ...Object.fromEntries(keys.map(key => [key, total > 0 ? (Number(point[key] || 0) / total) * 100 : 0]))
    };
  });
};

const OrganizationHeatmap = ({ data, baseCurrency }: { data: ChartDatum[]; baseCurrency: string }) => {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const rows = data
    .filter(item => Number(item.value || 0) > 0)
    .map(item => ({
      name: String(item.name || 'Unnamed'),
      value: Number(item.value || 0),
      color: String(item.color || 'var(--accent)')
    }))
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
        No organization balances in this snapshot.
      </div>
    );
  }

  return (
    <div
      data-graph="organization-heatmap"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gridAutoRows: '1fr',
        gap: '10px',
        height: '100%',
        minHeight: 0
      }}
    >
      {rows.slice(0, 9).map((row, index) => {
        const percent = total > 0 ? (row.value / total) * 100 : 0;
        const isLargest = index === 0;

        return (
          <div
            key={row.name}
            data-tile="organization-heatmap"
            title={`${row.name}: ${formatMoney(row.value, baseCurrency)} (${percent.toFixed(1)}%)`}
            style={{
              minHeight: 0,
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--glass-border)',
              background: `linear-gradient(135deg, ${row.color}66, ${row.color}1f)`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '10px',
              overflow: 'hidden',
              boxShadow: isLargest ? `inset 0 0 0 1px ${row.color}99` : 'none'
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </span>
                <span style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 800, flexShrink: 0 }}>
                  #{index + 1}
                </span>
              </div>
              <div style={{ color: 'var(--text-primary)', fontSize: isLargest ? '28px' : '22px', fontWeight: 900, lineHeight: 1, marginTop: '10px' }}>
                {percent.toFixed(0)}%
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, marginBottom: '7px' }}>
                {formatMoney(row.value, baseCurrency)}
              </div>
              <div style={{ height: '5px', background: 'rgba(255,255,255,0.14)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(2, Math.min(percent, 100))}%`, height: '100%', background: 'var(--text-primary)', opacity: 0.8, borderRadius: '999px' }} />
              </div>
            </div>
          </div>
        );
      })}
      {rows.length > 9 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', borderRadius: '8px', border: '1px dashed var(--glass-border)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700 }}>
          +{rows.length - 9} more
        </div>
      )}
    </div>
  );
};

const OrgCustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const sortedPayload = [...payload].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

  return (
    <div className="custom-tooltip shadow-2xl" style={{ ...TOOLTIP_STYLE, padding: '10px 14px', fontSize: '13px', width: '280px', maxHeight: '260px', overflowY: 'auto' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-primary)', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {sortedPayload.map((item: any) => {
          const numValue = Number(item.value) || 0;
          if (numValue === 0) return null;
          return (
            <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                <span style={{ color: item.color, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  {item.name}:
                </span>
              </div>
              <span style={{ fontWeight: 600, color: item.color }}>
                {formatNumber(numValue)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const CashFlowEventTooltip = ({ active, payload, baseCurrency }: any) => {
  if (!active || !payload || !payload.length) return null;
  const event = payload[0].payload;

  return (
    <div className="custom-tooltip shadow-2xl" style={{ ...TOOLTIP_STYLE, padding: '11px 14px', fontSize: '12px', minWidth: '220px', maxWidth: '300px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginBottom: '9px', paddingBottom: '7px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <strong style={{ color: event.fill }}>{event.category}</strong>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{event.month}</span>
      </div>
      <div style={{ color: event.fill, fontSize: '17px', fontWeight: 850, marginBottom: '8px' }}>
        {formatSigned(Number(event.amount))} {baseCurrency}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '5px 10px', color: 'var(--text-secondary)' }}>
        {event.counterparty && <><span>Counterparty</span><strong style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{event.counterparty}</strong></>}
        {Number(event.taxAmount) > 0 && <><span>Gross incoming</span><strong style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{formatMoney(Number(event.grossAmount), baseCurrency)}</strong></>}
        {Number(event.taxAmount) > 0 && <><span>Tax</span><strong style={{ color: '#f97316', textAlign: 'right' }}>−{formatMoney(Number(event.taxAmount), baseCurrency)}</strong></>}
      </div>
      {event.comment && <div style={{ marginTop: '9px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{event.comment}</div>}
    </div>
  );
};

const SummaryCard = ({ stat }: { stat: SummaryStat }) => {
  const color = stat.label === 'Net worth' ? 'var(--text-primary)' : getDeltaColor(stat.value);

  return (
    <div className="glass-panel" style={{ minHeight: '104px', padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stat.label}</span>
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

const MoversList = ({ title, icon, data, baseCurrency, help }: { title: string; icon: ReactNode; data: MoverDatum[]; baseCurrency: string; help: string }) => {
  return (
    <div>
      <ChartTitle icon={icon} help={help}>{title}</ChartTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {data.map(item => (
          <div key={item.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 650 }}>{item.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{formatMoney(item.value, baseCurrency)}</div>
            </div>
            <div style={{ textAlign: 'right', color: getDeltaColor(item.delta), fontWeight: 800 }}>
              {formatSigned(item.delta)}
              {item.percent !== 0 && Number.isFinite(item.percent) && (
                <div style={{ fontSize: '11px', fontWeight: 600, opacity: 0.9 }}>{item.percent > 0 ? '+' : ''}{item.percent.toFixed(1)}%</div>
              )}
            </div>
          </div>
        ))}
        {data.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No movement in this range.</div>}
      </div>
    </div>
  );
};

export function GraphsAnalyticsSections({
  baseCurrency,
  cashFlowEnabled,
  capitalReturnSummary,
  activeCurrencies,
  allOrganizations,
  allUsedCurrencies,
  allUsedTags,
  chartColors,
  concentrationStats,
  cashFlowMonthlyData,
  cashFlowEventsData,
  currencyDistributionData,
  currencyRatesData,
  decompositionData,
  flowChartData,
  hiddenSeries,
  latestSnapshotMonth,
  netWorthData,
  orgTrendData,
  summaryStats,
  tagDistributionData,
  tagReturnCoverage,
  tagReturnStats,
  topCurrencyMovers,
  topOrganizationMovers,
  topTagMovers,
  treemapData,
  uxMetricsData,
  formatCompact,
  formatFriendlyTime,
  handleLegendClickSmart
}: GraphsAnalyticsSectionsProps) {
  const [allocationMode, setAllocationMode] = useState<'percent' | 'value'>('percent');

  const currencyAllocationData = useMemo(() => {
    return allocationMode === 'percent' ? normalizeStackData(currencyDistributionData, allUsedCurrencies) : currencyDistributionData;
  }, [allocationMode, currencyDistributionData, allUsedCurrencies]);

  const tagAllocationData = useMemo(() => {
    return allocationMode === 'percent' ? normalizeStackData(tagDistributionData, allUsedTags) : tagDistributionData;
  }, [allocationMode, tagDistributionData, allUsedTags]);

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
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={allocationFormatter} />
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
            <div className="glass-panel" style={{ padding: '18px 20px' }}>
              <ChartTitle
                icon={<TrendingUp size={16} style={{ color: '#10b981' }} />}
                help="This is a reconciliation, not a broker statement. Balance changes are measured without FX impact; recorded external money is removed, leaving the estimated earnings of unlogged instruments."
              >
                How estimated capital earnings are calculated
              </ChartTitle>
              <div className="capital-return-formula">
                <div><span>Balance change excluding FX</span><strong>{formatSigned(capitalReturnSummary.organicChange)} {baseCurrency}</strong></div>
                <div><span>Minus net external Cash Flow</span><strong>{formatSigned(capitalReturnSummary.externalFlow)} {baseCurrency}</strong></div>
                <div className="is-result"><span>Estimated capital earnings</span><strong style={{ color: getDeltaColor(capitalReturnSummary.result) }}>{formatSigned(capitalReturnSummary.result)} {baseCurrency}</strong></div>
              </div>
              <div className="capital-return-rate">
                <span>Time-weighted return for selected period (not annualized)</span>
                <strong style={{ color: getDeltaColor(capitalReturnSummary.ratePercent) }}>{capitalReturnSummary.ratePercent > 0 ? '+' : ''}{capitalReturnSummary.ratePercent.toFixed(2)}%</strong>
              </div>
              <div className="capital-return-transfer-note">
                Internal transfers do not change net external Cash Flow. Any value difference between their sent and received legs remains in the balance reconciliation; both legs are mapped to their accounts for tag attribution.
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '18px 20px' }}>
              <ChartTitle
                icon={<Layers size={16} style={{ color: '#14b8a6' }} />}
                help="A movement can be attributed to a deposit or stock tag only when its Own account is selected in Cash Flow. The amount is money earned across the selected months. The percentage is a time-weighted return: it follows a virtual unit of money through every month while ignoring deposits and withdrawals. Their signs can therefore differ when the invested balance changes."
              >
                Estimated earnings by balance tag
              </ChartTitle>
              <div className="capital-return-tag-list">
                {tagReturnStats.map(item => (
                  <div key={item.tag} className="capital-return-tag-row">
                    <span style={{ color: item.tag === 'untagged' ? 'var(--text-secondary)' : getTagColor(item.tag) }}>{item.tag}</span>
                    <strong style={{ color: getDeltaColor(item.result) }}>{formatSigned(item.result)} {baseCurrency}</strong>
                    <strong style={{ color: item.ratePercent === null ? 'var(--text-secondary)' : getDeltaColor(item.ratePercent) }}>
                      {item.ratePercent === null ? '—' : `${item.ratePercent > 0 ? '+' : ''}${item.ratePercent.toFixed(2)}%`}
                    </strong>
                  </div>
                ))}
                {tagReturnStats.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Choose at least two snapshots to estimate earnings by tag.</div>}
              </div>
              {tagReturnStats.length > 0 && (
                <div className="capital-return-transfer-note">
                  Amount is money earned. Time-weighted return follows a virtual 1 {baseCurrency} through every month, ignoring deposits and withdrawals. Their signs can differ when the invested balance changes.
                </div>
              )}
              {tagReturnCoverage.total > 0 && tagReturnCoverage.assigned < tagReturnCoverage.total && (
                <div className="capital-return-coverage-warning">
                  {tagReturnCoverage.assigned} of {tagReturnCoverage.total} external movements are assigned to an own account. Assign the rest in Cash Flow for a trustworthy deposit or stock breakdown.
                </div>
              )}
              {tagReturnCoverage.total > 0 && tagReturnCoverage.assigned === tagReturnCoverage.total && (
                <div className="capital-return-coverage-complete">All external movements in this period are assigned to accounts.</div>
              )}
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-4" style={SECTION_TITLE_STYLE}>
          GROWTH
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 400, marginLeft: '8px' }}>
            Double click legends to isolate, single click to toggle
          </span>
        </h3>
        <div style={GRID_2}>
          <ChartCard
            icon={<TrendingUp size={16} style={{ color: '#10b981' }} />}
            help={`Shows total net worth in ${baseCurrency} for each snapshot. The green area is the total converted with that snapshot's rates; the yellow line is the change from the previous snapshot.`}
            title={<>Net Worth Trend ({baseCurrency})</>}
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
                <YAxis yAxisId="left" stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#eab308" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => {
                    const label = name === 'total' ? 'Net worth' : 'Monthly delta';
                    return [formatMoney(Number(value), baseCurrency), label];
                  }}
                />
                <Area yAxisId="left" type="monotone" dataKey="total" name="total" stroke="#10b981" fillOpacity={1} fill="url(#netWorthFill)" strokeWidth={3} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="delta" name="delta" stroke="#eab308" strokeWidth={2} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            icon={<ArrowLeftRight size={16} style={{ color: '#10b981' }} />}
            help={cashFlowEnabled
              ? `Reconciles each snapshot change into recorded external Cash Flow, estimated unrecorded capital return, and exchange-rate impact. Internal transfers are excluded from Cash Flow.`
              : `Splits each snapshot change into organic flow and exchange-rate impact. Enable Cash Flow to separate external movements from estimated capital return.`}
            title={<>{cashFlowEnabled ? 'Capital Return Decomposition' : 'Organic Flow & FX Impact'} ({baseCurrency})</>}
            style={{ gridColumn: 'span 2' }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={decompositionData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => formatMoney(Number(val), baseCurrency)} />
                <Legend wrapperStyle={{ fontSize: '12px', userSelect: 'none' }} />
                {cashFlowEnabled ? (
                  <>
                    <Bar dataKey="External flow" stackId="change" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Capital earnings" stackId="change" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="FX Impact" stackId="change" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </>
                ) : (
                  <>
                    <Bar dataKey="Organic flow" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="FX Impact" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
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
                {mode === 'percent' ? 'Percent' : 'Value'}
              </button>
            ))}
          </div>
        </div>

        <div style={GRID_2}>
          <ChartCard
            icon={<Layers size={16} className="text-secondary" />}
            help={`Shows portfolio split by currency over time. In Percent mode each month is normalized to 100%; in Value mode every currency is converted to ${baseCurrency} using that snapshot's rates.`}
            title="Currency Exposure"
          >
            {renderAllocationChart(currencyAllocationData, allUsedCurrencies, 'currencies', 'currency_stack', getCurrencyColor)}
          </ChartCard>

          <ChartCard
            icon={<Landmark size={16} className="text-secondary" />}
            help={`Shows balances grouped by organization. Each organization's balances are converted to ${baseCurrency} with the rates stored in the same snapshot, then stacked by month.`}
            title={<>Balance by Organization ({baseCurrency})</>}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={orgTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip content={<OrgCustomTooltip />} />
                <Legend onClick={(event) => handleLegendClickSmart('organizations', event, allOrganizations)} wrapperStyle={LEGEND_STYLE} />
                {allOrganizations.map((orgName, idx) => (
                  <Area key={orgName} type="monotone" dataKey={orgName} stackId="1" stroke={chartColors[idx % chartColors.length]} fill={chartColors[idx % chartColors.length]} fillOpacity={0.4} hide={hiddenSeries.organizations[orgName]} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            icon={<Layers size={16} style={{ color: 'var(--accent)' }} />}
            help={`Shows portfolio structure by balance tags. Tagged balances are converted to ${baseCurrency}; if a balance has multiple tags, its value is split evenly between them. Untagged balances go to "untagged".`}
            title="Asset Structure by Tags"
            style={{ gridColumn: 'span 2' }}
          >
            {renderAllocationChart(tagAllocationData, allUsedTags, 'tags', 'tags_stack', tag => tag === 'untagged' ? '#475569' : getTagColor(tag))}
          </ChartCard>
        </div>
      </section>

      <section>
        <h3 className="mb-4" style={SECTION_TITLE_STYLE}>MOVERS & CONCENTRATION</h3>
        <div style={GRID_2}>
          <div className="glass-panel" style={{ minHeight: '360px' }}>
            <MoversList
              title="Organization Movers"
              icon={<Landmark size={16} style={{ color: 'var(--accent)' }} />}
              data={topOrganizationMovers}
              baseCurrency={baseCurrency}
              help={`Ranks organizations by absolute change across the selected period. Start and end balances are converted to ${baseCurrency}; the list is sorted by the largest absolute delta.`}
            />
          </div>
          <div className="glass-panel" style={{ minHeight: '360px' }}>
            <MoversList
              title="Currency Movers"
              icon={<ListFilter size={16} style={{ color: '#eab308' }} />}
              data={topCurrencyMovers}
              baseCurrency={baseCurrency}
              help={`Ranks currencies by value change across the selected period. Amounts in each currency are converted to ${baseCurrency} using the relevant snapshot rates before comparing start and end.`}
            />
          </div>
          <div className="glass-panel" style={{ minHeight: '360px' }}>
            <MoversList
              title="Tag Movers"
              icon={<Layers size={16} style={{ color: '#14b8a6' }} />}
              data={topTagMovers}
              baseCurrency={baseCurrency}
              help={`Ranks tags by value change across the selected period. Multi-tag balances are split evenly between their tags before start and end values are compared.`}
            />
          </div>
          <div className="glass-panel" style={{ minHeight: '360px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <ChartTitle
              icon={<Activity size={16} style={{ color: '#ec4899' }} />}
              help={`Shows the largest current organization, currency, and tag as a share of the latest selected snapshot. Percent is top item value divided by total value in that grouping.`}
            >
              Concentration ({latestSnapshotMonth || 'latest'})
            </ChartTitle>
            {concentrationStats.map(stat => (
              <div key={stat.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline', marginBottom: '8px' }}>
                  <div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>{stat.label}</div>
                    <div style={{ fontWeight: 800, marginTop: '2px' }}>{stat.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800 }}>{stat.percent.toFixed(1)}%</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{formatMoney(stat.value, baseCurrency)}</div>
                  </div>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(stat.percent, 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: '999px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-4" style={SECTION_TITLE_STYLE}>CURRENT COMPOSITION</h3>
        <div style={GRID_2}>
          <ChartCard
            icon={<Grid size={16} style={{ color: 'var(--accent)' }} />}
            help={`Shows the latest selected snapshot as a heatmap by organization. Each tile is one organization converted to ${baseCurrency}; the percentage and fill indicate its share of the selected snapshot total.`}
            title={<>Organization Heatmap ({latestSnapshotMonth || 'latest'})</>}
            style={{ height: '380px' }}
          >
            <div style={{ flex: 1, minHeight: 0 }}>
              <OrganizationHeatmap data={treemapData} baseCurrency={baseCurrency} />
            </div>
          </ChartCard>

          <ChartCard
            icon={<Grid size={16} style={{ color: '#10b981' }} />}
            help={`Shows the latest selected snapshot by organization and currency. Every bar segment is a currency balance converted to ${baseCurrency}, stacked within its organization.`}
            title={<>Organizations to Currencies ({baseCurrency})</>}
            style={{ height: '380px' }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowChartData} layout="vertical" margin={{ top: 10, right: 10, left: 40, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => formatMoney(Number(val), baseCurrency)} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {allUsedCurrencies.map(currency => (
                  <Bar key={currency} dataKey={currency} stackId="a" fill={getCurrencyColor(currency)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
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
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name, props) => {
                  const isInverted = props.payload[`${name}_isInverted`];
                  const num = Number(value).toLocaleString('en-US');
                  if (isInverted) return [`${num} per ${baseCurrency}`, name];
                  return [`${num} ${baseCurrency}`, name];
                }}
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
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatMoney(Number(value), baseCurrency)} />
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
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]} />
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
            icon={<Clock size={16} className="text-secondary" style={{ color: 'var(--accent)' }} />}
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
                <YAxis stroke="var(--text-secondary)" tickFormatter={(val) => formatFriendlyTime(val)} style={{ fontSize: '11px' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => [formatFriendlyTime(Number(val)), 'Session Duration']} />
                <Area type="monotone" dataKey="duration_seconds_raw" stroke="var(--accent)" fillOpacity={1} fill="url(#colorUxDuration)" strokeWidth={2} dot={{ r: 4, fill: 'var(--bg-color)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            panel={false}
            icon={<BarChart3 size={16} className="text-secondary" style={{ color: '#10b981' }} />}
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
                <Tooltip contentStyle={TOOLTIP_STYLE} />
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
