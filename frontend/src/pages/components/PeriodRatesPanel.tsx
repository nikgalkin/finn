import { useEffect, useState } from 'react';
import { Calendar, Plus, RefreshCw } from 'lucide-react';
import type { AppSettings, SnapshotData } from '../../types';
import { formatExchangeRate } from '../../lib/format';
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

const toExchangeRateNumber = (value: number | string) => {
  if (typeof value === 'number') return value;
  const normalized = value.trim().replace(/\s+/g, '').replace(',', '.');
  return normalized ? Number(normalized) : 0;
};

const formatRateInput = (value: number) => {
  if (value === 0 || !Number.isFinite(value)) return '';
  const displayedValue = value > 0 && value < 1 ? 1 / value : value;
  return formatExchangeRate(displayedValue, false);
};

const parseExchangeRate = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : value;
};

type ExchangeRateInputProps = {
  currency: string;
  referenceCurrency: string;
  value: number | string;
  onChange: (value: number | string) => void;
};

function ExchangeRateInput({ currency, referenceCurrency, value, onChange }: ExchangeRateInputProps) {
  const numericValue = toExchangeRateNumber(value);
  const inverted = Number.isFinite(numericValue) && numericValue > 0 && numericValue < 1;
  const formattedValue = formatRateInput(numericValue);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState(formattedValue);

  useEffect(() => {
    if (!editing) setDraft(formattedValue);
  }, [editing, formattedValue]);

  const commit = (rawValue: string) => {
    setEditing(false);
    if (!dirty) {
      setDraft(formattedValue);
      return;
    }

    const parsed = parseExchangeRate(rawValue);
    if (typeof parsed !== 'number') {
      setDraft(formattedValue);
      return;
    }

    const storedValue = inverted && parsed > 0 ? 1 / parsed : parsed;
    onChange(storedValue);
    setDraft(formatRateInput(storedValue));
  };

  const preciseValue = Number.isFinite(numericValue)
    ? new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 20 }).format(numericValue)
    : String(value);

  return (
    <input
      id={`snapshot-exchange-rate-${currency}`}
      name={`snapshot-exchange-rate-${currency}`}
      type="text"
      inputMode="decimal"
      className="input"
      value={draft}
      onFocus={() => {
        setEditing(true);
        setDirty(false);
      }}
      onChange={event => {
        setDirty(true);
        setDraft(event.target.value);
      }}
      onBlur={event => commit(event.target.value)}
      onKeyDown={event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.currentTarget.blur();
      }}
      aria-label={`${currency} exchange rate`}
      placeholder="0"
      title={inverted
        ? `Displayed as 1 ${referenceCurrency} in ${currency}. Stored rate: ${preciseValue}`
        : `Stored rate: ${preciseValue}`}
    />
  );
}

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
  const baseCurrency = (settings.baseCurrency || 'RUB').toUpperCase();

  return (
    <section className="glass-panel snapshot-period-panel" aria-label="Snapshot period and exchange rates">
      <div className="snapshot-period-column">
        <div className="snapshot-panel-heading">
          <span className="snapshot-panel-icon" aria-hidden="true"><Calendar size={17} /></span>
          <div>
            <small>Snapshot date</small>
            <h3>Period</h3>
          </div>
        </div>
        <label className="snapshot-period-field" htmlFor="snapshot-month">
          <span>Month</span>
          <input
            id="snapshot-month"
            name="snapshot-month"
            className="input w-full text-center cash-flow-month-input"
            type="month"
            value={currentMonth}
            onChange={event => onMonthChange(event.target.value)}
            aria-label="Snapshot month"
          />
        </label>
      </div>

      <div className="snapshot-period-divider" />

      <div className="snapshot-rates-column">
        <div className="snapshot-rates-heading">
          <div className="snapshot-panel-heading">
            <span className="snapshot-panel-icon" aria-hidden="true"><RefreshCw size={17} /></span>
            <div>
              <small>Reference currency</small>
              <h3>Exchange Rates <span>to {settings.baseCurrency || 'RUB'}</span></h3>
            </div>
          </div>
          <div className="snapshot-rates-actions">
            <button className="btn" onClick={onFetchLatestRates} disabled={fetchingRates !== null}>
              {fetchingRates === 'latest' ? <Spinner label="Fetching latest rates" size={15} /> : <RefreshCw size={15} />}
              Fetch Latest
            </button>
            <button
              className="btn"
              onClick={onFetchPeriodStartRates}
              disabled={fetchingRates !== null}
              title={`Fetch exchange rates for ${currentMonth || 'YYYY-MM'}-01`}
            >
              {fetchingRates === 'periodStart' ? <Spinner label="Fetching rates for period start" size={15} /> : <Calendar size={15} />}
              Fetch on 1st
            </button>
            <button className="btn snapshot-rate-add" onClick={onAddRate}>
              <Plus size={16} /> Add
            </button>
          </div>
        </div>

        <div className="snapshot-rates-grid">
          {Object.entries(rates)
            .filter(([currency]) => currency.toUpperCase() !== baseCurrency)
            .map(([currency, rate]) => (
              <div className="snapshot-rate-field" key={currency}>
                <div className="snapshot-rate-label">
                  <span>{currency}</span>
                  {toExchangeRateNumber(rate) > 0 && toExchangeRateNumber(rate) < 1 && (
                    <small style={{ color: '#60a5fa', fontSize: '9px', fontWeight: 700 }}>{baseCurrency} → {currency}</small>
                  )}
                </div>
                <ExchangeRateInput
                  currency={currency}
                  referenceCurrency={baseCurrency}
                  value={rate}
                  onChange={value => onRateChange(currency, value)}
                />
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
