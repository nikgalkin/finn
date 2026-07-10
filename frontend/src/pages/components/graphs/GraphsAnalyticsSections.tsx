import { useMemo, useState } from 'react';
import { Activity, ArrowLeftRight, BarChart3, ChevronDown, Clock, Grid, Landmark, Layers, LineChart as LineChartIcon, ListFilter, Percent, TrendingUp } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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

type GraphsAnalyticsSectionsProps = {
  baseCurrency: string;
  activeCurrencies: string[];
  allOrganizations: string[];
  allUsedCurrencies: string[];
  allUsedTags: string[];
  chartColors: string[];
  concentrationStats: ConcentrationStat[];
  currencyDistributionData: ChartDatum[];
  currencyRatesData: ChartDatum[];
  decompositionData: ChartDatum[];
  flowChartData: ChartDatum[];
  hiddenBalances: Record<string, boolean>;
  latestSnapshotMonth?: string;
  netWorthData: ChartDatum[];
  orgTrendData: ChartDatum[];
  summaryStats: SummaryStat[];
  tagDistributionData: ChartDatum[];
  topCurrencyMovers: MoverDatum[];
  topOrganizationMovers: MoverDatum[];
  topTagMovers: MoverDatum[];
  treemapData: ChartDatum[];
  uxMetricsData: ChartDatum[];
  formatCompact: (value: number) => string;
  formatFriendlyTime: (seconds: number) => string;
  handleLegendClickSmart: (event: any, allKeys: string[]) => void;
};

const LEGEND_STYLE = { cursor: 'pointer', fontSize: '12px', userSelect: 'none' as const };
const CARD_STYLE = { height: '350px', display: 'flex', flexDirection: 'column' as const };
const GRID_2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '24px' };
const SECTION_TITLE_STYLE = { color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' };
const TOOLTIP_STYLE = { backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 };

const formatNumber = (value: number) => Math.round(value).toLocaleString('en-US');

const formatMoney = (value: number, suffix: string) => {
  return `${formatNumber(value)} ${suffix}`;
};

const getDeltaColor = (value: number) => {
  if (value > 0) return 'var(--diff-positive, hsl(142, 45%, 55%))';
  if (value < 0) return 'var(--diff-negative, hsl(0, 45%, 60%))';
  return 'var(--text-secondary)';
};

const formatSigned = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value)}`;
};

const normalizeStackData = (data: ChartDatum[], keys: string[]) => {
  return data.map(point => {
    const total = keys.reduce((sum, key) => sum + Number(point[key] || 0), 0);
    const normalized: ChartDatum = { month: point.month };

    keys.forEach(key => {
      normalized[key] = total > 0 ? (Number(point[key] || 0) / total) * 100 : 0;
    });

    return normalized;
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

const ChartTitle = ({ icon, children, help }: { icon: React.ReactNode; children: React.ReactNode; help: string }) => {
  return (
    <h4 className="flex items-center gap-2" style={{ margin: '0 0 16px 0', fontSize: '14px', minWidth: 0 }}>
      {icon}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      <HelpTooltip text={help} />
    </h4>
  );
};

const MoversList = ({ title, icon, data, baseCurrency, help }: { title: string; icon: React.ReactNode; data: MoverDatum[]; baseCurrency: string; help: string }) => {
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
  activeCurrencies,
  allOrganizations,
  allUsedCurrencies,
  allUsedTags,
  chartColors,
  concentrationStats,
  currencyDistributionData,
  currencyRatesData,
  decompositionData,
  flowChartData,
  hiddenBalances,
  latestSnapshotMonth,
  netWorthData,
  orgTrendData,
  summaryStats,
  tagDistributionData,
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

  return (
    <>
      <section>
        <h3 className="mb-4" style={SECTION_TITLE_STYLE}>PERIOD SNAPSHOT</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
          {summaryStats.map(stat => <SummaryCard key={stat.label} stat={stat} />)}
        </div>
      </section>

      <section>
        <h3 className="mb-4" style={SECTION_TITLE_STYLE}>
          GROWTH
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 400, marginLeft: '8px' }}>
            Double click legends to isolate, single click to toggle
          </span>
        </h3>
        <div style={GRID_2}>
          <div className="glass-panel" style={{ ...CARD_STYLE, gridColumn: 'span 2', height: '390px' }}>
            <ChartTitle
              icon={<TrendingUp size={16} style={{ color: '#10b981' }} />}
              help={`Shows total net worth in ${baseCurrency} for each snapshot. The green area is the total converted with that snapshot's rates; the yellow line is the change from the previous snapshot.`}
            >
              Net Worth Trend ({baseCurrency})
            </ChartTitle>
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
          </div>

          <div className="glass-panel" style={{ ...CARD_STYLE, gridColumn: 'span 2' }}>
            <ChartTitle
              icon={<ArrowLeftRight size={16} style={{ color: '#10b981' }} />}
              help={`Splits each snapshot change into organic flow and exchange-rate impact. Organic flow uses balance amount changes at current rates; FX impact applies rate changes to previous balances.`}
            >
              Deposits & FX Impact Monthly Changes ({baseCurrency})
            </ChartTitle>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={decompositionData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => formatMoney(Number(val), baseCurrency)} />
                <Legend wrapperStyle={{ fontSize: '12px', userSelect: 'none' }} />
                <Bar dataKey="Deposits" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="FX Impact" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
          <div className="glass-panel" style={CARD_STYLE}>
            <ChartTitle
              icon={<Layers size={16} className="text-secondary" />}
              help={`Shows portfolio split by currency over time. In Percent mode each month is normalized to 100%; in Value mode every currency is converted to ${baseCurrency} using that snapshot's rates.`}
            >
              Currency Exposure
            </ChartTitle>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={currencyAllocationData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
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
                <Legend onClick={(event) => handleLegendClickSmart(event, allUsedCurrencies)} wrapperStyle={LEGEND_STYLE} />
                {allUsedCurrencies.map(currency => (
                  <Bar key={currency} dataKey={currency} stackId="currency_stack" fill={getCurrencyColor(currency)} hide={hiddenBalances[currency]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel" style={CARD_STYLE}>
            <ChartTitle
              icon={<Landmark size={16} className="text-secondary" />}
              help={`Shows balances grouped by organization. Each organization's balances are converted to ${baseCurrency} with the rates stored in the same snapshot, then stacked by month.`}
            >
              Balance by Organization ({baseCurrency})
            </ChartTitle>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={orgTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip content={<OrgCustomTooltip />} />
                <Legend onClick={(event) => handleLegendClickSmart(event, allOrganizations)} wrapperStyle={LEGEND_STYLE} />
                {allOrganizations.map((orgName, idx) => (
                  <Area key={orgName} type="monotone" dataKey={orgName} stackId="1" stroke={chartColors[idx % chartColors.length]} fill={chartColors[idx % chartColors.length]} fillOpacity={0.4} hide={hiddenBalances[orgName]} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel" style={{ ...CARD_STYLE, gridColumn: 'span 2' }}>
            <ChartTitle
              icon={<Layers size={16} style={{ color: 'var(--accent)' }} />}
              help={`Shows portfolio structure by balance tags. Tagged balances are converted to ${baseCurrency}; if a balance has multiple tags, its value is split evenly between them. Untagged balances go to "untagged".`}
            >
              Asset Structure by Tags
            </ChartTitle>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tagAllocationData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
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
                <Legend onClick={(event) => handleLegendClickSmart(event, allUsedTags)} wrapperStyle={LEGEND_STYLE} />
                {allUsedTags.map(tag => (
                  <Bar key={tag} dataKey={tag} stackId="tags_stack" fill={tag === 'untagged' ? '#475569' : getTagColor(tag)} hide={hiddenBalances[tag]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
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
          <div className="glass-panel" style={{ ...CARD_STYLE, height: '380px' }}>
            <ChartTitle
              icon={<Grid size={16} style={{ color: 'var(--accent)' }} />}
              help={`Shows the latest selected snapshot as a heatmap by organization. Each tile is one organization converted to ${baseCurrency}; the percentage and fill indicate its share of the selected snapshot total.`}
            >
              Organization Heatmap ({latestSnapshotMonth || 'latest'})
            </ChartTitle>
            <div style={{ flex: 1, minHeight: 0 }}>
              <OrganizationHeatmap data={treemapData} baseCurrency={baseCurrency} />
            </div>
          </div>

          <div className="glass-panel" style={{ ...CARD_STYLE, height: '380px' }}>
            <ChartTitle
              icon={<Grid size={16} style={{ color: '#10b981' }} />}
              help={`Shows the latest selected snapshot by organization and currency. Every bar segment is a currency balance converted to ${baseCurrency}, stacked within its organization.`}
            >
              Organizations to Currencies ({baseCurrency})
            </ChartTitle>
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
          </div>
        </div>
      </section>

      <details className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <summary style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 20px', cursor: 'pointer', userSelect: 'none', listStyle: 'none', borderBottom: '1px solid var(--glass-border)' }}>
          <LineChartIcon size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 800 }}>Exchange Rates</span>
          <HelpTooltip text={`Shows historical rates stored in each snapshot. Values are rendered against ${baseCurrency}; very low nominal rates may be inverted so the line remains readable.`} />
          <ChevronDown size={16} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
        </summary>
        <div style={{ height: '350px', padding: '20px' }}>
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
              <Legend onClick={(event) => handleLegendClickSmart(event, activeCurrencies)} wrapperStyle={LEGEND_STYLE} />
              {activeCurrencies.map(currency => {
                const samplePoint = currencyRatesData[0];
                const isHighNominal = samplePoint && samplePoint[`${currency}_isInverted`] === true;
                const yAxisId = isHighNominal ? 'right' : 'left';

                return (
                  <Line key={currency} yAxisId={yAxisId} type="monotone" dataKey={currency} stroke={getCurrencyColor(currency)} strokeWidth={2} dot={{ r: 3 }} hide={hiddenBalances[currency]} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </details>

      <details className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <summary style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 20px', cursor: 'pointer', userSelect: 'none', listStyle: 'none', borderBottom: '1px solid var(--glass-border)' }}>
          <Clock size={16} style={{ color: '#eab308' }} />
          <span style={{ fontWeight: 800 }}>Snapshot Time & Operational Metrics</span>
          <ChevronDown size={16} style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }} />
        </summary>
        <div style={{ ...GRID_2, padding: '20px' }}>
          <div style={{ ...CARD_STYLE, height: '320px' }}>
            <ChartTitle
              icon={<Clock size={16} className="text-secondary" style={{ color: 'var(--accent)' }} />}
              help="Shows how long each snapshot editing session took. It uses the snapshot duration_seconds field and formats it as seconds or minutes."
            >
              Time Invested in Snapshot Management
            </ChartTitle>
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
          </div>

          <div style={{ ...CARD_STYLE, height: '320px' }}>
            <ChartTitle
              icon={<BarChart3 size={16} className="text-secondary" style={{ color: '#10b981' }} />}
              help="Compares account count with time cost per account. Account count is the number of balance rows in the snapshot; seconds per account is duration_seconds divided by that count."
            >
              Operational Effort per Financial Account
            </ChartTitle>
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
          </div>
        </div>
      </details>
    </>
  );
}
