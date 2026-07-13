import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye } from 'lucide-react';
import type { ParsedSnapshot } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useSnapshots } from '../hooks/useSnapshots';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { calculateFlowDecomposition, calculateTotals, convertAmount } from '../lib/finance';
import { GraphsAnalyticsSections } from './components/graphs/GraphsAnalyticsSections';
import { SearchableSelect } from './components/graphs/SearchableSelect';
import { StickyPageHeader } from './components/StickyPageHeader';

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

const getSignedPercent = (current: number, previous: number) => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

export default function GraphsPage() {
  const { settings } = useSettings();
  const { snapshots, loading } = useSnapshots({ sort: 'asc' });
  const baseCurrency = settings.baseCurrency || 'RUB';
  useEscapeToDashboard();

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

  const getSnapshotTotalBase = (snapshot: ParsedSnapshot) => {
    return calculateTotals(snapshot, baseCurrency).totalBase;
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
  const firstSnapshot = filteredSnapshots[0];

  const netWorthData = filteredSnapshots.map(snapshot => {
    const globalIndex = snapshots.findIndex(s => s.month === snapshot.month);
    const previousSnapshot = globalIndex > 0 ? snapshots[globalIndex - 1] : null;
    const total = getSnapshotTotalBase(snapshot);
    const previousTotal = previousSnapshot ? getSnapshotTotalBase(previousSnapshot) : total;

    return {
      month: snapshot.month,
      total: Math.round(total),
      delta: Math.round(total - previousTotal)
    };
  });

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

  const decompositionData = filteredSnapshots.map(snapshot => {
    const globalIndex = snapshots.findIndex(s => s.month === snapshot.month);
    const previousSnapshot = globalIndex > 0 ? snapshots[globalIndex - 1] : null;
    const { organicDelta, fxImpactDelta } = previousSnapshot
      ? calculateFlowDecomposition(snapshot, previousSnapshot, baseCurrency)
      : { organicDelta: 0, fxImpactDelta: 0 };

    return { month: snapshot.month, Deposits: Math.round(organicDelta), 'FX Impact': Math.round(fxImpactDelta) };
  });

  const buildOrgValues = (snapshot?: ParsedSnapshot) => {
    const values: Record<string, number> = {};
    if (!snapshot) return values;

    snapshot.data.organizations.forEach(org => {
      if (!org.name) return;
      values[org.name] = org.balances.reduce((total, balance) => {
        return total + getAmountInBase(Number(balance.amount || 0), balance.currency, snapshot);
      }, 0);
    });

    return values;
  };

  const buildCurrencyValues = (snapshot?: ParsedSnapshot) => {
    const values: Record<string, number> = {};
    if (!snapshot) return values;

    snapshot.data.organizations.forEach(org => {
      org.balances.forEach(balance => {
        if (!balance.currency) return;
        values[balance.currency] = (values[balance.currency] || 0) + getAmountInBase(Number(balance.amount || 0), balance.currency, snapshot);
      });
    });

    return values;
  };

  const buildTagValues = (snapshot?: ParsedSnapshot) => {
    const values: Record<string, number> = {};
    if (!snapshot) return values;

    snapshot.data.organizations.forEach(org => {
      org.balances.forEach(balance => {
        const amountInBase = getAmountInBase(Number(balance.amount || 0), balance.currency, snapshot);
        const currentTags = balance.tags && balance.tags.length > 0 ? balance.tags : ['untagged'];
        currentTags.forEach(tag => {
          values[tag] = (values[tag] || 0) + (amountInBase / currentTags.length);
        });
      });
    });

    return values;
  };

  const buildMovers = (startValues: Record<string, number>, endValues: Record<string, number>) => {
    return Array.from(new Set([...Object.keys(startValues), ...Object.keys(endValues)]))
      .map(name => {
        const start = startValues[name] || 0;
        const end = endValues[name] || 0;
        return {
          name,
          value: Math.round(end),
          delta: Math.round(end - start),
          percent: getSignedPercent(end, start)
        };
      })
      .filter(item => Math.abs(item.delta) >= 1 || item.value > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 6);
  };

  const latestOrgValues = buildOrgValues(latestSnapshot);
  const latestCurrencyValues = buildCurrencyValues(latestSnapshot);
  const latestTagValues = buildTagValues(latestSnapshot);
  const topOrganizationMovers = buildMovers(buildOrgValues(firstSnapshot), latestOrgValues);
  const topCurrencyMovers = buildMovers(buildCurrencyValues(firstSnapshot), latestCurrencyValues);
  const topTagMovers = buildMovers(buildTagValues(firstSnapshot), latestTagValues);

  const currentTotal = latestSnapshot ? getSnapshotTotalBase(latestSnapshot) : 0;
  const startTotal = firstSnapshot ? getSnapshotTotalBase(firstSnapshot) : 0;
  const periodDelta = latestSnapshot && firstSnapshot ? currentTotal - startTotal : 0;
  const periodOrganicDelta = decompositionData.reduce((total, point) => total + Number(point.Deposits || 0), 0);
  const periodFxImpactDelta = decompositionData.reduce((total, point) => total + Number(point['FX Impact'] || 0), 0);
  const summaryStats = [
    {
      label: 'Net worth',
      value: Math.round(currentTotal),
      suffix: baseCurrency,
      help: `Total value of the latest selected snapshot. Every balance is converted to ${baseCurrency} using the exchange rates stored in that snapshot.`
    },
    {
      label: 'Period change',
      value: Math.round(periodDelta),
      suffix: baseCurrency,
      percent: getSignedPercent(currentTotal, startTotal),
      help: `Difference between the latest and first snapshots in the selected range. Percent is this change divided by the first snapshot total.`
    },
    {
      label: 'Organic flow',
      value: Math.round(periodOrganicDelta),
      suffix: baseCurrency,
      help: `Sum of balance amount changes across the selected range, valued in ${baseCurrency} at each current snapshot's rates. This is deposits, withdrawals, and manual balance changes.`
    },
    {
      label: 'FX impact',
      value: Math.round(periodFxImpactDelta),
      suffix: baseCurrency,
      help: `Estimated change caused by exchange-rate movement. Previous currency balances are revalued with current rates and compared with their previous-rate value.`
    }
  ];

  const buildConcentrationStat = (label: string, values: Record<string, number>) => {
    const top = Object.entries(values).sort((a, b) => b[1] - a[1])[0];
    const total = Object.values(values).reduce((sum, value) => sum + value, 0);

    return {
      label,
      name: top?.[0] || 'N/A',
      value: Math.round(top?.[1] || 0),
      percent: total > 0 ? ((top?.[1] || 0) / total) * 100 : 0
    };
  };

  const concentrationStats = [
    buildConcentrationStat('Top organization', latestOrgValues),
    buildConcentrationStat('Top currency', latestCurrencyValues),
    buildConcentrationStat('Top tag', latestTagValues)
  ];

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
      <StickyPageHeader marginBottom="0" compactTop>
        <div className="flex items-center gap-4">
          <Link to="/" title="Back to dashboard" className="btn"><ArrowLeft size={18} /></Link>
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Portfolio Analytics</h2>
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
      </StickyPageHeader>

      <GraphsAnalyticsSections
        baseCurrency={baseCurrency}
        activeCurrencies={activeCurrencies}
        allOrganizations={allOrganizations}
        allUsedCurrencies={allUsedCurrencies}
        allUsedTags={allUsedTags}
        chartColors={CHART_COLORS}
        concentrationStats={concentrationStats}
        currencyDistributionData={currencyDistributionData}
        currencyRatesData={currencyRatesData}
        decompositionData={decompositionData}
        flowChartData={flowChartData}
        hiddenBalances={hiddenBalances}
        latestSnapshotMonth={latestSnapshot?.month}
        netWorthData={netWorthData}
        orgTrendData={orgTrendData}
        summaryStats={summaryStats}
        tagDistributionData={tagDistributionData}
        topCurrencyMovers={topCurrencyMovers}
        topOrganizationMovers={topOrganizationMovers}
        topTagMovers={topTagMovers}
        treemapData={treemapData}
        uxMetricsData={uxMetricsData}
        formatCompact={formatCompact}
        formatFriendlyTime={formatFriendlyTime}
        handleLegendClickSmart={handleLegendClickSmart}
      />
    </div>
  );
}
