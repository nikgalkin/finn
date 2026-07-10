import { Calendar, Plus, RefreshCw } from 'lucide-react';
import type { AppSettings, SnapshotData } from '../../types';

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
    <div className="glass-panel mb-8 p-6" style={{ display: 'flex', gap: '32px', alignItems: 'stretch' }}>
      <div style={{ flex: '0 0 180px', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-center mb-4" style={{ height: '40px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Period</h3>
        </div>
        <div style={{ flex: 0.5, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div className="text-xs text-[var(--text-secondary)] mb-2 font-medium text-center">Month (YYYY-MM)</div>
          <input
            className="input w-full text-center"
            value={currentMonth}
            onChange={event => onMonthChange(event.target.value)}
            placeholder="YYYY-MM"
            style={{ textAlign: 'center' }}
          />
        </div>
      </div>

      <div style={{ width: '1px', background: 'rgba(255,255,255,0.05)' }}></div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="flex justify-between items-center mb-4" style={{ height: '40px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            Exchange Rates (to {settings.baseCurrency || 'RUB'})
          </h3>
          <div className="flex gap-2">
            <button className="btn" onClick={onFetchLatestRates} disabled={fetchingRates !== null}>
              <RefreshCw size={16} className={`mr-2 ${fetchingRates === 'latest' ? 'animate-spin' : ''}`} />
              {fetchingRates === 'latest' ? 'Fetching...' : 'Fetch Latest'}
            </button>
            <button
              className="btn"
              onClick={onFetchPeriodStartRates}
              disabled={fetchingRates !== null}
              title={`Fetch exchange rates for ${currentMonth || 'YYYY-MM'}-01`}
            >
              <Calendar size={16} className="mr-2" />
              {fetchingRates === 'periodStart' ? 'Fetching...' : 'Fetch on 1st'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', flex: 1, alignContent: 'flex-start' }}>
          {Object.entries(rates).map(([currency, rate]) => (
            <div key={currency} style={{ flex: '1 1 100px', minWidth: '100px', maxWidth: '150px' }}>
              <div className="text-xs text-[var(--text-secondary)] mb-1 font-medium">{currency}</div>
              <input
                type="number"
                className="input w-full"
                value={rate === 0 ? '' : rate}
                placeholder="0"
                onWheel={event => (event.target as HTMLInputElement).blur()}
                onChange={event => {
                  const val = event.target.value;
                  onRateChange(currency, val === '' ? 0 : (val.endsWith('.') ? val : parseFloat(val)));
                }}
              />
            </div>
          ))}

          <div style={{ flex: '1 1 100px', minWidth: '100px', maxWidth: '150px' }}>
            <div className="text-xs mb-1 font-medium opacity-0"></div>
            <button className="btn w-full justify-center" style={{ height: '42px' }} onClick={onAddRate}>
              <Plus size={16} className="mr-1" /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
