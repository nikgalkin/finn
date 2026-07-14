import { useState } from 'react';
import { SearchableSelect } from './graphs/SearchableSelect';

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

type TimeframeControlProps = {
  availableMonths: string[];
  startMonth: string;
  endMonth: string;
  onChange: (startMonth: string, endMonth: string) => void;
};

export function TimeframeControl({ availableMonths, startMonth, endMonth, onChange }: TimeframeControlProps) {
  const [quickPeriod, setQuickPeriod] = useState('all');

  const handleQuickPeriod = (period: string) => {
    if (availableMonths.length === 0) return;

    const firstMonth = availableMonths[0];
    const latestMonth = availableMonths[availableMonths.length - 1];
    setQuickPeriod(period);

    if (period === 'all') {
      onChange(firstMonth, latestMonth);
      return;
    }

    const [year, month] = latestMonth.split('-').map(Number);
    const date = period === 'ytd'
      ? new Date(year, 0, 1)
      : new Date(year, month - Number(period), 1);
    const computedStart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    onChange(computedStart < firstMonth ? firstMonth : computedStart, latestMonth);
  };

  const selectedQuickPeriodLabel = QUICK_PERIODS.find(([value]) => value === quickPeriod)?.[1] || 'Custom';

  return (
    <div className="timeframe-control">
      <span>Timeframe:</span>
      <SearchableSelect
        value={selectedQuickPeriodLabel}
        onChange={label => {
          const period = QUICK_PERIODS.find(([, periodLabel]) => periodLabel === label)?.[0];
          if (period) handleQuickPeriod(period);
        }}
        options={QUICK_PERIOD_LABELS}
        placeholder="Period"
        showSearch={false}
        width="84px"
        dropdownWidth="96px"
        portal
        portalZIndex={200000}
      />
      <SearchableSelect
        value={startMonth}
        onChange={value => {
          setQuickPeriod('custom');
          onChange(value, endMonth && endMonth < value ? value : endMonth);
        }}
        options={availableMonths}
        placeholder="Start"
        portal
        portalZIndex={200000}
      />
      <span className="timeframe-control-arrow">➔</span>
      <SearchableSelect
        value={endMonth}
        onChange={value => {
          setQuickPeriod('custom');
          onChange(startMonth, value);
        }}
        options={availableMonths.filter(month => !startMonth || month >= startMonth)}
        placeholder="End"
        portal
        portalZIndex={200000}
      />
    </div>
  );
}
