import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TrendingUp, DollarSign, Edit, Copy, Trash2, Calendar, MessageSquare, X, ArrowLeftRight, Clock, Folder, Coins } from 'lucide-react';
import { AreaChart, Area, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Dot, PieChart, Pie, Cell } from 'recharts';
import { createPortal } from 'react-dom';
import { API_URL, getCurrencyColor } from '../types';
import type { ParsedSnapshot, Snapshot } from '../types';

const CustomTooltip = ({ active, payload, label, baseCurrency, secondaryCurrency }: any) => {
  if (!active || !payload || !payload.length) return null;

  const hasComment = payload[0]?.payload?.hasComment;

  return (
    <div 
      className="custom-tooltip" 
      style={{
        backgroundColor: 'var(--bg-color)',
        border: '1px solid var(--glass-border)',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '14px'
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-primary)' }}>
        {label} {hasComment && '📝 (Click to view notes)'}
      </div>

      <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
        {payload.map((item: any) => {
          const isBase = item.name === 'BASE';
          const numValue = Number(item.value) || 0;
          const formattedValue = numValue.toLocaleString('en-US');

          const color = isBase ? '#10b981' : '#6366f1';
          const title = isBase ? `Total ${baseCurrency}` : `Total ${secondaryCurrency}`;

          return (
            <li key={item.name} style={{ color, padding: '2px 0', fontWeight: 500 }}>
              {title} : {formattedValue}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

type DiffBalanceNode = {
  currency: string;
  previousAmt: number;
  currentAmt: number;
  delta: number;
  deltaPercent: number;
  status: 'new' | 'deleted' | 'up' | 'down' | 'stable';
};

type DiffOrgNode = {
  orgName: string;
  balances: DiffBalanceNode[];
  hasChanges: boolean;
};

export default function Dashboard() {
  const [snapshots, setSnapshots] = useState<ParsedSnapshot[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('RUB');
  const [secondaryCurrency, setSecondaryCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);

  const [activeViewNotes, setActiveViewNotes] = useState<ParsedSnapshot | null>(null);
  const [diffModalData, setDiffModalData] = useState<{ current: ParsedSnapshot; previous: ParsedSnapshot | null } | null>(null);
  const [onlyChanges, setOnlyChanges] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveViewNotes(null);
        setDiffModalData(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/settings`)
      .then(res => res.json())
      .then(resData => {
        const settings = JSON.parse(resData.value);
        if (settings.baseCurrency) setBaseCurrency(settings.baseCurrency);
        setSecondaryCurrency(settings.secondaryCurrency ?? 'USD');
      })
      .catch(console.error);

    fetch(`${API_URL}/snapshots`)
      .then(res => res.json())
      .then((data: Snapshot[]) => {
        const parsed = (data || []).map(s => ({
          ...s,
          data: JSON.parse(s.data)
        }));
        parsed.sort((a, b) => a.month.localeCompare(b.month));
        setSnapshots(parsed);
        loading && setLoading(false);
      })
      .catch(e => {
        console.error(e);
        loading && setLoading(false);
      });
  }, []);

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

  const convertAmount = useCallback((amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number | string>) => {
    if (fromCurrency === toCurrency) return amount;
    
    const rateToOriginalBase = fromCurrency === 'RUB' ? 1 : Number(rates[fromCurrency] || 0);
    const targetRateToOriginalBase = toCurrency === 'RUB' ? 1 : Number(rates[toCurrency] || 0);
    
    if (targetRateToOriginalBase === 0) return 0;
    
    const valueInOriginalBase = amount * rateToOriginalBase;
    return valueInOriginalBase / targetRateToOriginalBase;
  }, []);

  const calculateTotals = useCallback((snap: ParsedSnapshot) => {
    let totalBase = 0;
    let totalSecondary = 0;

    snap.data.organizations.forEach(org => {
      org.balances.forEach(b => {
        const amount = Number(b.amount || 0);
        if (amount === 0) return;

        totalBase += convertAmount(amount, b.currency, baseCurrency, snap.data.rates);
        if (secondaryCurrency) {
          totalSecondary += convertAmount(amount, b.currency, secondaryCurrency, snap.data.rates);
        }
      });
    });

    return { totalBase, totalSecondary };
  }, [baseCurrency, secondaryCurrency, convertAmount]);

  const calculateOrgTotalBase = useCallback((org: any, rates: Record<string, number | string>) => {
    let total = 0;
    org.balances.forEach((b: any) => {
      const amount = Number(b.amount || 0);
      total += convertAmount(amount, b.currency, baseCurrency, rates);
    });
    return total;
  }, [baseCurrency, convertAmount]);

  const calculateCurrencyTotals = useCallback((snap: ParsedSnapshot) => {
    const totals: Record<string, number> = {};
    snap.data.organizations.forEach(org => {
      org.balances.forEach(b => {
        const amount = Number(b.amount || 0);
        if (amount === 0) return;
        if (!totals[b.currency]) totals[b.currency] = 0;
        totals[b.currency] += amount;
      });
    });
    return totals;
  }, []);

  const hasAnyComments = useCallback((snap: ParsedSnapshot) => {
    if (snap.data.comment) return true;
    for (const org of snap.data.organizations) {
      if (org.comment) return true;
      if (org.balances.some(b => b.comment)) return true;
    }
    return false;
  }, []);

  const chartData = useMemo(() => {
    return snapshots.map(s => {
      const totals = calculateTotals(s);
      return {
        name: s.month,
        BASE: Math.round(totals.totalBase),
        SECONDARY: Math.round(totals.totalSecondary),
        hasComment: hasAnyComments(s)
      };
    });
  }, [snapshots, calculateTotals, hasAnyComments]);

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (payload && payload.hasComment) {
      return (
        <g key={cx} style={{ cursor: 'pointer' }}>
          <circle cx={cx} cy={cy} r={7} fill="none" stroke="#3b82f6" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={4} fill="#3b82f6" />
        </g>
      );
    }
    return <Dot {...props} />;
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

  const latestSnapshot = useMemo(() => snapshots.length > 0 ? snapshots[snapshots.length - 1] : null, [snapshots]);
  const latestTotals = useMemo(() => latestSnapshot ? calculateTotals(latestSnapshot) : { totalBase: 0, totalSecondary: 0 }, [latestSnapshot, calculateTotals]);

  const pieData = useMemo(() => {
    if (!latestSnapshot) return [];
    return latestSnapshot.data.organizations.map(org => {
      let orgTotalBase = calculateOrgTotalBase(org, latestSnapshot.data.rates);
      return { name: org.name || 'Unnamed', value: Math.round(orgTotalBase) };
    })
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [latestSnapshot, calculateOrgTotalBase]);

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

  const getTreeDiffData = (): DiffOrgNode[] => {
    if (!diffModalData) return [];
    const { current, previous } = diffModalData;

    const currentOrgs = current.data.organizations;
    const previousOrgs = previous ? previous.data.organizations : [];

    const orgNames = new Set<string>();
    currentOrgs.forEach(o => o.name && orgNames.add(o.name));
    previousOrgs.forEach(o => o.name && orgNames.add(o.name));

    const tree: DiffOrgNode[] = Array.from(orgNames).map(orgName => {
      const cOrg = currentOrgs.find(o => o.name === orgName);
      const pOrg = previousOrgs.find(o => o.name === orgName);

      const currencies = new Set<string>();
      if (cOrg) cOrg.balances.forEach(b => b.currency && currencies.add(b.currency));
      if (pOrg) pOrg.balances.forEach(b => b.currency && currencies.add(b.currency));

      let hasChanges = false;

      const balances: DiffBalanceNode[] = Array.from(currencies).map(currency => {
        const cBal = cOrg ? cOrg.balances.find(b => b.currency === currency) : null;
        const currentAmt = cBal ? Number(cBal.amount || 0) : 0;

        const pBal = pOrg ? pOrg.balances.find(b => b.currency === currency) : null;
        const previousAmt = pBal ? Number(pBal.amount || 0) : 0;

        const delta = currentAmt - previousAmt;
        const deltaPercent = previousAmt > 0 ? (delta / previousAmt) * 100 : 0;

        if (Math.abs(delta) >= 0.01) {
          hasChanges = true;
        }

        let status: 'new' | 'deleted' | 'up' | 'down' | 'stable' = 'stable';
        if (!pBal && cBal) status = 'new';
        else if (pBal && !cBal) status = 'deleted';
        else if (delta > 0) status = 'up';
        else if (delta < 0) status = 'down';

        return { currency, currentAmt, previousAmt, delta, deltaPercent, status };
      });

      balances.sort((a, b) => a.currency.localeCompare(b.currency));

      return { orgName, balances, hasChanges };
    });

    tree.sort((a, b) => a.orgName.localeCompare(b.orgName));

    if (onlyChanges) {
      return tree
        .filter(org => org.hasChanges)
        .map(org => ({
          ...org,
          balances: org.balances.filter(b => Math.abs(b.delta) >= 0.01)
        }));
    }

    return tree;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 style={{ fontSize: 24, fontWeight: 'bold' }}>Overview</h2>
        <Link to="/snapshot/new" className="btn btn-primary">
          New Snapshot
        </Link>
      </div>

      {loading ? (
        <p>Loading data...</p>
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

            <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ flex: 1, height: '140px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                      {pieData.map((_entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }}
                      formatter={(value: any, _name: any, props: any) => [
                        `${Number(value).toLocaleString('en-US')} ${baseCurrency}`,
                        props.payload.name
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', maxHeight: '140px', overflowY: 'auto', minWidth: '160px' }}>
                {pieData.map((entry, idx) => {
                  const percent = latestTotals.totalBase > 0 ? (entry.value / latestTotals.totalBase) * 100 : 0;
                  return (
                    <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: CHART_COLORS[idx % CHART_COLORS.length], flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '100px' }} title={entry.name}>
                        {entry.name}:
                      </span>
                      <span style={{ fontWeight: 600, marginLeft: 'auto' }}>{percent.toFixed(1)}%</span>
                    </div>
                  );
                })}
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
                    <Area yAxisId="left" type="monotone" dataKey="BASE" name="BASE" stroke="#10b981" fillOpacity={1} fill="url(#colorBase)" />
                    {secondaryCurrency && secondaryCurrency !== baseCurrency && (
                      <Line yAxisId="right" type="monotone" dataKey="SECONDARY" name="SECONDARY" stroke="#6366f1" strokeWidth={3} dot={<CustomDot />} activeDot={{ r: 6 }} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <h3 className="mb-4" style={{ marginTop: 0 }}>History</h3>
          {sortedYears.map(year => {
            const yearSnaps = groupsByYear[year];
            const yearLatestTotals = calculateTotals(yearSnaps[0]);
            const prevYearStr = String(Number(year) - 1);
            const prevYearSnaps = groupsByYear[prevYearStr];
            const prevYearTotals = prevYearSnaps ? calculateTotals(prevYearSnaps[0]) : undefined;
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
                        const totals = calculateTotals(s);
                        const currencyTotals = calculateCurrencyTotals(s);
                        const globalIndex = reversedSnapshots.findIndex(snap => snap.month === s.month);
                        const prevSnapshot = reversedSnapshots[globalIndex + 1];
                        const prevTotals = prevSnapshot ? calculateTotals(prevSnapshot) : undefined;
                        const prevCurrencyTotals = prevSnapshot ? calculateCurrencyTotals(prevSnapshot) : {};
                        const allMergedCurrencies = Array.from(new Set([...Object.keys(currencyTotals), ...Object.keys(prevCurrencyTotals)]));
                        const changedCurrencies: { curr: string, amt: number, diff: number }[] = [];
                        const unchangedCurrencies: { curr: string, amt: number, diff: number }[] = [];

                        let fxImpactBase = 0;
                        let organicBase = 0;

                        allMergedCurrencies.forEach(curr => {
                          const currentAmt = currencyTotals[curr] || 0;
                          const prevAmt = prevCurrencyTotals[curr] || 0;
                          const diff = prevSnapshot ? currentAmt - prevAmt : 0;

                          if (prevSnapshot) {
                            const currentRateInBase = convertAmount(1, curr, baseCurrency, s.data.rates);
                            const prevRateInBase = convertAmount(1, curr, baseCurrency, prevSnapshot.data.rates);

                            organicBase += (diff * currentRateInBase);
                            fxImpactBase += (prevAmt * (currentRateInBase - prevRateInBase));
                          }

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
                                <button className="btn" title="Copy as new snapshot" style={{ padding: '8px' }} onClick={() => navigate(`/snapshot/copy/${s.month}`)}><Copy size={16} /></button>
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

      {activeViewNotes && createPortal(
        <div className="fixed z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }} onClick={() => setActiveViewNotes(null)}>
          <div className="glass-panel flex flex-col" style={{ width: '500px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>Notes for {activeViewNotes.month}</h3>
              <div className="flex items-center gap-2">
                <Link to={`/snapshot/${activeViewNotes.month}`} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }}>
                  <Edit size={14} /> Edit
                </Link>
                <button className="btn" style={{ padding: '4px' }} onClick={() => setActiveViewNotes(null)}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {activeViewNotes.data.comment && (
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.9em', marginBottom: '6px', letterSpacing: '0.05em' }}>SNAPSHOT NOTE</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.95em' }}>{activeViewNotes.data.comment}</div>
                </div>
              )}

              {activeViewNotes.data.organizations.map(org => {
                const balancesWithComments = org.balances.filter(b => b.comment);
                if (!org.comment && balancesWithComments.length === 0) return null;

                return (
                  <div key={org.id} style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '1.05em', marginBottom: '6px' }}>{org.name}</div>
                    {org.comment && (
                      <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: '8px', paddingLeft: '4px' }}>
                        {org.comment}
                      </div>
                    )}
                    {balancesWithComments.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', borderTop: org.comment ? '1px solid rgba(255,255,255,0.03)' : 'none', paddingTop: org.comment ? '8px' : '0' }}>
                        {balancesWithComments.map((b, i) => (
                          <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.9em' }}>
                            <span style={{ 
                              color: getCurrencyColor(b.currency), 
                              fontWeight: 700, 
                              minWidth: '50px',
                              background: 'rgba(255,255,255,0.02)',
                              padding: '1px 4px',
                              borderRadius: '4px',
                              border: `1px solid ${getCurrencyColor(b.currency)}20`
                            }}>
                              [{b.currency}]
                            </span>
                            <span style={{ color: 'var(--text-secondary)' }}>{b.comment}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {diffModalData && createPortal(
        <div
          className="fixed z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
          onClick={() => setDiffModalData(null)}
        >
          <div
            className="glass-panel flex flex-col"
            style={{
              width: '740px',
              maxWidth: '95vw',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '16px 20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>Granular Hierarchy Diff</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Comparing <b>{diffModalData.current.month}</b> with {diffModalData.previous ? <b>{diffModalData.previous.month}</b> : 'previous (none)'}
                </p>
              </div>
              <button className="btn" style={{ padding: '4px' }} onClick={() => setDiffModalData(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="onlyChangesCheckbox"
                checked={onlyChanges}
                onChange={e => setOnlyChanges(e.target.checked)}
                style={{ cursor: 'pointer', width: '15px', height: '16px', accentColor: 'var(--accent)' }}
              />
              <label htmlFor="onlyChangesCheckbox" style={{ fontSize: '14px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                Show changes only (hide zero deltas)
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {getTreeDiffData().map((org, oIdx) => (
                <div 
                  key={oIdx} 
                  style={{ 
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    <Folder size={16} style={{ color: 'var(--accent)' }} />
                    <span>{org.orgName}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                    {org.balances.map((b, bIdx) => {
                      let deltaColor = 'var(--text-secondary)';
                      let deltaSign = '';
                      
                      if (b.status === 'up' || b.status === 'new') { 
                        deltaColor = 'var(--diff-positive, hsl(142, 45%, 55%))'; 
                        deltaSign = '+'; 
                      }
                      else if (b.status === 'down' || b.status === 'deleted') { 
                        deltaColor = 'var(--diff-negative, hsl(0, 45%, 60%))'; 
                      }

                      return (
                        <div 
                          key={bIdx} 
                          style={{ 
                            display: 'grid',
                            gridTemplateColumns: '120px 1fr 1fr 150px',
                            alignItems: 'center',
                            fontSize: '13px',
                            padding: '4px 8px',
                            borderBottom: '1px solid rgba(255,255,255,0.02)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Coins size={12} style={{ opacity: 0.4 }} />
                            <span style={{ 
                              color: getCurrencyColor(b.currency), 
                              fontWeight: 700,
                              letterSpacing: '0.03em'
                            }}>
                              {b.currency}
                            </span>
                            {b.status === 'new' && <span style={{ fontSize: '9px', color: 'var(--diff-positive, hsl(142, 45%, 55%))', fontWeight: 600 }}>[NEW]</span>}
                            {b.status === 'deleted' && <span style={{ fontSize: '9px', color: 'var(--diff-negative, hsl(0, 45%, 60%))', fontWeight: 600 }}>[RMV]</span>}
                          </div>

                          <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                            prev: <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{Math.round(b.previousAmt).toLocaleString('en-US')}</span>
                          </div>

                          <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                            curr: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{Math.round(b.currentAmt).toLocaleString('en-US')}</span>
                          </div>

                          <div style={{ color: deltaColor, fontWeight: 700, textAlign: 'right' }}>
                            {deltaSign}{Math.round(b.delta).toLocaleString('en-US')}
                            {b.status !== 'new' && b.status !== 'deleted' && b.previousAmt > 0 && (
                              <span style={{ fontSize: '0.85em', marginLeft: '4px', opacity: 0.8, fontWeight: 500 }}>
                                ({deltaSign}{b.deltaPercent.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {getTreeDiffData().length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px', fontSize: '13px' }}>
                  No historical changes detected in this period.
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
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
