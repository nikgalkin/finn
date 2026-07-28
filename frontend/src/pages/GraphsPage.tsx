import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye } from 'lucide-react';
import type { ParsedSnapshot } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useSnapshots } from '../hooks/useSnapshots';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { calculateEstimatedCapitalReturn, calculateFlowDecomposition, calculateNetExternalFlow, calculateSnapshotTotalAtRates, calculateTaggedCapitalReturns, calculateTotals, convertAmount, monthsBetween, type TaggedReturnKind } from '../lib/finance';
import { isTextInputTarget } from '../lib/hotkeys';
import { useFlowEntries } from '../hooks/useFlowEntries';
import { GraphsAnalyticsSections, type HiddenLegendSeries, type LegendGroup } from './components/graphs/GraphsAnalyticsSections';
import { PageLoader } from './components/PageLoader';
import { SnapshotDiffModal } from './components/SnapshotDiffModal';
import { StickyPageHeader } from './components/StickyPageHeader';
import { TimeframeControl } from './components/TimeframeControl';
import { useSnapshotDiffHistory } from './hooks/useSnapshotDiffHistory';

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
  const baseCurrency = settings.baseCurrency || 'RUB';
  const { snapshots, loading } = useSnapshots({ sort: 'asc', baseCurrency });
  const cashFlowEnabled = Boolean(settings.cashFlow?.enabled);
  const { entries: flowEntries, error: flowError, loading: flowLoading } = useFlowEntries(cashFlowEnabled);
  const diffHistory = useSnapshotDiffHistory('graphs-diff', snapshots);
  const diffModalData = diffHistory.data;
  useEscapeToDashboard({ blocked: Boolean(diffModalData) });

  const [hiddenSeries, setHiddenSeries] = useState<HiddenLegendSeries>({
    currencies: {},
    organizations: {},
    tags: { untagged: true }
  });
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const lastLegendClickRef = useRef<{ group: LegendGroup; key: string; time: number } | null>(null);

  useEffect(() => {
    if (!diffModalData) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTextInputTarget(event.target)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        diffHistory.close();
      } else if (event.code === 'KeyD') {
        event.preventDefault();
        diffHistory.toggleOnlyChanges();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [diffHistory, diffModalData]);

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
  const handleOpenSnapshotDiff = (month: string) => {
    const snapshotIndex = snapshots.findIndex(snapshot => snapshot.month === month);
    if (snapshotIndex < 0) return;
    diffHistory.open(
      snapshots[snapshotIndex],
      snapshotIndex > 0 ? snapshots[snapshotIndex - 1] : null
    );
  };

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

  const previousSnapshotByMonth = useMemo(() => new Map(
    snapshots.map((snapshot, index) => [snapshot.month, index > 0 ? snapshots[index - 1] : null])
  ), [snapshots]);

  const netWorthData = filteredSnapshots.map(snapshot => {
    const previousSnapshot = previousSnapshotByMonth.get(snapshot.month) || null;
    const total = getSnapshotTotalBase(snapshot);
    const previousTotal = previousSnapshot ? getSnapshotTotalBase(previousSnapshot) : total;

    return {
      month: snapshot.month,
      total: Math.round(total),
      delta: Math.round(total - previousTotal)
    };
  });

  const decompositionData: Record<string, any>[] = filteredSnapshots.map(snapshot => {
    const previousSnapshot = previousSnapshotByMonth.get(snapshot.month) || null;
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
        returnRatePercent: estimated.ratePercent,
        openingCapital: previousCapital,
        recordedMovements: monthEntries.length,
        elapsedMonths: Math.max(1, monthsBetween(previousSnapshot.month, snapshot.month))
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
  // Analytics is driven by snapshots, so movements recorded for a month that was
  // never snapshotted silently reach no chart at all.
  const monthsWithoutSnapshot = Array.from(new Set(flowEntries
    .filter(entry => entry.entryType !== 'transfer')
    .filter(entry => (!startMonth || entry.month >= startMonth) && (!effectiveEndMonth || entry.month <= effectiveEndMonth))
    .filter(entry => !snapshotsByMonth.has(entry.month))
    .map(entry => entry.month))).sort();
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
  const periodBaselineSnapshot = firstSnapshot
    ? previousSnapshotByMonth.get(firstSnapshot.month) || firstSnapshot
    : null;
  const startTotal = periodBaselineSnapshot ? getSnapshotTotalBase(periodBaselineSnapshot) : 0;
  const periodDelta = latestSnapshot && firstSnapshot ? currentTotal - startTotal : 0;
  const periodOrganicDelta = decompositionData.reduce((total, point) => total + Number(point['Organic flow'] || 0), 0);
  const periodExternalFlow = decompositionData.reduce((total, point) => total + Number(point['External flow'] || 0), 0);
  const periodEstimatedReturn = decompositionData.reduce((total, point) => total + Number(point['Capital earnings'] || 0), 0);
  const periodReturnMultiplier = decompositionData.reduce((multiplier, point) => {
    const rate = point.returnRatePercent;
    return typeof rate === 'number' && Number.isFinite(rate) ? multiplier * (1 + rate / 100) : multiplier;
  }, 1);
  const periodFxImpactDelta = decompositionData.reduce((total, point) => total + Number(point['FX Impact'] || 0), 0);
  const capitalReturnMonths = decompositionData
    .filter(point => point.openingCapital !== undefined)
    .map(point => ({
      month: String(point.month),
      openingCapital: Number(point.openingCapital || 0),
      externalFlow: Number(point['External flow'] || 0),
      result: Number(point['Capital earnings'] || 0),
      ratePercent: typeof point.returnRatePercent === 'number' ? point.returnRatePercent : null,
      recordedMovements: Number(point.recordedMovements || 0),
      elapsedMonths: Number(point.elapsedMonths || 1)
    }));
  const ratedMonths = capitalReturnMonths.filter(month => month.ratePercent !== null);
  // A snapshot measures the whole gap since the previous one, so a skipped month
  // must not be annualized as if it were a single month of return.
  const ratedMonthSpan = ratedMonths.reduce((total, month) => total + month.elapsedMonths, 0);
  const periodRatePercent = (periodReturnMultiplier - 1) * 100;
  const annualizedRatePercent = ratedMonths.length >= 2 && ratedMonthSpan !== 12 && ratedMonthSpan > 0 && periodReturnMultiplier > 0
    ? (Math.pow(periodReturnMultiplier, 12 / ratedMonthSpan) - 1) * 100
    : null;
  const monthsWithoutRecordedFlow = capitalReturnMonths.filter(month => month.recordedMovements === 0).length;
  const taggedReturnTotals = new Map<string, {
    result: number;
    multiplier: number;
    ratedMonths: number;
    kind: TaggedReturnKind;
    monthly: Array<{ month: string; openingCapital: number; closingCapital: number; assignedFlow: number; result: number; ratePercent: number | null }>;
  }>();
  let assignedExternalEntries = 0;
  let totalExternalEntries = 0;
  let proportionallyAllocatedEntries = 0;
  let unattributedFlow = 0;
  const unknownFlowAccounts = new Set<string>();
  filteredSnapshots.forEach(snapshot => {
    const previousSnapshot = previousSnapshotByMonth.get(snapshot.month);
    if (!cashFlowEnabled || !previousSnapshot) return;
    const monthEntries = flowEntries.filter(entry => entry.month === snapshot.month);
    const breakdown = calculateTaggedCapitalReturns(snapshot, previousSnapshot, monthEntries, baseCurrency, settings.nonYieldingTags || []);
    assignedExternalEntries += breakdown.assignedExternalEntries;
    totalExternalEntries += breakdown.totalExternalEntries;
    proportionallyAllocatedEntries += breakdown.proportionallyAllocatedEntries;
    unattributedFlow += breakdown.unattributedFlow;
    breakdown.unknownAccounts.forEach(account => unknownFlowAccounts.add(account));
    breakdown.returns.forEach(item => {
      const total = taggedReturnTotals.get(item.tag) || { result: 0, multiplier: 1, ratedMonths: 0, kind: item.kind, monthly: [] };
      total.result += item.result;
      total.monthly.push({
        month: snapshot.month,
        openingCapital: item.openingCapital,
        closingCapital: item.closingCapital,
        assignedFlow: item.assignedFlow,
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
      kind: total.kind,
      result: total.result,
      ratePercent: total.kind === 'spending' || total.ratedMonths === 0 ? null : (total.multiplier - 1) * 100,
      monthly: total.monthly
    }))
    .filter(item => Math.abs(item.result) >= 0.01 || item.ratePercent !== null)
    .sort((left, right) => Math.abs(right.result) - Math.abs(left.result));
  const nonYieldingResult = tagReturnStats
    .filter(item => item.kind === 'spending')
    .reduce((total, item) => total + item.result, 0);
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
      help: `Change across every month in the selected range, measured from the snapshot before the range starts. Percent is this change divided by that starting total.`
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

  const handleLegendClickSmart = useCallback((group: LegendGroup, event: any, allKeys: string[]) => {
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
  }, []);

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
      <StickyPageHeader marginBottom="0" compactTop>
        <div className="flex items-center gap-4">
          <Link to="/" title="Back to dashboard" className="btn"><ArrowLeft size={18} /></Link>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Portfolio Analytics</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
              {filteredSnapshots.length} {filteredSnapshots.length === 1 ? 'snapshot' : 'snapshots'} · valued in {baseCurrency}
            </div>
          </div>
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
          ratePercent: periodRatePercent,
          annualizedRatePercent,
          fxImpact: periodFxImpactDelta,
          nonYieldingResult,
          monthsWithoutRecordedFlow,
          monthly: capitalReturnMonths
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
        tagReturnCoverage={{
          assigned: assignedExternalEntries,
          total: totalExternalEntries,
          proportional: proportionallyAllocatedEntries,
          unattributedFlow,
          unknownAccounts: Array.from(unknownFlowAccounts),
          monthsWithoutSnapshot
        }}
        tagReturnStats={tagReturnStats}
        uxMetricsData={uxMetricsData}
        handleLegendClickSmart={handleLegendClickSmart}
        onOpenSnapshotDiff={handleOpenSnapshotDiff}
      />

      {diffModalData && (
        <SnapshotDiffModal
          current={diffModalData.current}
          previous={diffModalData.previous}
          snapshots={snapshots}
          cashFlowEnabled={cashFlowEnabled}
          flowEntries={flowEntries}
          onlyChanges={diffHistory.onlyChanges}
          onOnlyChangesChange={diffHistory.setOnlyChanges}
          scrollTop={diffHistory.scrollTop}
          onScrollTopChange={diffHistory.persistScrollTop}
          onPeriodChange={diffHistory.setPeriod}
          onClose={diffHistory.close}
        />
      )}
    </div>
  );
}
