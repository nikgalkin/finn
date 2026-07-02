import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, TrendingUp, DollarSign, Edit, Copy, Trash2, Calendar, LineChart as LineChartIcon, MessageSquare, X } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Dot, PieChart, Pie, Cell } from 'recharts';
import { createPortal } from 'react-dom';
import { API_URL } from '../types';
import type { ParsedSnapshot, Snapshot } from '../types';

export default function Dashboard() {
  const [snapshots, setSnapshots] = useState<ParsedSnapshot[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('RUB');
  const [loading, setLoading] = useState(true);

  // State to track hidden lines on the multi-currency chart
  const [hiddenBalances, setHiddenBalances] = useState<Record<string, boolean>>({});

  // State for viewing notes in a modal
  const [activeViewNotes, setActiveViewNotes] = useState<ParsedSnapshot | null>(null);

  const navigate = useNavigate();

  // Listen for Escape key to close the notes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveViewNotes(null);
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
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
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

  const calculateTotals = (snap: ParsedSnapshot) => {
    let totalBase = 0;
    let totalUsd = 0;
    const usdRate = Number(snap.data.rates['USD'] || 1);

    snap.data.organizations.forEach(org => {
      org.balances.forEach(b => {
        const amount = Number(b.amount || 0);
        if (amount === 0) return;

        let valueBase = 0;
        if (b.currency === baseCurrency) {
          valueBase = amount;
        } else {
          const rateToBase = Number(snap.data.rates[b.currency] || 0);
          valueBase = amount * rateToBase;
        }
        totalBase += valueBase;

        let valueUsd = 0;
        if (b.currency === 'USD') {
          valueUsd = amount;
        } else if (b.currency === baseCurrency) {
          valueUsd = usdRate > 0 ? (amount / usdRate) : 0;
        } else {
          valueUsd = usdRate > 0 ? (valueBase / usdRate) : 0;
        }
        totalUsd += valueUsd;
      });
    });

    return { totalBase, totalUsd };
  };

  const calculateCurrencyTotals = (snap: ParsedSnapshot) => {
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
  };

  // Helper to check if a snapshot has any comments
  const hasAnyComments = (snap: ParsedSnapshot) => {
    if (snap.data.comment) return true;
    for (const org of snap.data.organizations) {
      if (org.comment) return true;
      if (org.balances.some(b => b.comment)) return true;
    }
    return false;
  };

  const chartData = snapshots.map(s => {
    const totals = calculateTotals(s);
    return {
      name: s.month,
      BASE: Math.round(totals.totalBase),
      USD: Math.round(totals.totalUsd),
      hasComment: hasAnyComments(s)
    };
  });

  // Custom Dot renderer for Main Net Worth Chart to emphasize snapshots with comments
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

  // Handler for clicking on the chart area/points
  const handleChartClick = (state: any) => {
    if (state && state.activeLabel) {
      const clickedMonth = state.activeLabel;
      const snapshot = snapshots.find(s => s.month === clickedMonth);
      if (snapshot && hasAnyComments(snapshot)) {
        setActiveViewNotes(snapshot);
      }
    }
  };

  const allCurrenciesSet = new Set<string>();
  snapshots.forEach(s => {
    if (s.data.rates) {
      Object.keys(s.data.rates).forEach(c => {
        if (c !== baseCurrency && c.trim() !== '') allCurrenciesSet.add(c);
      });
    }
  });
  const activeCurrencies = Array.from(allCurrenciesSet);

  const invertedCurrencies = new Set<string>();
  activeCurrencies.forEach(c => {
    const firstValidSnap = snapshots.find(s => Number(s.data.rates?.[c]) > 0);
    if (firstValidSnap) {
      const rate = Number(firstValidSnap.data.rates[c]);
      if (rate < 0.1) invertedCurrencies.add(c);
    }
  });

  const currencyRatesData = snapshots.map(s => {
    const point: any = { month: s.month };
    activeCurrencies.forEach(c => {
      const rate = Number(s.data.rates?.[c] || 0);
      if (rate > 0) point[c] = invertedCurrencies.has(c) ? (1 / rate) : rate;
    });
    return point;
  });

  const usedCurrenciesSet = new Set<string>();
  snapshots.forEach(s => {
    s.data.organizations.forEach(org => {
      org.balances.forEach(b => {
        if (b.currency && b.currency.trim() !== '' && Number(b.amount) > 0) usedCurrenciesSet.add(b.currency);
      });
    });
  });
  const allUsedCurrencies = Array.from(usedCurrenciesSet);

  const usedCurrenciesData = snapshots.map(s => {
    const point: any = { month: s.month };
    allUsedCurrencies.forEach(c => point[c] = 0);
    s.data.organizations.forEach(org => {
      org.balances.forEach(b => {
        if (b.currency && Number(b.amount) > 0) point[b.currency] += Math.round(Number(b.amount));
      });
    });
    return point;
  });

  const CHART_COLORS = ['#eab308', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#ef4444', '#10b981'];

  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const latestTotals = latestSnapshot ? calculateTotals(latestSnapshot) : { totalBase: 0, totalUsd: 0 };

  // --- PREPARE DATA FOR PIE CHART ---
  const pieData = latestSnapshot ? latestSnapshot.data.organizations.map(org => {
    let orgTotalBase = 0;
    org.balances.forEach(b => {
      const amount = Number(b.amount || 0);
      if (b.currency === baseCurrency) {
        orgTotalBase += amount;
      } else {
        const rate = Number(latestSnapshot.data.rates[b.currency] || 0);
        orgTotalBase += amount * rate;
      }
    });
    return { name: org.name || 'Unnamed', value: Math.round(orgTotalBase) };
  })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value) : [];

  const renderDiff = (current: number, previous: number | undefined, isUsd: boolean = false) => {
    if (previous === undefined || previous === 0) return null;
    const diff = current - previous;
    if (Math.abs(diff) < 1) return null;
    const percent = (diff / previous) * 100;
    const color = diff > 0 ? '#22c55e' : '#ef4444';
    const sign = diff > 0 ? '+' : '';
    const prefix = isUsd ? '$' : '';
    const formattedDiff = Math.round(diff).toLocaleString('en-US');
    const formattedPercent = percent.toFixed(1);

    return (
      <div style={{ color, fontSize: '0.85em', marginTop: '2px', fontWeight: 500 }}>
        {sign}{prefix}{formattedDiff} ({sign}{formattedPercent}%)
      </div>
    );
  };

  const currentYear = new Date().getFullYear().toString();
  const groupsByYear: Record<string, ParsedSnapshot[]> = {};
  const reversedSnapshots = [...snapshots].reverse();

  reversedSnapshots.forEach(s => {
    const year = s.month.split('-')[0];
    if (!groupsByYear[year]) groupsByYear[year] = [];
    groupsByYear[year].push(s);
  });

  const sortedYears = Object.keys(groupsByYear).sort((a, b) => b.localeCompare(a));

  const handleLegendClick = (e: any) => {
    const currency = e.dataKey;
    if (currency) {
      setHiddenBalances(prev => {
        const currentState = prev[currency] !== undefined ? prev[currency] : currency !== baseCurrency;
        return { ...prev, [currency]: !currentState };
      });
    }
  };

  const formatCompactNumber = (number: number) => {
    return Intl.NumberFormat('en-US', {
      notation: "compact",
      maximumFractionDigits: 1
    }).format(number);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 style={{ fontSize: 24, fontWeight: 'bold' }}>Overview</h2>
        <Link to="/snapshot/new" className="btn btn-primary">
          <Plus size={18} /> New Snapshot
        </Link>
      </div>

      {loading ? (
        <p>Loading data...</p>
      ) : (
        <>
          {/* TWO COLUMN GRID HEADER (CARDS & PIE CHART) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

            {/* LEFT COLUMN: CARDS STACKED VERTICALLY */}
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
              <div className="glass-panel flex items-center justify-between" style={{ padding: '20px 24px', minHeight: 'auto', flex: 1 }}>
                <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.95rem' }}>
                  <DollarSign size={20} />
                  <span>Total Net Worth (USD)</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', lineHeight: '1' }}>
                  ${Math.round(latestTotals.totalUsd).toLocaleString('en-US')}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: DONUT PIE CHART FOR ORGANIZATIONS */}
            <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ flex: 1, height: '140px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((_entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }}
                      // Передаем имя организации в качестве лейбла строки тултипа
                      formatter={(value: any, _name: any, props: any) => [
                        `${Number(value).toLocaleString('en-US')} ${baseCurrency}`,
                        props.payload.name
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* COMPACT SCROLLABLE LEGEND FOR PIE CHART */}
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
            <div className="glass-panel" style={{ height: '400px', display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
              <h3 className="mb-4" style={{ margin: 0, paddingBottom: 16 }}>Net Worth Trend</h3>
              <div style={{ flex: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 15 }} onClick={handleChartClick}>
                    <defs>
                      <linearGradient id="colorBase" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="var(--text-secondary)" tickMargin={10} />
                    <YAxis yAxisId="left" stroke="var(--text-secondary)" tickFormatter={(val) => formatCompactNumber(val)} />
                    <YAxis yAxisId="right" orientation="right" stroke="#6366f1" tickFormatter={(val) => '$' + formatCompactNumber(val)} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }} itemStyle={{ fontWeight: 500 }} formatter={(value: any, name: any, props: any) => {
                      const numValue = Number(value) || 0;
                      const hasNoteText = props.payload.hasComment ? ' 📝 (Click to view notes)' : '';
                      return [
                        name === 'USD' ? `$${numValue.toLocaleString('en-US')}` : `${numValue.toLocaleString('en-US')} ${baseCurrency}`,
                        name === 'BASE' ? `Total ${baseCurrency}${hasNoteText}` : 'Total USD'
                      ];
                    }} />
                    <Area yAxisId="left" type="monotone" dataKey="BASE" name="BASE" stroke="#10b981" fillOpacity={1} fill="url(#colorBase)" />
                    <Line yAxisId="right" type="monotone" dataKey="USD" name="USD" stroke="#6366f1" strokeWidth={3} dot={<CustomDot />} activeDot={{ r: 6 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {currencyRatesData.length > 0 && activeCurrencies.length > 0 && (
            <details className="glass-panel mb-4" style={{ padding: 0, overflow: 'hidden' }}>
              <summary style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', cursor: 'pointer', userSelect: 'none', listStyle: 'none', fontWeight: 'bold', fontSize: '18px' }} className="hover:bg-[rgba(255,255,255,0.02)]">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <LineChartIcon size={20} style={{ color: 'var(--text-secondary)' }} />
                  <span>Exchange Rates Dynamics</span>
                </div>
              </summary>
              <div style={{ padding: '0 24px 24px 24px', height: '350px', marginTop: '16px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={currencyRatesData} margin={{ top: 10, right: 10, left: 0, bottom: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" tickMargin={10} />
                    <YAxis stroke="var(--text-secondary)" tickFormatter={(val) => val.toLocaleString('en-US')} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }}
                      formatter={(value: any, _name: any, props: any) => [
                        `${Number(value).toLocaleString('en-US')} ${baseCurrency}`,
                        props.payload.name
                      ]}
                    />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '0.9em', color: 'var(--text-secondary)' }} />
                    {activeCurrencies.map((c, idx) => (
                      <Line key={c} type="monotone" dataKey={c} name={c} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3, fill: 'var(--bg-color)', strokeWidth: 2 }} activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </details>
          )}

          {usedCurrenciesData.length > 0 && allUsedCurrencies.length > 0 && (
            <details className="glass-panel mb-8" style={{ padding: 0, overflow: 'hidden' }}>
              <summary style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', cursor: 'pointer', userSelect: 'none', listStyle: 'none', fontWeight: 'bold', fontSize: '18px' }} className="hover:bg-[rgba(255,255,255,0.02)]">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <LineChartIcon size={20} style={{ color: 'var(--text-secondary)' }} />
                  <span>Currencies Balances Dynamics</span>
                </div>
              </summary>
              <div style={{ padding: '0 24px 24px 24px', height: '350px', marginTop: '16px' }}>
                <p style={{ fontSize: '0.8em', color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 16px 0', fontStyle: 'italic' }}>
                  Click on a currency in the legend below to hide/show it
                </p>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={usedCurrenciesData} margin={{ top: 10, right: 10, left: 10, bottom: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" tickMargin={10} />
                    <YAxis
                      stroke="var(--text-secondary)"
                      tickFormatter={(val) => formatCompactNumber(val)}
                    />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }} itemStyle={{ fontWeight: 500 }} formatter={(value: any, name: any) => [`${Math.round(value).toLocaleString('en-US')}`, String(name)]} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      wrapperStyle={{ fontSize: '0.9em', color: 'var(--text-secondary)', cursor: 'pointer' }}
                      onClick={handleLegendClick}
                    />
                    {allUsedCurrencies.map((c, idx) => {
                      const isHidden = hiddenBalances[c] !== undefined ? hiddenBalances[c] : c !== baseCurrency;
                      return (
                        <Line
                          key={c}
                          type="monotone"
                          dataKey={c}
                          name={c}
                          stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3, fill: 'var(--bg-color)', strokeWidth: 2 }}
                          activeDot={{ r: 5 }}
                          hide={isHidden}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </details>
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
                      {renderDiff(yearLatestTotals.totalBase, prevYearTotals?.totalBase, false)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>${Math.round(yearLatestTotals.totalUsd).toLocaleString('en-US')}</b></span>
                      {renderDiff(yearLatestTotals.totalUsd, prevYearTotals?.totalUsd, true)}
                    </div>
                  </div>
                </summary>

                <div style={{ padding: '0 24px 24px 24px', borderTop: '1px solid var(--glass-border)' }}>
                  <table className="table" style={{ marginTop: '12px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>Month</th>
                        <th style={{ width: '25%' }}>Total {baseCurrency}</th>
                        <th style={{ width: '25%' }}>Total USD</th>
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

                        let fxImpactBase = 0;
                        let organicBase = 0;

                        const allMergedCurrencies = Array.from(new Set([...Object.keys(currencyTotals), ...Object.keys(prevCurrencyTotals)]));
                        const changedCurrencies: { curr: string, amt: number, diff: number }[] = [];
                        const unchangedCurrencies: { curr: string, amt: number, diff: number }[] = [];

                        allMergedCurrencies.forEach(curr => {
                          const currentAmt = currencyTotals[curr] || 0;
                          const prevAmt = prevCurrencyTotals[curr] || 0;
                          const diff = prevSnapshot ? currentAmt - prevAmt : 0;

                          if (prevSnapshot) {
                            const currentRate = curr === baseCurrency ? 1 : Number(s.data.rates?.[curr] || 0);
                            const prevRate = curr === baseCurrency ? 1 : Number(prevSnapshot.data.rates?.[curr] || 0);
                            organicBase += (diff * currentRate);
                            fxImpactBase += (prevAmt * (currentRate - prevRate));
                          }

                          if (Math.abs(diff) >= 1) {
                            changedCurrencies.push({ curr, amt: currentAmt, diff });
                          } else if (currentAmt > 0) {
                            unchangedCurrencies.push({ curr, amt: currentAmt, diff });
                          }
                        });

                        changedCurrencies.sort((a, b) => a.curr.localeCompare(b.curr));
                        unchangedCurrencies.sort((a, b) => a.curr.localeCompare(b.curr));

                        const renderCurrencyRow = ({ curr, amt, diff }: { curr: string, amt: number, diff: number }) => {
                          const currentRate = curr === baseCurrency ? 1 : Number(s.data.rates?.[curr] || 0);
                          const amtInBase = amt * currentRate;
                          const percentOfTotal = totals.totalBase > 0 ? (amtInBase / totals.totalBase) * 100 : 0;

                          const prevAmt = (prevCurrencyTotals[curr] || 0);
                          const diffPercent = prevAmt > 0 ? (diff / prevAmt) * 100 : 0;

                          return (
                            <div key={curr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }} className="last:border-0 last:pb-0">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>{curr}</span>
                                <span style={{ fontSize: '0.75em', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.03)', padding: '1px 4px', borderRadius: '4px' }}>
                                  {percentOfTotal.toFixed(1)}%
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span style={{ fontSize: '0.95em', fontWeight: 500, color: amt === 0 ? 'var(--text-secondary)' : 'inherit' }}>{Math.round(amt).toLocaleString('en-US')}</span>
                                {Math.abs(diff) >= 1 && (
                                  <span style={{ fontSize: '0.75em', color: diff > 0 ? '#22c55e' : '#ef4444', fontWeight: 500, marginTop: '1px' }}>
                                    {diff > 0 ? '+' : ''}{Math.round(diff).toLocaleString('en-US')}
                                    {prevAmt > 0 && ` (${diff > 0 ? '+' : ''}${diffPercent.toFixed(1)}%)`}
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
                              {hasAnyComments(s) && (
                                <button
                                  className="btn text-primary hover:underline"
                                  style={{ padding: 0, marginTop: '8px', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85em', color: '#3b82f6' }}
                                  onClick={() => setActiveViewNotes(s)}
                                >
                                  <MessageSquare size={14} /> Notes
                                </button>
                              )}
                            </td>
                            <td style={{ verticalAlign: 'top', paddingTop: '16px' }}>
                              <div style={{ fontWeight: 500 }}>{Math.round(totals.totalBase).toLocaleString('en-US')}</div>
                              {renderDiff(totals.totalBase, prevTotals?.totalBase, false)}
                              {prevSnapshot && Math.abs(fxImpactBase) > 1 && (
                                <div style={{ fontSize: '0.75em', marginTop: '8px', padding: '6px 8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', display: 'inline-block' }}>
                                  <div style={{ marginBottom: '2px' }}><span style={{ color: 'var(--text-secondary)' }}>Deposits: </span><span style={{ fontWeight: 500, color: organicBase > 0 ? '#22c55e' : organicBase < 0 ? '#ef4444' : 'inherit' }}>{organicBase > 0 ? '+' : ''}{Math.round(organicBase).toLocaleString('en-US')}</span></div>
                                  <div><span style={{ color: 'var(--text-secondary)' }}>FX Impact: </span><span style={{ fontWeight: 500, color: fxImpactBase > 0 ? '#22c55e' : fxImpactBase < 0 ? '#ef4444' : 'inherit' }}>{fxImpactBase > 0 ? '+' : ''}{Math.round(fxImpactBase).toLocaleString('en-US')}</span></div>
                                </div>
                              )}
                            </td>
                            <td style={{ verticalAlign: 'top', paddingTop: '16px' }}>
                              <div style={{ fontWeight: 500 }}>${Math.round(totals.totalUsd).toLocaleString('en-US')}</div>
                              {renderDiff(totals.totalUsd, prevTotals?.totalUsd, true)}
                            </td>
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

      {/* --- TELEPORTED VIEW NOTES POPUP --- */}
      {activeViewNotes && createPortal(
        <div
          className="fixed z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
          onClick={() => setActiveViewNotes(null)}
        >
          <div
            className="glass-panel flex flex-col"
            style={{
              width: '500px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>Notes for {activeViewNotes.month}</h3>
              <button className="btn" style={{ padding: '4px' }} onClick={() => setActiveViewNotes(null)}>
                <X size={20} />
              </button>
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
                            <span style={{ color: '#8b5cf6', fontWeight: 600, minWidth: '50px' }}>[{b.currency}]</span>
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
    </div>
  );
}
