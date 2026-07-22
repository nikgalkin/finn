import { useEffect, useMemo, useRef, useState } from 'react';
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
const LEGEND_DOUBLE_CLICK_WINDOW_MS = 700;
const getSignedPercent = (current: number, previous: number) => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

type ValueMap = Record<string, number>;
type SnapshotBreakdown = {
  organizations: ValueMap;
  currencies: ValueMap;
  chartCurrencies: ValueMap;
  tags: ValueMap;
  chartTags: ValueMap;
  currencyKeys: string[];
  tagKeys: string[];
};

const addValue = (values: ValueMap, key: string, amount: number) => {
  values[key] = (values[key] || 0) + amount;
};

const buildSnapshotBreakdown = (snapshot: ParsedSnapshot, baseCurrency: string): SnapshotBreakdown => {
  const organizations: ValueMap = {};
  const currencies: ValueMap = {};
  const chartCurrencies: ValueMap = {};
  const tags: ValueMap = {};
  const chartTags: ValueMap = {};
  const currencyKeys = new Set<string>();
  const tagKeys = new Set<string>();

  snapshot.data.organizations.forEach(org => {
    let organizationValue = 0;
    org.balances.forEach(balance => {
      const rawAmount = Number(balance.amount || 0);
      const amount = convertAmount(rawAmount, balance.currency, baseCurrency, snapshot.data.rates);
      organizationValue += amount;
      if (balance.currency) {
        addValue(currencies, balance.currency, amount);
        addValue(chartCurrencies, balance.currency, Math.round(amount));
        if (rawAmount > 0) currencyKeys.add(balance.currency);
      }

      const balanceTags = balance.tags?.length ? balance.tags : ['untagged'];
      const roundedAmount = Math.round(amount);
      balanceTags.forEach(tag => {
        tagKeys.add(tag);
        addValue(tags, tag, amount / balanceTags.length);
        addValue(chartTags, tag, Math.round(roundedAmount / balanceTags.length));
      });
    });
    if (org.name) organizations[org.name] = organizationValue;
  });

  return { organizations, currencies, chartCurrencies, tags, chartTags, currencyKeys: [...currencyKeys], tagKeys: [...tagKeys] };
};

const collectKeys = (breakdowns: SnapshotBreakdown[], getKeys: (breakdown: SnapshotBreakdown) => string[]) => (
  Array.from(new Set(breakdowns.flatMap(getKeys)))
);

const buildBreakdownSeries = (
  snapshots: ParsedSnapshot[],
  breakdowns: SnapshotBreakdown[],
  keys: string[],
  getValues: (breakdown: SnapshotBreakdown) => ValueMap,
  round = false
) => snapshots.map((snapshot, index) => {
  const values = getValues(breakdowns[index]);
  return Object.fromEntries([
    ['month', snapshot.month],
    ...keys.map(key => [key, round ? Math.round(values[key] || 0) : values[key] || 0])
  ]);
});

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
  const lastLegendClickRef = useRef<{ group: LegendGroup; key: string; time: number } | null>(null);

  useEffect(() => {
    if (snapshots.length > 0 && !startMonth && !endMonth) {
      setStartMonth(snapshots[0].month);
      setEndMonth(snapshots[snapshots.length - 1].month);
    }
  }, [snapshots, startMonth, endMonth]);

  const availableMonths = snapshots.map(snapshot => snapshot.month);
  const effectiveEndMonth = (endMonth && startMonth && endMonth < startMonth) ? startMonth : endMonth;

  const filteredSnapshots = useMemo(() => snapshots.filter(snapshot => {
    const startOk = startMonth ? snapshot.month >= startMonth : true;
    const endOk = effectiveEndMonth ? snapshot.month <= effectiveEndMonth : true;
    return startOk && endOk;
  }), [effectiveEndMonth, snapshots, startMonth]);

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

  const snapshotBreakdowns = useMemo(
    () => filteredSnapshots.map(snapshot => buildSnapshotBreakdown(snapshot, baseCurrency)),
    [baseCurrency, filteredSnapshots]
  );
  const allOrganizations = useMemo(() => collectKeys(snapshotBreakdowns, breakdown => Object.keys(breakdown.organizations)), [snapshotBreakdowns]);
  const allUsedCurrencies = useMemo(() => collectKeys(snapshotBreakdowns, breakdown => breakdown.currencyKeys), [snapshotBreakdowns]);
  const allUsedTags = useMemo(() => collectKeys(snapshotBreakdowns, breakdown => breakdown.tagKeys), [snapshotBreakdowns]);
  const orgTrendData = buildBreakdownSeries(filteredSnapshots, snapshotBreakdowns, allOrganizations, breakdown => breakdown.organizations, true);
  const currencyDistributionData = buildBreakdownSeries(filteredSnapshots, snapshotBreakdowns, allUsedCurrencies, breakdown => breakdown.chartCurrencies);
  const tagDistributionData = buildBreakdownSeries(filteredSnapshots, snapshotBreakdowns, allUsedTags, breakdown => breakdown.chartTags);

  const latestSnapshot = filteredSnapshots[filteredSnapshots.length - 1];
  const firstSnapshot = filteredSnapshots[0];
  const organizationCurrencyBreakdown = useMemo(() => {
    if (!latestSnapshot) return [];

    return latestSnapshot.data.organizations.flatMap(organization => {
      if (!organization.name) return [];
      const currencies = new Map<string, { amount: number; valueBase: number }>();
      organization.balances.forEach(balance => {
        if (!balance.currency) return;
        const amount = Number(balance.amount || 0);
        const valueBase = convertAmount(amount, balance.currency, baseCurrency, latestSnapshot.data.rates);
        const current = currencies.get(balance.currency) || { amount: 0, valueBase: 0 };
        current.amount += amount;
        current.valueBase += valueBase;
        currencies.set(balance.currency, current);
      });

      const holdings = Array.from(currencies.entries())
        .map(([currency, values]) => ({ currency, ...values }))
        .filter(holding => Math.abs(holding.valueBase) >= 0.01)
        .sort((left, right) => Math.abs(right.valueBase) - Math.abs(left.valueBase));
      const totalBase = holdings.reduce((sum, holding) => sum + holding.valueBase, 0);
      const shareBasis = holdings.reduce((sum, holding) => sum + Math.abs(holding.valueBase), 0);

      return [{
        organization: organization.name,
        totalBase,
        holdings: holdings.map(holding => ({
          ...holding,
          percent: shareBasis > 0 ? (Math.abs(holding.valueBase) / shareBasis) * 100 : 0
        }))
      }];
    }).filter(item => item.holdings.length > 0)
      .sort((left, right) => Math.abs(right.totalBase) - Math.abs(left.totalBase));
  }, [baseCurrency, latestSnapshot]);

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
  const taggedReturnTotals = new Map<string, {
    result: number;
    multiplier: number;
    ratedMonths: number;
    monthly: Array<{ month: string; openingCapital: number; closingCapital: number; result: number; ratePercent: number | null }>;
  }>();
  let assignedExternalEntries = 0;
  let totalExternalEntries = 0;
  let proportionallyAllocatedEntries = 0;
  filteredSnapshots.forEach((snapshot, index) => {
    if (!cashFlowEnabled || index === 0) return;
    const monthEntries = flowEntries.filter(entry => entry.month === snapshot.month);
    const breakdown = calculateTaggedCapitalReturns(snapshot, filteredSnapshots[index - 1], monthEntries, baseCurrency);
    assignedExternalEntries += breakdown.assignedExternalEntries;
    totalExternalEntries += breakdown.totalExternalEntries;
    proportionallyAllocatedEntries += breakdown.proportionallyAllocatedEntries;
    breakdown.returns.forEach(item => {
      const total = taggedReturnTotals.get(item.tag) || { result: 0, multiplier: 1, ratedMonths: 0, monthly: [] };
      total.result += item.result;
      total.monthly.push({
        month: snapshot.month,
        openingCapital: item.openingCapital,
        closingCapital: item.closingCapital,
        result: item.result,
        ratePercent: item.ratePercent
      });
      if (item.ratePercent !== null && Number.isFinite(item.ratePercent)) {
        total.multiplier *= 1 + item.ratePercent / 100;
        total.ratedMonths += 1;
      }
      taggedReturnTotals.set(item.tag, total);
    });
  });
  const tagReturnStats = Array.from(taggedReturnTotals.entries())
    .map(([tag, total]) => ({
      tag,
      result: total.result,
      ratePercent: total.ratedMonths > 0 ? (total.multiplier - 1) * 100 : null,
      monthly: total.monthly
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
    ...(!cashFlowEnabled ? [{
      label: 'Organic flow',
      value: Math.round(periodOrganicDelta),
      suffix: baseCurrency,
      help: `Sum of balance amount changes across the selected range, valued in ${baseCurrency} at each current snapshot's rates. This is deposits, withdrawals, returns, and manual balance changes.`
    }] : []),
    {
      label: 'FX impact',
      value: Math.round(periodFxImpactDelta),
      suffix: baseCurrency,
      help: `Estimated change caused by exchange-rate movement. Previous currency balances are revalued with current rates and compared with their previous-rate value.`
    }
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
    const lastClick = lastLegendClickRef.current;
    const isDoubleClick = lastClick && lastClick.group === group && lastClick.key === clickedKey && (now - lastClick.time < LEGEND_DOUBLE_CLICK_WINDOW_MS);
    lastLegendClickRef.current = { group, key: clickedKey, time: now };

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
        currencyDistributionData={currencyDistributionData}
        currencyRatesData={currencyRatesData}
        cashFlowMonthlyData={cashFlowMonthlyData}
        cashFlowEventsData={cashFlowEventsData}
        decompositionData={decompositionData}
        hiddenSeries={hiddenSeries}
        netWorthData={netWorthData}
        orgTrendData={orgTrendData}
        organizationCurrencyBreakdown={organizationCurrencyBreakdown}
        organizationCurrencyMonth={latestSnapshot?.month}
        summaryStats={summaryStats}
        tagDistributionData={tagDistributionData}
        tagReturnCoverage={{ assigned: assignedExternalEntries, total: totalExternalEntries, proportional: proportionallyAllocatedEntries }}
        tagReturnStats={tagReturnStats}
        uxMetricsData={uxMetricsData}
        formatCompact={formatCompact}
        formatFriendlyTime={formatFriendlyTime}
        handleLegendClickSmart={handleLegendClickSmart}
      />
    </div>
  );
}
