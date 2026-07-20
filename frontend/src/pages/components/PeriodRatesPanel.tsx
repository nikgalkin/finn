import { Calendar, Plus, RefreshCw } from 'lucide-react';
import type { AppSettings, SnapshotData } from '../../types';
import { AmountInput } from './AmountInput';
import { Spinner } from './PageLoader';

type PeriodRatesPanelProps = {
  currentMonth: string;
  rates: SnapshotData['rates'];
  settings: AppSettings;
  fetchingRates: 'latest' | 'periodStart' | null;
  onAddRate: () => void;
  onFetchLatestRates: () => void;
  onFetchPeriodStartRates: () => void;
  onMonthChange: (month: string) => void;
  onRateChange: (currency: string, value: string | number) => void;
};

export function PeriodRatesPanel({
  currentMonth,
  rates,
  settings,
  fetchingRates,
  onAddRate,
  onFetchLatestRates,
  onFetchPeriodStartRates,
  onMonthChange,
  onRateChange
}: PeriodRatesPanelProps) {
  return (
    <div className="glass-panel mb-4" style={{ display: 'flex', gap: '24px', alignItems: 'stretch', padding: '16px 18px' }}>
      <div style={{ flex: '0 0 160px', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-center mb-2" style={{ height: '32px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Period</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div className="text-xs text-[var(--text-secondary)] mb-1 font-medium text-center">Month</div>
          <input
            className="input w-full text-center cash-flow-month-input"
            type="month"
            value={currentMonth}
            onChange={event => onMonthChange(event.target.value)}
            aria-label="Snapshot month"
            style={{ textAlign: 'center', height: '36px' }}
          />
        </div>
      </div>

      <div style={{ width: '1px', background: 'rgba(255,255,255,0.05)' }}></div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="flex justify-between items-center mb-2" style={{ height: '32px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            Exchange Rates (to {settings.baseCurrency || 'RUB'})
          </h3>
          <div className="flex gap-2">
            <button className="btn" style={{ padding: '6px 10px', fontSize: '13px' }} onClick={onFetchLatestRates} disabled={fetchingRates !== null}>
              {fetchingRates === 'latest' ? <Spinner label="Fetching latest rates" size={15} /> : <RefreshCw size={15} />}
              Fetch Latest
            </button>
            <button
              className="btn"
              onClick={onFetchPeriodStartRates}
              disabled={fetchingRates !== null}
              title={`Fetch exchange rates for ${currentMonth || 'YYYY-MM'}-01`}
              style={{ padding: '6px 10px', fontSize: '13px' }}
            >
              {fetchingRates === 'periodStart' ? <Spinner label="Fetching rates for period start" size={15} /> : <Calendar size={15} />}
              Fetch on 1st
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', flex: 1, alignContent: 'flex-start' }}>
          {Object.entries(rates).map(([currency, rate]) => (
            <div key={currency} style={{ flex: '1 1 100px', minWidth: '100px', maxWidth: '150px' }}>
              <div className="text-xs text-[var(--text-secondary)] mb-1 font-medium">{currency}</div>
              <AmountInput
                value={rate}
                onChange={value => onRateChange(currency, value)}
                maximumFractionDigits={8}
                ariaLabel={`${currency} exchange rate`}
              />
            </div>
          ))}

          <div style={{ flex: '1 1 100px', minWidth: '100px', maxWidth: '150px' }}>
            <div className="text-xs mb-1 font-medium" aria-hidden="true" style={{ visibility: 'hidden' }}>Action</div>
            <button className="btn w-full justify-center" style={{ height: '36px', padding: '6px 10px' }} onClick={onAddRate}>
              <Plus size={16} className="mr-1" /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
