import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye } from 'lucide-react';
import type { ParsedSnapshot } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useSnapshots } from '../hooks/useSnapshots';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { calculateEstimatedCapitalReturn, calculateFlowDecomposition, calculateNetExternalFlow, calculateSnapshotTotalAtRates, calculateTaggedCapitalReturns, calculateTotals, convertAmount } from '../lib/finance';
import { useFlowEntries } from '../hooks/useFlowEntries';
import { GraphsAnalyticsSections, type HiddenLegendSeries, type LegendGroup } from './components/graphs/GraphsAnalyticsSections';
import { PageLoader } from './components/PageLoader';
import { StickyPageHeader } from './components/StickyPageHeader';
import { TimeframeControl } from './components/TimeframeControl';

const CHART_COLORS = ['#3b82f6', '#10b981', '#eab308', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#ef4444'];
const getSignedPercent = (current: number, previous: number) => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

export default function GraphsPage() {
  const { settings } = useSettings();
  const { snapshots, loading } = useSnapshots({ sort: 'asc' });
  const cashFlowEnabled = Boolean(settings.cashFlow?.enabled);
  const { entries: flowEntries, error: flowError, loading: flowLoading } = useFlowEntries(cashFlowEnabled);
  const baseCurrency = settings.baseCurrency || 'RUB';
  useEscapeToDashboard();

  const [hiddenSeries, setHiddenSeries] = useState<HiddenLegendSeries>({
    currencies: {},
    organizations: {},
    tags: { untagged: true }
  });
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [lastClick, setLastClick] = useState<{ group: LegendGroup; key: string; time: number } | null>(null);

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

  const decompositionData = filteredSnapshots.map((snapshot, index) => {
    const previousSnapshot = index > 0 ? filteredSnapshots[index - 1] : null;
    const { organicDelta, fxImpactDelta } = previousSnapshot
      ? calculateFlowDecomposition(snapshot, previousSnapshot, baseCurrency)
      : { organicDelta: 0, fxImpactDelta: 0 };

    if (cashFlowEnabled && previousSnapshot) {
      const monthEntries = flowEntries.filter(entry => entry.month === snapshot.month);
      const externalFlow = calculateNetExternalFlow(monthEntries, snapshot.data.rates, baseCurrency);
      const previousCapital = calculateSnapshotTotalAtRates(previousSnapshot, snapshot.data.rates, baseCurrency);
      const estimated = calculateEstimatedCapitalReturn(organicDelta, previousCapital, externalFlow);

      return {
        month: snapshot.month,
        'External flow': estimated.externalFlow,
        'Capital earnings': estimated.result,
        'FX Impact': fxImpactDelta,
        returnRatePercent: estimated.ratePercent
      };
    }

    return { month: snapshot.month, 'Organic flow': organicDelta, 'FX Impact': fxImpactDelta, returnRatePercent: null };
  });

  const cashFlowMonthlyRaw = filteredSnapshots.map(snapshot => {
    const point = {
      month: snapshot.month,
      'Gross incoming': 0,
      'After-tax income': 0,
      Spending: 0,
      Taxes: 0,
      'Net saved': 0,
      'Savings rate': null as number | null
    };

    flowEntries.forEach(entry => {
      if (entry.month !== snapshot.month || entry.entryType === 'transfer') return;
      const amount = convertAmount(entry.amount, entry.currency, baseCurrency, snapshot.data.rates);
      if (entry.direction === 'in') {
        const tax = amount * (entry.taxRate || 0) / 100;
        point['Gross incoming'] += amount;
        point.Taxes -= tax;
      } else {
        point.Spending -= amount;
      }
    });
    point['After-tax income'] = point['Gross incoming'] + point.Taxes;
    point['Net saved'] = point['After-tax income'] + point.Spending;
    point['Savings rate'] = point['After-tax income'] > 0
      ? (point['Net saved'] / point['After-tax income']) * 100
      : null;
    return point;
  });
  const cashFlowMonthlyData = cashFlowMonthlyRaw.map((point, index) => {
    const rates = cashFlowMonthlyRaw
      .slice(Math.max(0, index - 2), index + 1)
      .map(item => item['Savings rate'])
      .filter((rate): rate is number => rate !== null && Number.isFinite(rate));
    return {
      ...point,
      '3M average': rates.length > 0 ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null
    };
  });

  const snapshotsByMonth = new Map(filteredSnapshots.map(snapshot => [snapshot.month, snapshot]));
  const cashFlowEventsData = flowEntries.flatMap(entry => {
    if (entry.entryType === 'transfer') return [];
    const snapshot = snapshotsByMonth.get(entry.month);
    if (!snapshot) return [];
    const grossAmount = convertAmount(entry.amount, entry.currency, baseCurrency, snapshot.data.rates);
    const taxAmount = entry.direction === 'in' ? grossAmount * (entry.taxRate || 0) / 100 : 0;
    const amount = entry.direction === 'in' ? grossAmount - taxAmount : -grossAmount;
    if (amount === 0) return [];
    return [{
      id: entry.id,
      month: entry.month,
      amount,
      magnitude: Math.abs(amount),
      direction: entry.direction,
      category: entry.category || (entry.direction === 'in' ? 'Income' : 'Other spending'),
      counterparty: entry.counterparty,
      comment: entry.comment,
      grossAmount,
      taxAmount,
      fill: entry.direction === 'in' ? '#10b981' : '#ef4444'
    }];
  }).sort((left, right) => left.month.localeCompare(right.month) || left.id - right.id);

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
  const periodOrganicDelta = decompositionData.reduce((total, point) => total + Number(point['Organic flow'] || 0), 0);
  const periodExternalFlow = decompositionData.reduce((total, point) => total + Number(point['External flow'] || 0), 0);
  const periodEstimatedReturn = decompositionData.reduce((total, point) => total + Number(point['Capital earnings'] || 0), 0);
  const periodReturnMultiplier = decompositionData.reduce((multiplier, point) => {
    const rate = point.returnRatePercent;
    return typeof rate === 'number' && Number.isFinite(rate) ? multiplier * (1 + rate / 100) : multiplier;
  }, 1);
  const periodFxImpactDelta = decompositionData.reduce((total, point) => total + Number(point['FX Impact'] || 0), 0);
  const taggedReturnTotals = new Map<string, { result: number; multiplier: number; months: number }>();
  let assignedExternalEntries = 0;
  let totalExternalEntries = 0;
  filteredSnapshots.forEach((snapshot, index) => {
    if (!cashFlowEnabled || index === 0) return;
    const monthEntries = flowEntries.filter(entry => entry.month === snapshot.month);
    const breakdown = calculateTaggedCapitalReturns(snapshot, filteredSnapshots[index - 1], monthEntries, baseCurrency);
    assignedExternalEntries += breakdown.assignedExternalEntries;
    totalExternalEntries += breakdown.totalExternalEntries;
    breakdown.returns.forEach(item => {
      const total = taggedReturnTotals.get(item.tag) || { result: 0, multiplier: 1, months: 0 };
      total.result += item.result;
      if (item.ratePercent !== null && Number.isFinite(item.ratePercent)) {
        total.multiplier *= 1 + item.ratePercent / 100;
        total.months += 1;
      }
      taggedReturnTotals.set(item.tag, total);
    });
  });
  const tagReturnStats = Array.from(taggedReturnTotals.entries())
    .map(([tag, total]) => ({
      tag,
      result: total.result,
      ratePercent: total.months > 0 ? (total.multiplier - 1) * 100 : null
    }))
    .filter(item => Math.abs(item.result) >= 0.01 || item.ratePercent !== null)
    .sort((left, right) => Math.abs(right.result) - Math.abs(left.result));
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
    ...(cashFlowEnabled ? [
      {
        label: 'External flow',
        value: Math.round(periodExternalFlow),
        suffix: baseCurrency,
        help: `Net recorded Cash Flow across the selected range: after-tax incoming minus outgoing. Every movement is converted to ${baseCurrency} using its month's snapshot rates.`
      },
      {
        label: 'Capital earnings',
        value: Math.round(periodEstimatedReturn),
        suffix: baseCurrency,
        percent: (periodReturnMultiplier - 1) * 100,
        help: `Approximate earnings from unlogged deposits, stocks, and other capital: balance change without FX minus net external Cash Flow. Each month's opening capital, movements, and earnings use that month's closing rates, keeping FX outside the return. The percentage is a time-weighted return: it follows a virtual unit of money through each month while ignoring deposits and withdrawals.`
      }
    ] : [{
      label: 'Organic flow',
      value: Math.round(periodOrganicDelta),
      suffix: baseCurrency,
      help: `Sum of balance amount changes across the selected range, valued in ${baseCurrency} at each current snapshot's rates. This is deposits, withdrawals, returns, and manual balance changes.`
    }]),
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

  const handleLegendClickSmart = (group: LegendGroup, event: any, allKeys: string[]) => {
    const clickedKey = event.dataKey;
    if (!clickedKey) return;

    const now = Date.now();
    const isDoubleClick = lastClick && lastClick.group === group && lastClick.key === clickedKey && (now - lastClick.time < 300);
    setLastClick({ group, key: clickedKey, time: now });

    setHiddenSeries(prev => {
      const currentGroup = prev[group];

      if (isDoubleClick) {
        const isAlreadyIsolated = allKeys.every(key => key === clickedKey ? !currentGroup[key] : currentGroup[key]);
        if (isAlreadyIsolated) {
          const resetHidden: Record<string, boolean> = {};
          allKeys.forEach(key => { resetHidden[key] = false; });
          return { ...prev, [group]: resetHidden };
        }

        const nextHidden: Record<string, boolean> = {};
        allKeys.forEach(key => { nextHidden[key] = key !== clickedKey; });
        return { ...prev, [group]: nextHidden };
      }

      return {
        ...prev,
        [group]: { ...currentGroup, [clickedKey]: !currentGroup[clickedKey] }
      };
    });
  };

  const formatCompact = (value: number) => {
    return Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(value);
  };

  const isAnythingHidden = useMemo(() => {
    return Object.entries(hiddenSeries).some(([group, values]) => (
      Object.entries(values).some(([key, value]) => {
        if (group === 'tags' && key === 'untagged') return false;
        return value === true;
      })
    ));
  }, [hiddenSeries]);

  if (loading || flowLoading) return <PageLoader label="Loading portfolio analytics" />;
  if (flowError) {
    return (
      <div className="glass-panel" style={{ maxWidth: '680px', margin: '48px auto', textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Cash Flow could not be loaded</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Estimated capital return is hidden because showing it without the recorded external movements would be misleading.
        </p>
        <Link to="/" className="btn">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <StickyPageHeader marginBottom="0">
        <div className="flex items-center gap-4">
          <Link to="/" title="Back to dashboard" className="btn"><ArrowLeft size={18} /></Link>
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Portfolio Analytics</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAnythingHidden && (
            <button
              onClick={() => setHiddenSeries({ currencies: {}, organizations: {}, tags: { untagged: true } })}
              className="btn flex items-center gap-1.5"
              style={{ padding: '8px 16px', fontSize: '14px', borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(59, 130, 246, 0.05)' }}
            >
              <Eye size={14} /> Show Hidden
            </button>
          )}

          <TimeframeControl
            availableMonths={availableMonths}
            startMonth={startMonth}
            endMonth={effectiveEndMonth}
            onChange={(start, end) => {
              setStartMonth(start);
              setEndMonth(end);
            }}
          />
        </div>
      </StickyPageHeader>

      <GraphsAnalyticsSections
        baseCurrency={baseCurrency}
        cashFlowEnabled={cashFlowEnabled}
        capitalReturnSummary={cashFlowEnabled ? {
          organicChange: periodExternalFlow + periodEstimatedReturn,
          externalFlow: periodExternalFlow,
          result: periodEstimatedReturn,
          ratePercent: (periodReturnMultiplier - 1) * 100
        } : undefined}
        activeCurrencies={activeCurrencies}
        allOrganizations={allOrganizations}
        allUsedCurrencies={allUsedCurrencies}
        allUsedTags={allUsedTags}
        chartColors={CHART_COLORS}
        concentrationStats={concentrationStats}
        currencyDistributionData={currencyDistributionData}
        currencyRatesData={currencyRatesData}
        cashFlowMonthlyData={cashFlowMonthlyData}
        cashFlowEventsData={cashFlowEventsData}
        decompositionData={decompositionData}
        flowChartData={flowChartData}
        hiddenSeries={hiddenSeries}
        latestSnapshotMonth={latestSnapshot?.month}
        netWorthData={netWorthData}
        orgTrendData={orgTrendData}
        summaryStats={summaryStats}
        tagDistributionData={tagDistributionData}
        tagReturnCoverage={{ assigned: assignedExternalEntries, total: totalExternalEntries }}
        tagReturnStats={tagReturnStats}
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
