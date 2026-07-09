import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye } from 'lucide-react';
import type { ParsedSnapshot } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useSnapshots } from '../hooks/useSnapshots';
import { calculateFlowDecomposition, convertAmount } from '../lib/finance';
import { GraphsAnalyticsSections } from './components/graphs/GraphsAnalyticsSections';
import { SearchableSelect } from './components/graphs/SearchableSelect';

const CHART_COLORS = ['#3b82f6', '#10b981', '#eab308', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#ef4444'];
const QUICK_PERIODS = [
  ['2', '2M'],
  ['3', '3M'],
  ['6', '6M'],
  ['ytd', 'YTD'],
  ['12', '1Y'],
  ['24', '2Y'],
  ['all', 'ALL']
] as const;
const QUICK_PERIOD_LABELS = QUICK_PERIODS.map(([, label]) => label);

export default function GraphsPage() {
  const { settings } = useSettings();
  const { snapshots, loading } = useSnapshots({ sort: 'asc' });
  const baseCurrency = settings.baseCurrency || 'RUB';

  const [hiddenBalances, setHiddenBalances] = useState<Record<string, boolean>>({
    untagged: true
  });
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [quickPeriod, setQuickPeriod] = useState('all');
  const [lastClick, setLastClick] = useState<{ key: string; time: number } | null>(null);

  useEffect(() => {
    if (snapshots.length > 0 && !startMonth && !endMonth) {
      setStartMonth(snapshots[0].month);
      setEndMonth(snapshots[snapshots.length - 1].month);
    }
  }, [snapshots, startMonth, endMonth]);

  const availableMonths = snapshots.map(snapshot => snapshot.month);
  const effectiveEndMonth = (endMonth && startMonth && endMonth < startMonth) ? startMonth : endMonth;

  const filteredSnapshots = snapshots.filter(snapshot => {
    const startOk = startMonth ? snapshot.month >= startMonth : true;
    const endOk = effectiveEndMonth ? snapshot.month <= effectiveEndMonth : true;
    return startOk && endOk;
  });

  const getAmountInBase = (amount: number, currency: string, snapshot: ParsedSnapshot) => {
    return convertAmount(amount, currency, baseCurrency, snapshot.data.rates);
  };

  const activeCurrencies = useMemo(() => {
    const currencies = new Set<string>();

    filteredSnapshots.forEach(snapshot => {
      Object.keys(snapshot.data.rates || {}).forEach(currency => {
        if (currency !== baseCurrency && currency.trim() !== '') {
          currencies.add(currency);
        }
      });
    });

    return Array.from(currencies);
  }, [filteredSnapshots, baseCurrency]);

  const currencyRatesData = filteredSnapshots.map(snapshot => {
    const point: any = { month: snapshot.month };

    activeCurrencies.forEach(currency => {
      const directRate = convertAmount(1, currency, baseCurrency, snapshot.data.rates);
      if (directRate > 0) {
        if (directRate < 1.0) {
          point[currency] = parseFloat((1 / directRate).toFixed(2));
          point[`${currency}_isInverted`] = true;
        } else {
          point[currency] = parseFloat(directRate.toFixed(4));
          point[`${currency}_isInverted`] = false;
        }
      }
    });

    return point;
  });

  const allUsedCurrencies = useMemo(() => {
    const currencies = new Set<string>();

    filteredSnapshots.forEach(snapshot => {
      snapshot.data.organizations.forEach(org => {
        org.balances.forEach(balance => {
          if (balance.currency && Number(balance.amount) > 0) {
            currencies.add(balance.currency);
          }
        });
      });
    });

    return Array.from(currencies);
  }, [filteredSnapshots]);

  const usedCurrenciesData = filteredSnapshots.map(snapshot => {
    const point: any = { month: snapshot.month };
    allUsedCurrencies.forEach(currency => point[currency] = 0);

    snapshot.data.organizations.forEach(org => {
      org.balances.forEach(balance => {
        if (balance.currency && Number(balance.amount) > 0) {
          point[balance.currency] += Math.round(Number(balance.amount));
        }
      });
    });

    return point;
  });

  const allOrganizations = useMemo(() => {
    const organizations = new Set<string>();
    filteredSnapshots.forEach(snapshot => {
      snapshot.data.organizations.forEach(org => org.name && organizations.add(org.name));
    });
    return Array.from(organizations);
  }, [filteredSnapshots]);

  const orgTrendData = filteredSnapshots.map(snapshot => {
    const point: any = { month: snapshot.month };
    allOrganizations.forEach(orgName => point[orgName] = 0);

    snapshot.data.organizations.forEach(org => {
      const orgTotalBase = org.balances.reduce((total, balance) => {
        return total + getAmountInBase(Number(balance.amount || 0), balance.currency, snapshot);
      }, 0);

      if (org.name) point[org.name] = Math.round(orgTotalBase);
    });

    return point;
  });

  const currencyDistributionData = filteredSnapshots.map(snapshot => {
    const point: any = { month: snapshot.month };
    allUsedCurrencies.forEach(currency => point[currency] = 0);

    snapshot.data.organizations.forEach(org => {
      org.balances.forEach(balance => {
        point[balance.currency] += Math.round(getAmountInBase(Number(balance.amount || 0), balance.currency, snapshot));
      });
    });

    return point;
  });

  const allUsedTags = useMemo(() => {
    const tags = new Set<string>();

    filteredSnapshots.forEach(snapshot => {
      snapshot.data.organizations.forEach(org => {
        org.balances.forEach(balance => {
          if (balance.tags && balance.tags.length > 0) {
            balance.tags.forEach(tag => tags.add(tag));
          } else {
            tags.add('untagged');
          }
        });
      });
    });

    return Array.from(tags);
  }, [filteredSnapshots]);

  const tagDistributionData = filteredSnapshots.map(snapshot => {
    const point: any = { month: snapshot.month };
    allUsedTags.forEach(tag => point[tag] = 0);

    snapshot.data.organizations.forEach(org => {
      org.balances.forEach(balance => {
        const amountInBase = Math.round(getAmountInBase(Number(balance.amount || 0), balance.currency, snapshot));
        const currentTags = balance.tags;

        if (currentTags && currentTags.length > 0) {
          currentTags.forEach(tag => {
            point[tag] += Math.round(amountInBase / currentTags.length);
          });
        } else {
          point.untagged += amountInBase;
        }
      });
    });

    return point;
  });

  const latestSnapshot = filteredSnapshots[filteredSnapshots.length - 1];

  const treemapData: any[] = [];
  if (latestSnapshot) {
    latestSnapshot.data.organizations.forEach((org, index) => {
      const orgValue = org.balances.reduce((total, balance) => {
        return total + getAmountInBase(Number(balance.amount || 0), balance.currency, latestSnapshot);
      }, 0);

      if (orgValue > 0 && org.name) {
        treemapData.push({
          name: org.name,
          value: Math.round(orgValue),
          color: CHART_COLORS[index % CHART_COLORS.length]
        });
      }
    });
  }

  const flowChartData: any[] = [];
  if (latestSnapshot) {
    latestSnapshot.data.organizations.forEach(org => {
      if (!org.name) return;

      const point: any = { name: org.name };
      allUsedCurrencies.forEach(currency => point[currency] = 0);

      org.balances.forEach(balance => {
        point[balance.currency] += Math.round(getAmountInBase(Number(balance.amount || 0), balance.currency, latestSnapshot));
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
      org.balances.forEach(balance => {
        const value = getAmountInBase(Number(balance.amount || 0), balance.currency, latestSnapshot);
        totalNetWorth += value;

        if (['USDT', 'BTC', 'ETH', 'USDC'].includes(balance.currency.toUpperCase())) cryptoValue += value;
        else if (['USD', 'EUR', 'AED'].includes(balance.currency.toUpperCase())) fiatStableValue += value;
        else localFiatValue += value;
      });
    });

    if (totalNetWorth > 0) {
      const cryptoPct = cryptoValue / totalNetWorth;
      const stablePct = fiatStableValue / totalNetWorth;
      const localPct = localFiatValue / totalNetWorth;

      radarData.push(
        { subject: 'Liquidity', A: Math.round((cryptoPct * 0.9 + stablePct * 0.8 + localPct * 0.95) * 100), fullMark: 100 },
        { subject: 'Inflation Protect', A: Math.round((cryptoPct * 0.95 + stablePct * 0.6 + localPct * 0.15) * 100), fullMark: 100 },
        { subject: 'Asset Stability', A: Math.round((stablePct * 0.95 + localPct * 0.5 + (1 - cryptoPct) * 0.4) * 100), fullMark: 100 },
        { subject: 'Yield Potential', A: Math.round((cryptoPct * 0.85 + localPct * 0.4 + stablePct * 0.2) * 100), fullMark: 100 },
        { subject: 'Infra Safety', A: Math.round((cryptoPct * 0.9 + stablePct * 0.3 + localPct * 0.8) * 100), fullMark: 100 }
      );
    }
  }

  const decompositionData = filteredSnapshots.map(snapshot => {
    const globalIndex = snapshots.findIndex(s => s.month === snapshot.month);
    const previousSnapshot = globalIndex > 0 ? snapshots[globalIndex - 1] : null;
    const { organicDelta, fxImpactDelta } = calculateFlowDecomposition(snapshot, previousSnapshot, baseCurrency);

    return { month: snapshot.month, Deposits: Math.round(organicDelta), 'FX Impact': Math.round(fxImpactDelta) };
  });

  const uxMetricsData = filteredSnapshots.map(snapshot => {
    const totalAccountsCount = snapshot.data.organizations.reduce((total, org) => total + org.balances.length, 0);
    const duration = snapshot.duration_seconds || 0;
    const costPerAccount = totalAccountsCount > 0 ? parseFloat((duration / totalAccountsCount).toFixed(1)) : 0;

    return {
      month: snapshot.month,
      duration_seconds_raw: duration,
      accounts_count: totalAccountsCount,
      cost_per_account: costPerAccount
    };
  });

  const formatFriendlyTime = (seconds: number) => {
    if (seconds < 120) return `${Math.round(seconds)}s`;

    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const handleLegendClickSmart = (event: any, allKeys: string[]) => {
    const clickedKey = event.dataKey;
    if (!clickedKey) return;

    const now = Date.now();
    const isDoubleClick = lastClick && lastClick.key === clickedKey && (now - lastClick.time < 300);
    setLastClick({ key: clickedKey, time: now });

    setHiddenBalances(prev => {
      if (isDoubleClick) {
        const isAlreadyIsolated = allKeys.every(key => key === clickedKey ? !prev[key] : prev[key]);
        if (isAlreadyIsolated) {
          const resetHidden: Record<string, boolean> = {};
          allKeys.forEach(key => { resetHidden[key] = false; });
          return resetHidden;
        }

        const nextHidden: Record<string, boolean> = {};
        allKeys.forEach(key => { nextHidden[key] = key !== clickedKey; });
        return nextHidden;
      }

      return { ...prev, [clickedKey]: !prev[clickedKey] };
    });
  };

  const formatCompact = (value: number) => {
    return Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(value);
  };

  const handleQuickPeriod = (period: string) => {
    if (availableMonths.length === 0) return;

    const latestMonth = availableMonths[availableMonths.length - 1];
    setQuickPeriod(period);
    setEndMonth(latestMonth);

    if (period === 'all') {
      setStartMonth(availableMonths[0]);
      return;
    }

    const [year, month] = latestMonth.split('-').map(Number);
    const date = period === 'ytd' ? new Date(year, 0, 1) : new Date(year, month - Number(period), 1);
    const computedStart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setStartMonth(computedStart < availableMonths[0] ? availableMonths[0] : computedStart);
  };

  const handleManualStartChange = (value: string) => {
    setQuickPeriod('custom');
    setStartMonth(value);
  };

  const handleManualEndChange = (value: string) => {
    setQuickPeriod('custom');
    setEndMonth(value);
  };

  const selectedQuickPeriodLabel = QUICK_PERIODS.find(([value]) => value === quickPeriod)?.[1] || 'Custom';
  const handleQuickPeriodLabelChange = (label: string) => {
    const period = QUICK_PERIODS.find(([, periodLabel]) => periodLabel === label)?.[0];
    if (period) handleQuickPeriod(period);
  };

  const isAnythingHidden = useMemo(() => {
    return Object.entries(hiddenBalances).some(([key, value]) => {
      if (key === 'untagged') return false;
      return value === true;
    });
  }, [hiddenBalances]);

  if (loading) return <div>Analyzing datasets & generating visuals...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div
        className="flex justify-between items-center"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 999,
          background: 'transparent',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          padding: '16px 4px',
          borderBottom: '1px solid var(--glass-border)',
          margin: '0 -4px'
        }}
      >
        <div className="flex items-center gap-4">
          <Link to="/" title="Back to dashboard" className="btn"><ArrowLeft size={18} /></Link>
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Advanced Asset Analytics</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAnythingHidden && (
            <button
              onClick={() => setHiddenBalances({ untagged: true })}
              className="btn flex items-center gap-1.5"
              style={{ padding: '8px 16px', fontSize: '14px', borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(59, 130, 246, 0.05)' }}
            >
              <Eye size={14} /> Show Hidden
            </button>
          )}

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.03)',
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid var(--glass-border)',
            fontSize: '14px',
            boxSizing: 'border-box',
            height: '38px'
          }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Timeframe:</span>
            <SearchableSelect value={selectedQuickPeriodLabel} onChange={handleQuickPeriodLabelChange} options={QUICK_PERIOD_LABELS} placeholder="Period" showSearch={false} width="84px" dropdownWidth="96px" />
            <SearchableSelect value={startMonth} onChange={handleManualStartChange} options={availableMonths} placeholder="Start" />
            <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 'bold' }}>➔</span>
            <SearchableSelect value={effectiveEndMonth} onChange={handleManualEndChange} options={availableMonths.filter(month => !startMonth || month >= startMonth)} placeholder="End" />
          </div>
        </div>
      </div>

      <GraphsAnalyticsSections
        baseCurrency={baseCurrency}
        activeCurrencies={activeCurrencies}
        allOrganizations={allOrganizations}
        allUsedCurrencies={allUsedCurrencies}
        allUsedTags={allUsedTags}
        chartColors={CHART_COLORS}
        currencyDistributionData={currencyDistributionData}
        currencyRatesData={currencyRatesData}
        decompositionData={decompositionData}
        flowChartData={flowChartData}
        hiddenBalances={hiddenBalances}
        latestSnapshotMonth={latestSnapshot?.month}
        orgTrendData={orgTrendData}
        radarData={radarData}
        tagDistributionData={tagDistributionData}
        treemapData={treemapData}
        usedCurrenciesData={usedCurrenciesData}
        uxMetricsData={uxMetricsData}
        formatCompact={formatCompact}
        formatFriendlyTime={formatFriendlyTime}
        handleLegendClickSmart={handleLegendClickSmart}
      />
    </div>
  );
}
