import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LineChart as LineChartIcon, Landmark, Layers, Coins, Clock, BarChart3, ArrowLeftRight, Eye, ChevronDown, Search, ShieldAlert, Grid, Compass } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Treemap } from 'recharts';
import { API_URL, getCurrencyColor } from '../types';
import type { ParsedSnapshot, Snapshot } from '../types';

// Кастомный компактный выпадающий список с поиском
function SearchableSelect({ 
  value, 
  onChange, 
  options, 
  placeholder 
}: { 
  value: string; 
  onChange: (val: string) => void; 
  options: string[]; 
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100px' }}>
      <div 
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        className="input"
        style={{ 
          padding: '4px 8px', 
          background: 'var(--bg-color)', 
          border: '1px solid var(--glass-border)', 
          borderRadius: '6px', 
          fontSize: '13px', 
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'between',
          userSelect: 'none',
          height: '28px'
        }}
      >
        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1, textAlign: 'center' }}>
          {value || placeholder}
        </span>
        <ChevronDown size={14} style={{ opacity: 0.5, marginLeft: '4px' }} />
      </div>

      {isOpen && (
        <div 
          className="glass-panel"
          style={{ 
            position: 'absolute', 
            top: '32px', 
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100, 
            width: '140px', 
            maxHeight: '200px', 
            overflowY: 'auto',
            padding: '4px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          <div style={{ position: 'relative', padding: '2px', marginBottom: '4px' }}>
            <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
            <input 
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--glass-border)',
                borderRadius: '4px',
                padding: '2px 6px 2px 22px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredOptions.map(opt => (
              <div
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textAlign: 'center',
                  background: opt === value ? 'var(--accent)' : 'transparent',
                  color: opt === value ? '#000' : 'var(--text-primary)',
                  fontWeight: opt === value ? 600 : 'normal',
                  transition: 'background 0.15s'
                }}
                className="hover:bg-[rgba(255,255,255,0.05)]"
              >
                {opt}
              </div>
            ))}
            {filteredOptions.length === 0 && (
              <div style={{ padding: '8px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                No results
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Кастомный контент для плиток Treemap
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

export default function GraphsPage() {
  const [snapshots, setSnapshots] = useState<ParsedSnapshot[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('RUB');
  const [loading, setLoading] = useState(true);
  const [hiddenBalances, setHiddenBalances] = useState<Record<string, boolean>>({});

  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [lastClick, setLastClick] = useState<{ key: string; time: number } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/settings`)
      .then(res => res.json())
      .then(resData => {
        const settings = JSON.parse(resData.value);
        if (settings.baseCurrency) setBaseCurrency(settings.baseCurrency);
      });

    fetch(`${API_URL}/snapshots`)
      .then(res => res.json())
      .then((data: Snapshot[]) => {
        const parsed = (data || []).map(s => ({
          ...s,
          data: JSON.parse(s.data)
        }));
        parsed.sort((a, b) => a.month.localeCompare(b.month));
        setSnapshots(parsed);
        
        if (parsed.length > 0) {
          setStartMonth(parsed[0].month);
          setEndMonth(parsed[parsed.length - 1].month);
        }
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const CHART_COLORS = ['#3b82f6', '#10b981', '#eab308', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#ef4444'];
  const availableMonths = snapshots.map(s => s.month);
  const effectiveEndMonth = (endMonth && startMonth && endMonth < startMonth) ? startMonth : endMonth;

  const filteredSnapshots = snapshots.filter(s => {
    const startOk = startMonth ? s.month >= startMonth : true;
    const endOk = effectiveEndMonth ? s.month <= effectiveEndMonth : true;
    return startOk && endOk;
  });

  const getAmountInBase = (amount: number, currency: string, snapshot: ParsedSnapshot) => {
    if (currency === baseCurrency) return amount;
    const rate = Number(snapshot.data.rates?.[currency] || 0);
    return amount * rate;
  };

  // --- 1. Динамика курсов валют ---
  const allCurrenciesSet = new Set<string>();
  filteredSnapshots.forEach(s => {
    if (s.data.rates) {
      Object.keys(s.data.rates).forEach(c => {
        if (c !== baseCurrency && c.trim() !== '') allCurrenciesSet.add(c);
      });
    }
  });
  const activeCurrencies = Array.from(allCurrenciesSet);

  const invertedCurrencies = new Set<string>();
  activeCurrencies.forEach(c => {
    const firstValidSnap = filteredSnapshots.find(s => Number(s.data.rates?.[c]) > 0);
    if (firstValidSnap && Number(firstValidSnap.data.rates[c]) < 0.1) invertedCurrencies.add(c);
  });

  const currencyRatesData = filteredSnapshots.map(s => {
    const point: any = { month: s.month };
    activeCurrencies.forEach(c => {
      const rate = Number(s.data.rates?.[c] || 0);
      if (rate > 0) point[c] = invertedCurrencies.has(c) ? (1 / rate) : rate;
    });
    return point;
  });

  // --- 2. Объемы валют ---
  const usedCurrenciesSet = new Set<string>();
  filteredSnapshots.forEach(s => {
    s.data.organizations.forEach(org => {
      org.balances.forEach(b => { if (b.currency && Number(b.amount) > 0) usedCurrenciesSet.add(b.currency); });
    });
  });
  const allUsedCurrencies = Array.from(usedCurrenciesSet);

  const usedCurrenciesData = filteredSnapshots.map(s => {
    const point: any = { month: s.month };
    allUsedCurrencies.forEach(c => point[c] = 0);
    filteredSnapshots.forEach(snap => {
      if (snap.month === s.month) {
        snap.data.organizations.forEach(org => {
          org.balances.forEach(b => { if (b.currency && Number(b.amount) > 0) point[b.currency] += Math.round(Number(b.amount)); });
        });
      }
    });
    return point;
  });

  // --- 3. Динамика капитала по Организациям ---
  const allOrgsSet = new Set<string>();
  filteredSnapshots.forEach(s => s.data.organizations.forEach(o => o.name && allOrgsSet.add(o.name)));
  const allOrganizations = Array.from(allOrgsSet);

  const orgTrendData = filteredSnapshots.map(s => {
    const point: any = { month: s.month };
    allOrganizations.forEach(o => point[o] = 0);
    s.data.organizations.forEach(org => {
      let orgTotalBase = 0;
      org.balances.forEach(b => { orgTotalBase += getAmountInBase(Number(b.amount || 0), b.currency, s); });
      if (org.name) point[org.name] = Math.round(orgTotalBase);
    });
    return point;
  });

  // --- 4. Доли валютного портфеля ---
  const currencyDistributionData = filteredSnapshots.map(s => {
    const point: any = { month: s.month };
    allUsedCurrencies.forEach(c => point[c] = 0);
    s.data.organizations.forEach(org => {
      org.balances.forEach(b => { point[b.currency] += Math.round(getAmountInBase(Number(b.amount || 0), b.currency, s)); });
    });
    return point;
  });

  // --- ДАННЫЕ ДЛЯ НОВЫХ ПРОДВИНУТЫХ ГРАФИКОВ (по последнему snapshot) ---
  const latestSnapshot = filteredSnapshots[filteredSnapshots.length - 1];

  const treemapData: any[] = [];
  if (latestSnapshot) {
    latestSnapshot.data.organizations.forEach((org, idx) => {
      let orgValue = 0;
      org.balances.forEach(b => { orgValue += getAmountInBase(Number(b.amount || 0), b.currency, latestSnapshot); });
      if (orgValue > 0 && org.name) {
        treemapData.push({
          name: org.name,
          value: Math.round(orgValue),
          color: CHART_COLORS[idx % CHART_COLORS.length]
        });
      }
    });
  }

  const flowChartData: any[] = [];
  if (latestSnapshot) {
    latestSnapshot.data.organizations.forEach(org => {
      if (!org.name) return;
      const point: any = { name: org.name };
      allUsedCurrencies.forEach(c => point[c] = 0);
      org.balances.forEach(b => {
        point[b.currency] += Math.round(getAmountInBase(Number(b.amount || 0), b.currency, latestSnapshot));
      });
      flowChartData.push(point);
    });
  }

  const radarData: any[] = [];
  if (latestSnapshot) {
    let totalNetWorth = 0;
    let cryptoValue = 0;
    let fiatStableValue = 0;
    let localFiatValue = 0;

    latestSnapshot.data.organizations.forEach(org => {
      org.balances.forEach(b => {
        const val = getAmountInBase(Number(b.amount || 0), b.currency, latestSnapshot);
        totalNetWorth += val;
        if (['USDT', 'BTC', 'ETH', 'USDC'].includes(b.currency.toUpperCase())) cryptoValue += val;
        else if (['USD', 'EUR', 'AED'].includes(b.currency.toUpperCase())) fiatStableValue += val;
        else localFiatValue += val;
      });
    });

    if (totalNetWorth > 0) {
      const cryptoPct = cryptoValue / totalNetWorth;
      const stablePct = fiatStableValue / totalNetWorth;
      const localPct = localFiatValue / totalNetWorth;

      const liquidity = Math.round((cryptoPct * 0.9 + stablePct * 0.8 + localPct * 0.95) * 100);
      const inflationProtection = Math.round((cryptoPct * 0.95 + stablePct * 0.6 + localPct * 0.15) * 100);
      const stability = Math.round((stablePct * 0.95 + localPct * 0.5 + (1 - cryptoPct) * 0.4) * 100);
      const yieldPotential = Math.round((cryptoPct * 0.85 + localPct * 0.4 + stablePct * 0.2) * 100);
      const infraSafety = Math.round((cryptoPct * 0.9 + stablePct * 0.3 + localPct * 0.8) * 100);

      radarData.push(
        { subject: 'Liquidity (Ликвидность)', A: liquidity, fullMark: 100 },
        { subject: 'Inflation Protect (Защита)', A: inflationProtection, fullMark: 100 },
        { subject: 'Asset Stability (Стабильность)', A: stability, fullMark: 100 },
        { subject: 'Yield Potential (Доходность)', A: yieldPotential, fullMark: 100 },
        { subject: 'Infra Safety (Безопасность)', A: infraSafety, fullMark: 100 }
      );
    }
  }

  // --- 5. МЕТРИКИ ДЕКОМПОЗИЦИИ ---
  const decompositionData = filteredSnapshots.map((s) => {
    let organicDelta = 0;
    let fxImpactDelta = 0;
    const globalIdx = snapshots.findIndex(snap => snap.month === s.month);

    if (globalIdx > 0) {
      const prevSnapshot = snapshots[globalIdx - 1];
      const currentCurrencies: Record<string, number> = {};
      s.data.organizations.forEach(org => {
        org.balances.forEach(b => { if (Number(b.amount) > 0) currentCurrencies[b.currency] = (currentCurrencies[b.currency] || 0) + Number(b.amount); });
      });

      const prevCurrencies: Record<string, number> = {};
      prevSnapshot.data.organizations.forEach(org => {
        org.balances.forEach(b => { if (Number(b.amount) > 0) prevCurrencies[b.currency] = (prevCurrencies[b.currency] || 0) + Number(b.amount); });
      });

      const allCurrs = Array.from(new Set([...Object.keys(currentCurrencies), ...Object.keys(prevCurrencies)]));

      allCurrs.forEach(curr => {
        const currentAmt = currentCurrencies[curr] || 0;
        const prevAmt = prevCurrencies[curr] || 0;
        const diff = currentAmt - prevAmt;
        const currentRate = curr === baseCurrency ? 1 : Number(s.data.rates?.[curr] || 0);
        const prevRate = curr === baseCurrency ? 1 : Number(prevSnapshot.data.rates?.[curr] || 0);

        organicDelta += (diff * currentRate);
        fxImpactDelta += (prevAmt * (currentRate - prevRate));
      });
    } else {
      s.data.organizations.forEach(org => {
        org.balances.forEach(b => { organicDelta += getAmountInBase(Number(b.amount || 0), b.currency, s); });
      });
    }
    return { month: s.month, Deposits: Math.round(organicDelta), 'FX Impact': Math.round(fxImpactDelta) };
  });

  // --- 6. UX-МЕТРИКИ ---
  const uxMetricsData = filteredSnapshots.map(s => {
    let totalAccountsCount = 0;
    s.data.organizations.forEach(org => { totalAccountsCount += org.balances.length; });
    const duration = s.duration_seconds || 0;
    const costPerAccount = totalAccountsCount > 0 ? parseFloat((duration / totalAccountsCount).toFixed(1)) : 0;
    return { month: s.month, duration_seconds_raw: duration, accounts_count: totalAccountsCount, cost_per_account: costPerAccount };
  });

  const formatFriendlyTime = (seconds: number) => {
    if (seconds < 120) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const handleLegendClickSmart = (e: any, allKeys: string[]) => {
    const clickedKey = e.dataKey;
    if (!clickedKey) return;
    const now = Date.now();
    const isDoubleClick = lastClick && lastClick.key === clickedKey && (now - lastClick.time < 300);
    setLastClick({ key: clickedKey, time: now });

    setHiddenBalances(prev => {
      if (isDoubleClick) {
        const isAlreadyIsolated = allKeys.every(k => k === clickedKey ? !prev[k] : prev[k]);
        if (isAlreadyIsolated) {
          const resetHidden: Record<string, boolean> = {};
          allKeys.forEach(k => { resetHidden[k] = false; });
          return resetHidden;
        } else {
          const nextHidden: Record<string, boolean> = {};
          allKeys.forEach(k => { nextHidden[k] = k !== clickedKey; });
          return nextHidden;
        }
      } else {
        return { ...prev, [clickedKey]: !prev[clickedKey] };
      }
    });
  };

  const formatCompact = (val: number) => {
    return Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(val);
  };

  const LEGEND_STYLE = { cursor: 'pointer', fontSize: '12px', userSelect: 'none' as const };
  const isAnythingHidden = Object.values(hiddenBalances).some(v => v === true);

  if (loading) return <div>Analyzing datasets & generating visuals...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* ИСПРАВЛЕННЫЙ ИДЕАЛЬНО ПРОЗРАЧНЫЙ STICKY-КОНТЕЙНЕР ШАПКИ */}
      <div 
        className="flex justify-between items-center" 
        style={{ 
          position: 'sticky',
          top: 0,
          zIndex: 999,
          background: 'transparent', // Полностью убрали темную плашку!
          backdropFilter: 'blur(16px)', // Оставили только чистое матовое размытие контента
          WebkitBackdropFilter: 'blur(16px)',
          padding: '16px 4px',
          borderBottom: '1px solid var(--glass-border)', // Тонкая интерактивная линия разделения
          margin: '0 -4px'
        }}
      >
        <div className="flex items-center gap-4">
          <Link to="/" className="btn"><ArrowLeft size={18} /> Dashboard</Link>
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Advanced Asset Analytics</h2>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAnythingHidden && (
            <button 
              onClick={() => setHiddenBalances({})} 
              className="btn flex items-center gap-1.5"
              style={{ padding: '4px 10px', fontSize: '13px', height: '28px', borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(59, 130, 246, 0.05)' }}
            >
              <Eye size={14} /> Show Hidden
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: '10px', border: '1px solid var(--glass-border)', fontSize: '13px', height: '28px' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Timeframe:</span>
            <SearchableSelect value={startMonth} onChange={setStartMonth} options={availableMonths} placeholder="Start" />
            <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 'bold' }}>➔</span>
            <SearchableSelect value={effectiveEndMonth} onChange={setEndMonth} options={availableMonths.filter(m => !startMonth || m >= startMonth)} placeholder="End" />
          </div>
        </div>
      </div>

      {/* РАЗДЕЛ 1: HISTORICAL FINANCIAL METRICS */}
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
                <Legend onClick={(e) => handleLegendClickSmart(e, allUsedCurrencies)} wrapperStyle={LEGEND_STYLE} />
                {allUsedCurrencies.map((currency) => (
                  <Line key={currency} type="monotone" dataKey={currency} stroke={getCurrencyColor(currency)} strokeWidth={2} dot={{ r: 3 }} hide={hiddenBalances[currency]} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-panel" style={{ height: '350px', display: 'flex', flexDirection: 'column' }}>
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><LineChartIcon size={16} className="text-secondary" /> Exchange Rates Dynamic History</h4>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={currencyRatesData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <YAxis stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }} formatter={(val) => Number(val).toFixed(2)} />
                <Legend onClick={(e) => handleLegendClickSmart(e, activeCurrencies)} wrapperStyle={LEGEND_STYLE} />
                {activeCurrencies.map((c, idx) => (
                  <Line key={c} type="monotone" dataKey={c} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} hide={hiddenBalances[c]} />
                ))}
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
                <Legend onClick={(e) => handleLegendClickSmart(e, allOrganizations)} wrapperStyle={LEGEND_STYLE} />
                {allOrganizations.map((orgName, idx) => (
                  <Area key={orgName} type="monotone" dataKey={orgName} stackId="1" stroke={CHART_COLORS[idx % CHART_COLORS.length]} fill={CHART_COLORS[idx % CHART_COLORS.length]} fillOpacity={0.4} hide={hiddenBalances[orgName]} />
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
                <Legend onClick={(e) => handleLegendClickSmart(e, allUsedCurrencies)} wrapperStyle={LEGEND_STYLE} />
                {allUsedCurrencies.map((currency) => (
                  <Bar key={currency} dataKey={currency} stackId="a" fill={getCurrencyColor(currency)} hide={hiddenBalances[currency]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      </div>

      {/* РАЗДЕЛ 2: UX & OPERATIONAL METRICS */}
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

      {/* РАЗДЕЛ 3: HIGH-LEVEL EXECUTIVE INTEL */}
      <div>
        <h3 className="mb-4" style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>
          HIGH-LEVEL EXECUTIVE INTEL (ПО КРАЙНЕМУ СЛЕТУ: {latestSnapshot?.month})
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
            <h4 className="flex items-center gap-2 mb-4" style={{ margin: 0, fontSize: '14px' }}><ShieldAlert size={16} style={{ color: '#10b981' }} /> Cross-Asset Liquidity Matrix (Organizations ➔ Currencies)</h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowChartData} layout="vertical" margin={{ top: 10, right: 10, left: 40, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" stroke="var(--text-secondary)" tickFormatter={formatCompact} style={{ fontSize: '12px' }} />
                <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--glass-border)', borderRadius: 8 }} formatter={(val) => Math.round(Number(val)).toLocaleString('en-US')} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {allUsedCurrencies.map((currency) => (
                  <Bar key={currency} dataKey={currency} stackId="a" fill={getCurrencyColor(currency)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      </div>

    </div>
  );
}
