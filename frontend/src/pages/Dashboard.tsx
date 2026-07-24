import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TrendingUp, DollarSign, Edit, Copy, Trash2, Calendar, MessageSquare, ArrowLeftRight, Clock } from 'lucide-react';
import { AreaChart, Area, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { API_URL } from '../types';
import type { ParsedSnapshot } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useSnapshots } from '../hooks/useSnapshots';
import { useFlowEntries } from '../hooks/useFlowEntries';
import { SnapshotDiffModal } from './components/SnapshotDiffModal';
import { SnapshotNotesModal } from './components/SnapshotNotesModal';
import { PageLoader } from './components/PageLoader';
import { GraphTooltip, SimpleGraphTooltip } from './components/graphs/GraphTooltip';
import { ScrollForMore } from './components/ScrollForMore';
import { SnapshotDraftsNotice } from './components/SnapshotDraftsNotice';
import { isTextInputTarget } from '../lib/hotkeys';
import {
  calculateCurrencyTotals,
  calculateFlowDecomposition,
  calculateOrganizationTotal,
  calculateTotals,
  convertAmount,
  hasAnyComments
} from '../lib/finance';

const DASHBOARD_PIE_VISIBLE_ROWS = 7;

const CustomTooltip = ({ active, payload, label, baseCurrency, secondaryCurrency }: any) => {
  if (!active || !payload || !payload.length) return null;

  const hasComment = payload[0]?.payload?.hasComment;
  const rows = [
    { name: 'BASE', currency: baseCurrency, color: '#10b981' },
    { name: 'SECONDARY', currency: secondaryCurrency, color: '#6366f1' }
  ].flatMap(series => {
    const item = payload.find((entry: any) => entry.name === series.name);
    if (!item || !series.currency) return [];
    return [{
      key: series.name,
      label: `Total ${series.currency}`,
      value: Number(item.value || 0).toLocaleString('en-US'),
      color: series.color,
      markerColor: series.color
    }];
  });

  return (
    <GraphTooltip
      title={label}
      titleValue={hasComment ? '📝 Click to view notes' : undefined}
      rows={rows}
      style={{ minWidth: '250px' }}
    />
  );
};

export default function Dashboard() {
  const { settings } = useSettings();
  const { snapshots, setSnapshots, loading } = useSnapshots({ sort: 'asc' });
  const baseCurrency = settings.baseCurrency || 'RUB';
  const secondaryCurrency = settings.secondaryCurrency ?? 'USD';

  const [activeViewNotes, setActiveViewNotes] = useState<ParsedSnapshot | null>(null);
  const [diffModalData, setDiffModalData] = useState<{ current: ParsedSnapshot; previous: ParsedSnapshot | null } | null>(null);
  const [onlyChanges, setOnlyChanges] = useState(true);
  const { entries: flowEntries } = useFlowEntries(Boolean(settings.cashFlow?.enabled && diffModalData));

  const navigate = useNavigate();
  const latestSnapshot = useMemo(() => snapshots.length > 0 ? snapshots[snapshots.length - 1] : null, [snapshots]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTextInputTarget(e.target)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setActiveViewNotes(null);
        setDiffModalData(null);
        return;
      }

      if (activeViewNotes) {
        if (e.code === 'KeyE') {
          e.preventDefault();
          navigate(`/snapshot/${activeViewNotes.month}`);
        }
        return;
      }

      if (diffModalData) {
        if (e.code === 'KeyD') {
          e.preventDefault();
          setOnlyChanges(prev => !prev);
        }
        return;
      }

      if (e.code === 'KeyC' && latestSnapshot) {
        e.preventDefault();
        navigate(`/snapshot/copy/${latestSnapshot.month}`);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeViewNotes, diffModalData, latestSnapshot, navigate]);

  const handleDelete = (month: string) => {
    const confirmText = prompt(`To delete this snapshot, type its name: ${month}`);
    if (confirmText === month) {
      fetch(`${API_URL}/snapshots/${month}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(() => setSnapshots(prev => prev.filter(s => s.month !== month)))
        .catch(e => {
          console.error(e);
          alert('Failed to delete snapshot');
        });
    } else if (confirmText !== null) {
      alert('Name did not match. Deletion cancelled.');
    }
  };

  const chartData = useMemo(() => {
    const points = snapshots.map(s => {
      const totals = calculateTotals(s, baseCurrency, secondaryCurrency);
      return {
        name: s.month,
        BASE: Math.round(totals.totalBase),
        SECONDARY: Math.round(totals.totalSecondary),
        hasComment: hasAnyComments(s)
      };
    });
    return points;
  }, [snapshots, baseCurrency, secondaryCurrency]);

  const CommentDot = (props: any) => {
    const { cx, cy, index, payload } = props;
    if (payload && payload.hasComment) {
      return (
        <g key={cx} style={{ cursor: 'pointer', filter: 'drop-shadow(0 0 3px rgba(52, 211, 153, 0.34))' }}>
          <line
            x1={cx}
            y1={cy + 7}
            x2={cx}
            y2="calc(100% - 45px)"
            stroke="#34d399"
            strokeWidth={1}
            strokeDasharray="3 5"
            opacity={0.28}
          />
          <circle
            className="dashboard-comment-dot-halo"
            cx={cx}
            cy={cy}
            r={6.4}
            fill="none"
            stroke="rgba(110, 231, 183, 0.56)"
            strokeWidth={1}
          >
            <animate
              attributeName="r"
              values="6.4;11.5"
              dur="2.8s"
              begin={`${(Number(index || 0) % 5) * 0.42}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.82;0"
              dur="2.8s"
              begin={`${(Number(index || 0) % 5) * 0.42}s`}
              repeatCount="indefinite"
            />
          </circle>
          <circle cx={cx} cy={cy} r={5.25} fill="var(--bg-color)" fillOpacity={0.96} stroke="#6ee7b7" strokeWidth={2.5} />
          <circle cx={cx} cy={cy} r={2.25} fill="#10b981" />
        </g>
      );
    }
    return <g />;
  };

  const handleChartClick = (state: any) => {
    if (state && state.activeLabel) {
      const clickedMonth = state.activeLabel;
      const snapshot = snapshots.find(s => s.month === clickedMonth);
      if (snapshot && hasAnyComments(snapshot)) {
        setActiveViewNotes(snapshot);
      }
    }
  };

  const CHART_COLORS = ['#eab308', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#ef4444', '#10b981'];

  const latestTotals = useMemo(
    () => latestSnapshot ? calculateTotals(latestSnapshot, baseCurrency, secondaryCurrency) : { totalBase: 0, totalSecondary: 0 },
    [latestSnapshot, baseCurrency, secondaryCurrency]
  );

  const pieData = useMemo(() => {
    if (!latestSnapshot) return [];
    return latestSnapshot.data.organizations.map(org => {
      let orgTotalBase = calculateOrganizationTotal(org, latestSnapshot.data.rates, baseCurrency);
      return { name: org.name || 'Unnamed', value: Math.round(orgTotalBase) };
    })
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [latestSnapshot, baseCurrency]);

  const renderDiff = (current: number, previous: number | undefined) => {
    if (previous === undefined || previous === 0) return null;
    const diff = current - previous;
    if (Math.abs(diff) < 1) return null;
    const percent = (diff / previous) * 100;
    
    // Используем CSS-переменные с безопасным фоллбэком на пастель
    const color = diff > 0 
      ? 'var(--diff-positive, hsl(142, 45%, 55%))' 
      : 'var(--diff-negative, hsl(0, 45%, 60%))';
      
    const sign = diff > 0 ? '+' : '';
    const formattedDiff = Math.round(diff).toLocaleString('en-US');
    const formattedPercent = percent.toFixed(1);

    return (
      <div style={{ color, fontSize: '0.85em', marginTop: '2px', fontWeight: 500 }}>
        {sign}{formattedDiff} ({sign}{formattedPercent}%)
      </div>
    );
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
  };

  const currentYear = new Date().getFullYear().toString();

  const { groupsByYear, sortedYears, reversedSnapshots } = useMemo(() => {
    const groups: Record<string, ParsedSnapshot[]> = {};
    const reversed = [...snapshots].reverse();

    reversed.forEach(s => {
      const year = s.month.split('-')[0];
      if (!groups[year]) groups[year] = [];
      groups[year].push(s);
    });

    const sorted = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return { groupsByYear: groups, sortedYears: sorted, reversedSnapshots: reversed };
  }, [snapshots]);

  const formatCompactNumber = (number: number) => {
    return Intl.NumberFormat('en-US', {
      notation: "compact",
      maximumFractionDigits: 1
    }).format(number);
  };

  const handleOpenDiff = (currentSnapshot: ParsedSnapshot) => {
    const globalIndex = snapshots.findIndex(s => s.month === currentSnapshot.month);
    const previousSnapshot = globalIndex > 0 ? snapshots[globalIndex - 1] : null;
    setDiffModalData({ current: currentSnapshot, previous: previousSnapshot });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Overview</h2>
        <Link to="/snapshot/new" className="btn btn-primary" title="New Snapshot (N)">
          New Snapshot
        </Link>
      </div>

      <SnapshotDraftsNotice />

      {loading ? (
        <PageLoader label="Loading dashboard" />
      ) : snapshots.length === 0 ? (
        <section className="glass-panel dashboard-empty-state">
          <div className="dashboard-empty-state-icon" aria-hidden="true">
            <TrendingUp size={26} />
          </div>
          <div>
            <h3>Start your financial history</h3>
            <p>Click New Snapshot to record where you are today and begin tracking changes over time.</p>
          </div>
          <Link to="/snapshot/new" className="btn btn-primary" title="New Snapshot (N)">
            New Snapshot
          </Link>
          <span className="dashboard-empty-state-hint">You can also press N</span>
        </section>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-panel flex items-center justify-between" style={{ padding: '20px 24px', minHeight: 'auto', flex: 1 }}>
                <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.95rem' }}>
                  <TrendingUp size={20} />
                  <span>Total Net Worth ({baseCurrency})</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', lineHeight: '1' }}>
                  {Math.round(latestTotals.totalBase).toLocaleString('en-US')}
                </div>
              </div>
              {secondaryCurrency && secondaryCurrency !== baseCurrency && (
                <div className="glass-panel flex items-center justify-between" style={{ padding: '20px 24px', minHeight: 'auto', flex: 1 }}>
                  <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.95rem' }}>
                    <DollarSign size={20} />
                    <span>Total Net Worth ({secondaryCurrency})</span>
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 'bold', lineHeight: '1' }}>
                    {Math.round(latestTotals.totalSecondary).toLocaleString('en-US')}
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel dashboard-pie-panel">
              <div className="dashboard-pie-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                      {pieData.map((_entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<SimpleGraphTooltip formatter={(value, _name, item) => [
                      `${Number(value).toLocaleString('en-US')} ${baseCurrency}`,
                      item.payload.name
                    ]} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ScrollForMore
                orientation="vertical"
                scrollContainerId="dashboard-pie-legend-scroll"
                total={pieData.length}
                visible={DASHBOARD_PIE_VISIBLE_ROWS}
              />

              <div className="dashboard-pie-legend">
                <div
                  id="dashboard-pie-legend-scroll"
                  className="dashboard-pie-legend-scroll"
                  tabIndex={pieData.length > DASHBOARD_PIE_VISIBLE_ROWS ? 0 : undefined}
                  aria-label={pieData.length > DASHBOARD_PIE_VISIBLE_ROWS ? 'Organization allocation. Scroll for more organizations.' : 'Organization allocation'}
                >
                  {pieData.map((entry, idx) => {
                    const percent = latestTotals.totalBase > 0 ? (entry.value / latestTotals.totalBase) * 100 : 0;
                    return (
                      <div key={entry.name} className="dashboard-pie-legend-row">
                        <span className="dashboard-pie-legend-marker" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                        <span className="dashboard-pie-legend-name" title={entry.name}>{entry.name}:</span>
                        <span className="dashboard-pie-legend-value">{percent.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {snapshots.length > 0 && (
            <div className="glass-panel" style={chartStyles.panel}>
              <h3 className="mb-4" style={chartStyles.title}>Net Worth Trend</h3>
              <div style={{ flex: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={chartStyles.margin} onClick={handleChartClick}>
                    <defs>
                      <linearGradient id="colorBase" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="var(--text-secondary)" tickMargin={10} />
                    <YAxis yAxisId="left" stroke="var(--text-secondary)" tickFormatter={(val) => formatCompactNumber(val)} />
                    {secondaryCurrency && secondaryCurrency !== baseCurrency && (
                      <YAxis yAxisId="right" orientation="right" stroke="#6366f1" tickFormatter={(val) => formatCompactNumber(val)} />
                    )}
                    <Tooltip content={<CustomTooltip baseCurrency={baseCurrency} secondaryCurrency={secondaryCurrency} />} />
                    <Area yAxisId="left" type="monotone" dataKey="BASE" name="BASE_FILL" stroke="none" fillOpacity={1} fill="url(#colorBase)" dot={false} activeDot={false} />
                    {secondaryCurrency && secondaryCurrency !== baseCurrency && (
                      <Line yAxisId="right" type="monotone" dataKey="SECONDARY" name="SECONDARY" stroke="#6366f1" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                    )}
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="BASE"
                      name="BASE"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={<CommentDot />}
                      activeDot={{ r: 6, fill: '#10b981', stroke: '#d1fae5', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <h3 className="mb-4" style={{ marginTop: 0 }}>History</h3>
          {sortedYears.map(year => {
            const yearSnaps = groupsByYear[year];
            const yearLatestTotals = calculateTotals(yearSnaps[0], baseCurrency, secondaryCurrency);
            const prevYearStr = String(Number(year) - 1);
            const prevYearSnaps = groupsByYear[prevYearStr];
            const prevYearTotals = prevYearSnaps ? calculateTotals(prevYearSnaps[0], baseCurrency, secondaryCurrency) : undefined;
            const isDefaultOpen = year === currentYear || year === sortedYears[0];

            return (
              <details key={year} open={isDefaultOpen} className="glass-panel mb-4" style={{ padding: 0, overflow: 'hidden' }}>
                <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', cursor: 'pointer', userSelect: 'none', listStyle: 'none' }} className="hover:bg-[rgba(255,255,255,0.02)]">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Calendar size={20} style={{ color: 'var(--text-secondary)' }} />
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{year} Year</span>
                  </div>
                  <div style={{ display: 'flex', gap: '32px', fontSize: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Total: <b style={{ color: 'var(--text-primary)' }}>{Math.round(yearLatestTotals.totalBase).toLocaleString('en-US')} {baseCurrency}</b></span>
                      {renderDiff(yearLatestTotals.totalBase, prevYearTotals?.totalBase)}
                    </div>
                    {secondaryCurrency && secondaryCurrency !== baseCurrency && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>{Math.round(yearLatestTotals.totalSecondary).toLocaleString('en-US')} {secondaryCurrency}</b></span>
                        {renderDiff(yearLatestTotals.totalSecondary, prevYearTotals?.totalSecondary)}
                      </div>
                    )}
                  </div>
                </summary>
                <div style={{ padding: '0 24px 24px 24px', borderTop: '1px solid var(--glass-border)' }}>
                  <table className="table" style={{ marginTop: '12px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Month</th>
                        <th style={{ width: secondaryCurrency && secondaryCurrency !== baseCurrency ? '20%' : '25%' }}>Total {baseCurrency}</th>
                        {secondaryCurrency && secondaryCurrency !== baseCurrency && (
                          <th style={{ width: '20%' }}>Total {secondaryCurrency}</th>
                        )}
                        <th style={{ width: '25%' }}>Breakdown by Currency</th>
                        <th style={{ width: '10%' }} className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearSnaps.map(s => {
                        const totals = calculateTotals(s, baseCurrency, secondaryCurrency);
                        const currencyTotals = calculateCurrencyTotals(s);
                        const globalIndex = reversedSnapshots.findIndex(snap => snap.month === s.month);
                        const prevSnapshot = reversedSnapshots[globalIndex + 1];
                        const prevTotals = prevSnapshot ? calculateTotals(prevSnapshot, baseCurrency, secondaryCurrency) : undefined;
                        const prevCurrencyTotals = prevSnapshot ? calculateCurrencyTotals(prevSnapshot) : {};
                        const allMergedCurrencies = Array.from(new Set([...Object.keys(currencyTotals), ...Object.keys(prevCurrencyTotals)]));
                        const changedCurrencies: { curr: string, amt: number, diff: number }[] = [];
                        const unchangedCurrencies: { curr: string, amt: number, diff: number }[] = [];
                        const { organicDelta: organicBase, fxImpactDelta: fxImpactBase } = calculateFlowDecomposition(s, prevSnapshot || null, baseCurrency);

                        allMergedCurrencies.forEach(curr => {
                          const currentAmt = currencyTotals[curr] || 0;
                          const prevAmt = prevCurrencyTotals[curr] || 0;
                          const diff = prevSnapshot ? currentAmt - prevAmt : 0;

                          if (Math.abs(diff) >= 1) changedCurrencies.push({ curr, amt: currentAmt, diff });
                          else if (currentAmt > 0) unchangedCurrencies.push({ curr, amt: currentAmt, diff });
                        });
                        changedCurrencies.sort((a, b) => a.curr.localeCompare(b.curr));
                        unchangedCurrencies.sort((a, b) => a.curr.localeCompare(b.curr));

                        const renderCurrencyRow = ({ curr, amt, diff }: { curr: string, amt: number, diff: number }) => {
                          const amtInBase = convertAmount(amt, curr, baseCurrency, s.data.rates);
                          const percentOfTotal = totals.totalBase > 0 ? (amtInBase / totals.totalBase) * 100 : 0;
                          const prevAmt = (prevCurrencyTotals[curr] || 0);
                          const diffPercent = prevAmt > 0 ? (diff / prevAmt) * 100 : 0;

                          return (
                            <div key={curr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }} className="last:border-0 last:pb-0">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>{curr}</span>
                                <span style={{ fontSize: '0.75em', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.03)', padding: '1px 4px', borderRadius: '4px' }}>{percentOfTotal.toFixed(1)}%</span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span style={{ fontSize: '0.95em', fontWeight: 500, color: amt === 0 ? 'var(--text-secondary)' : 'inherit' }}>{Math.round(amt).toLocaleString('en-US')}</span>
                                {Math.abs(diff) >= 1 && (
                                  <span style={{ fontSize: '0.75em', color: diff > 0 ? 'var(--diff-positive, hsl(142, 45%, 55%))' : 'var(--diff-negative, hsl(0, 45%, 60%))', fontWeight: 500, marginTop: '1px' }}>
                                    {diff > 0 ? '+' : ''}{Math.round(diff).toLocaleString('en-US')}{prevAmt > 0 && ` (${diff > 0 ? '+' : ''}${diffPercent.toFixed(1)}%)`}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        };

                        return (
                          <tr key={s.month}>
                            <td style={{ verticalAlign: 'top', paddingTop: '16px' }}>
                              <div style={{ fontWeight: 500, fontSize: '1.05em' }}>{s.month}</div>
                              <div className="flex flex-col gap-1 items-start mt-2">
                                {hasAnyComments(s) && <button className="btn text-primary hover:underline" style={{ padding: 0, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85em', color: '#3b82f6' }} onClick={() => setActiveViewNotes(s)}><MessageSquare size={14} /> Notes</button>}
                                <button className="btn text-primary hover:underline" style={{ padding: 0, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85em', color: '#10b981' }} onClick={() => handleOpenDiff(s)}><ArrowLeftRight size={14} /> Diff</button>
                                {s.duration_seconds !== undefined && s.duration_seconds > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75em', color: 'var(--text-secondary)', marginTop: '4px' }}><Clock size={12} /> {formatDuration(s.duration_seconds)}</div>}
                              </div>
                            </td>
                            <td style={{ verticalAlign: 'top', paddingTop: '16px' }}>
                              <div style={{ fontWeight: 500 }}>{Math.round(totals.totalBase).toLocaleString('en-US')}</div>
                              {renderDiff(totals.totalBase, prevTotals?.totalBase)}

                              {prevSnapshot && (Math.abs(organicBase) > 1 || Math.abs(fxImpactBase) > 1) && (
                                <div style={{ fontSize: '0.75em', marginTop: '8px', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '6px', display: 'inline-block', minWidth: '135px' }}>
                                  <div style={{ marginBottom: '2px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Deposits:</span>
                                    <span style={{ fontWeight: 600, color: organicBase > 0 ? 'var(--diff-positive, hsl(142, 45%, 55%))' : organicBase < 0 ? 'var(--diff-negative, hsl(0, 45%, 60%))' : 'inherit' }}>
                                      {organicBase > 0 ? '+' : ''}{Math.round(organicBase).toLocaleString('en-US')}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>FX Impact:</span>
                                    <span style={{ fontWeight: 600, color: fxImpactBase > 0 ? 'var(--diff-positive, hsl(142, 45%, 55%))' : fxImpactBase < 0 ? 'var(--diff-negative, hsl(0, 45%, 60%))' : 'inherit' }}>
                                      {fxImpactBase > 0 ? '+' : ''}{Math.round(fxImpactBase).toLocaleString('en-US')}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </td>
                            {secondaryCurrency && secondaryCurrency !== baseCurrency && (
                              <td style={{ verticalAlign: 'top', paddingTop: '16px' }}>
                                <div style={{ fontWeight: 500 }}>{Math.round(totals.totalSecondary).toLocaleString('en-US')}</div>
                                {renderDiff(totals.totalSecondary, prevTotals?.totalSecondary)}
                              </td>
                            )}
                            <td style={{ verticalAlign: 'top', paddingTop: '16px', paddingBottom: '16px', minWidth: '180px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {changedCurrencies.map(renderCurrencyRow)}
                                {unchangedCurrencies.length > 0 && (
                                  <details style={{ cursor: 'pointer', marginTop: changedCurrencies.length > 0 ? '8px' : '0' }}>
                                    <summary style={{ fontSize: '0.85em', color: '#6366f1', fontWeight: 500, userSelect: 'none', listStyle: 'none' }}>{changedCurrencies.length > 0 ? 'View unchanged' : 'View Breakdown'}</summary>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>{unchangedCurrencies.map(renderCurrencyRow)}</div>
                                  </details>
                                )}
                              </div>
                            </td>
                            <td className="text-right align-top" style={{ paddingTop: '16px' }}>
                              <div className="flex justify-end gap-2">
                                <Link to={`/snapshot/${s.month}`} className="btn btn-primary" title="Edit" style={{ padding: '8px' }}><Edit size={16} /></Link>
                                <button className="btn" title={s.month === latestSnapshot?.month ? 'Copy as new snapshot (C)' : 'Copy as new snapshot'} style={{ padding: '8px' }} onClick={() => navigate(`/snapshot/copy/${s.month}`)}><Copy size={16} /></button>
                                <button className="btn btn-danger" title="Delete snapshot" style={{ padding: '8px' }} onClick={() => handleDelete(s.month)}><Trash2 size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </>
      )}

      {activeViewNotes && (
        <SnapshotNotesModal
          snapshot={activeViewNotes}
          onClose={() => setActiveViewNotes(null)}
        />
      )}

      {diffModalData && (
        <SnapshotDiffModal
          current={diffModalData.current}
          previous={diffModalData.previous}
          snapshots={snapshots}
          cashFlowEnabled={Boolean(settings.cashFlow?.enabled)}
          flowEntries={flowEntries}
          onlyChanges={onlyChanges}
          onOnlyChangesChange={setOnlyChanges}
          onClose={() => setDiffModalData(null)}
        />
      )}
    </div>
  );
}

const chartStyles = {
  panel: {
    height: '400px',
    display: 'flex',
    flexDirection: 'column' as const,
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    paddingBottom: 16,
  },
  margin: {
    top: 10,
    right: 10,
    left: 0,
    bottom: 15,
  },
};
