import { ArrowLeftRight, BarChart3, Clock, Coins, Compass, Grid, Landmark, Layers, LineChart as LineChartIcon, ShieldAlert } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Treemap } from 'recharts';
import { getCurrencyColor, getTagColor } from '../../../types';

type ChartDatum = Record<string, any>;

type GraphsAnalyticsSectionsProps = {
  baseCurrency: string;
  activeCurrencies: string[];
  allOrganizations: string[];
  allUsedCurrencies: string[];
  allUsedTags: string[];
  chartColors: string[];
  currencyDistributionData: ChartDatum[];
  currencyRatesData: ChartDatum[];
  decompositionData: ChartDatum[];
  flowChartData: ChartDatum[];
  hiddenBalances: Record<string, boolean>;
  latestSnapshotMonth?: string;
  orgTrendData: ChartDatum[];
  radarData: ChartDatum[];
  tagDistributionData: ChartDatum[];
  treemapData: ChartDatum[];
  usedCurrenciesData: ChartDatum[];
  uxMetricsData: ChartDatum[];
  formatCompact: (value: number) => string;
  formatFriendlyTime: (seconds: number) => string;
  handleLegendClickSmart: (event: any, allKeys: string[]) => void;
};

const LEGEND_STYLE = { cursor: 'pointer', fontSize: '12px', userSelect: 'none' as const };

const CustomizedContentTreemap = (props: any) => {
  const { root, depth, x, y, width, height, index, name, value } = props;
  if (depth !== 1 || width < 40 || height < 30) return null;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: root.children[index].color || 'rgba(59, 130, 246, 0.2)',
          stroke: 'var(--bg-color)',
          strokeWidth: 2,
          fillOpacity: 0.35,
        }}
      />
      <text
        x={x + width / 2}
        y={y + height / 2 - 2}
        textAnchor="middle"
        fill="var(--text-primary)"
        fontSize={11}
        fontWeight={600}
      >
        {name}
      </text>
      <text
        x={x + width / 2}
        y={y + height / 2 + 12}
        textAnchor="middle"
        fill="var(--text-secondary)"
        fontSize={10}
      >
        {Intl.NumberFormat('en-US', { notation: "compact" }).format(value)}
      </text>
    </g>
  );
};

const OrgCustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const sortedPayload = [...payload].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

  return (
    <div
      className="custom-tooltip shadow-2xl"
      style={{
        backgroundColor: 'var(--bg-color)',
        border: '1px solid var(--glass-border)',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '13px',
        width: '280px',
        maxHeight: '260px',
        overflowY: 'auto'
      }}
    >
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
                {Math.round(numValue).toLocaleString('en-US')}
              </span>
            </div>
          );
        })}
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
  currencyDistributionData,
  currencyRatesData,
  decompositionData,
  flowChartData,
  hiddenBalances,
  latestSnapshotMonth,
  orgTrendData,
  radarData,
  tagDistributionData,
  treemapData,
  usedCurrenciesData,
  uxMetricsData,
  formatCompact,
  formatFriendlyTime,
  handleLegendClickSmart
}: GraphsAnalyticsSectionsProps) {
  return (
    <>
      <div>
        <h3 className="mb-4" style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>
          HISTORICAL FINANCIAL METRICS
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 400, marginLeft: '8px' }}>
            (Double Click to isolate metrics / Single Click to toggle)
          </span>
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div className="glass-panel" style={{ height: '350px', display: 'flex', flexDirection: 'column' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><Coins size={16} className="text-secondary" /> Absolute Currency Balances Dynamics</h4>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={usedCurrenciesData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }} formatter={(val) => Math.round(Number(val)).toLocaleString('en-US')} />
                <Legend onClick={(event) => handleLegendClickSmart(event, allUsedCurrencies)} wrapperStyle={LEGEND_STYLE} />
                {allUsedCurrencies.map(currency => (
                  <Line key={currency} type="monotone" dataKey={currency} stroke={getCurrencyColor(currency)} strokeWidth={2} dot={{ r: 3 }} hide={hiddenBalances[currency]} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel" style={{ height: '350px', display: 'flex', flexDirection: 'column' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><LineChartIcon size={16} className="text-secondary" /> Exchange Rates Dynamic History ({baseCurrency})</h4>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={currencyRatesData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="left" stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#64748b" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }}
                  formatter={(value, name, props) => {
                    const isInverted = props.payload[`${name}_isInverted`];
                    const num = Number(value).toLocaleString('en-US');
                    if (isInverted) {
                      return [`${num} per ${baseCurrency}`, name];
                    }
                    return [`${num} ${baseCurrency}`, name];
                  }}
                />
                <Legend onClick={(event) => handleLegendClickSmart(event, activeCurrencies)} wrapperStyle={LEGEND_STYLE} />

                {activeCurrencies.map(currency => {
                  const samplePoint = currencyRatesData[0];
                  const isHighNominal = samplePoint && samplePoint[`${currency}_isInverted`] === true;
                  const yAxisId = isHighNominal ? 'right' : 'left';
                  const color = getCurrencyColor(currency);

                  return (
                    <Line
                      key={currency}
                      yAxisId={yAxisId}
                      type="monotone"
                      dataKey={currency}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      hide={hiddenBalances[currency]}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel" style={{ height: '350px', display: 'flex', flexDirection: 'column', gridColumn: 'span 2' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><ArrowLeftRight size={16} style={{ color: '#10b981' }} /> Deposits & FX Impact Monthly Changes ({baseCurrency})</h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={decompositionData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }} formatter={(val) => Math.round(Number(val)).toLocaleString('en-US')} />
                <Legend wrapperStyle={{ fontSize: '12px', userSelect: 'none' }} />
                <Bar dataKey="Deposits" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="FX Impact" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel" style={{ height: '350px', display: 'flex', flexDirection: 'column' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><Landmark size={16} className="text-secondary" /> Capital Flow by Organization ({baseCurrency})</h4>
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

          <div className="glass-panel" style={{ height: '350px', display: 'flex', flexDirection: 'column' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><Layers size={16} className="text-secondary" /> Portfolio Allocation Structure ({baseCurrency})</h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={currencyDistributionData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }} formatter={(val) => Math.round(Number(val)).toLocaleString('en-US')} />
                <Legend onClick={(event) => handleLegendClickSmart(event, allUsedCurrencies)} wrapperStyle={LEGEND_STYLE} />
                {allUsedCurrencies.map(currency => (
                  <Bar key={currency} dataKey={currency} stackId="a" fill={getCurrencyColor(currency)} hide={hiddenBalances[currency]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel" style={{ height: '350px', display: 'flex', flexDirection: 'column', gridColumn: 'span 2' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}>
              <Layers size={16} style={{ color: 'var(--accent)' }} /> Asset Structure Breakdown by Tags ({baseCurrency})
            </h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tagDistributionData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }}
                  formatter={(val) => Math.round(Number(val)).toLocaleString('en-US')}
                />
                <Legend onClick={(event) => handleLegendClickSmart(event, allUsedTags)} wrapperStyle={LEGEND_STYLE} />
                {allUsedTags.map(tag => {
                  const color = tag === 'untagged' ? '#475569' : getTagColor(tag);

                  return (
                    <Bar
                      key={tag}
                      dataKey={tag}
                      stackId="tags_stack"
                      fill={color}
                      hide={hiddenBalances[tag]}
                    />
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-4" style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>UX & OPERATIONAL METRICS</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div className="glass-panel" style={{ height: '350px', display: 'flex', flexDirection: 'column' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><Clock size={16} className="text-secondary" style={{ color: 'var(--accent)' }} /> Time Invested in Snapshot Management</h4>
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
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }} formatter={(val) => [formatFriendlyTime(Number(val)), 'Session Duration']} />
                <Area type="monotone" dataKey="duration_seconds_raw" stroke="var(--accent)" fillOpacity={1} fill="url(#colorUxDuration)" strokeWidth={2} dot={{ r: 4, fill: 'var(--bg-color)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel" style={{ height: '350px', display: 'flex', flexDirection: 'column' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><BarChart3 size={16} className="text-secondary" style={{ color: '#10b981' }} /> Operational Effort per Financial Account</h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={uxMetricsData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="left" stroke="#10b981" style={{ fontSize: '12px' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#eab308" label={{ value: 'Sec / Account', angle: 90, position: 'insideRight', fill: '#eab308', offset: 10, style: { fontSize: '12px' } }} style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: '12px', userSelect: 'none' }} />
                <Bar yAxisId="left" dataKey="accounts_count" name="Total Tracked Accounts" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Line yAxisId="right" type="monotone" dataKey="cost_per_account" name="Time Cost per Account (Sec)" stroke="#eab308" strokeWidth={3} dot={{ r: 3, fill: 'var(--bg-color)' }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-4" style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>
          HIGH-LEVEL EXECUTIVE INTEL (INSTANT FROM: {latestSnapshotMonth})
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '12px' }}>
          <div className="glass-panel" style={{ height: '380px', display: 'flex', flexDirection: 'column' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><Grid size={16} style={{ color: 'var(--accent)' }} /> Capital Allocation Heatmap (Net Worth Treemap)</h4>
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={treemapData}
                dataKey="value"
                stroke="#fff"
                type="flat"
                content={<CustomizedContentTreemap />}
              >
                <Tooltip formatter={(val) => Math.round(Number(val)).toLocaleString('en-US')} />
              </Treemap>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel" style={{ height: '380px', display: 'flex', flexDirection: 'column' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><Compass size={16} style={{ color: '#eab308' }} /> Portfolio Health & Diversification Vector</h4>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="subject" stroke="var(--text-secondary)" style={{ fontSize: '11px', fontWeight: 500 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="rgba(255,255,255,0.2)" style={{ fontSize: '10px' }} />
                <Radar name="Portfolio Score" dataKey="A" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} />
                <Tooltip wrapperStyle={{ userSelect: 'none' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel" style={{ height: '340px', display: 'flex', flexDirection: 'column', gridColumn: 'span 2' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><ShieldAlert size={16} style={{ color: '#10b981' }} /> Cross-Asset Liquidity Matrix (Organizations to Currencies)</h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowChartData} layout="vertical" margin={{ top: 10, right: 10, left: 40, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }} formatter={(val) => Math.round(Number(val)).toLocaleString('en-US')} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {allUsedCurrencies.map(currency => (
                  <Bar key={currency} dataKey={currency} stackId="a" fill={getCurrencyColor(currency)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
