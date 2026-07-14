import { useEffect, useState } from 'react';
import { evaluateNumberExpression } from '../../lib/numberExpression';

type AmountInputProps = {
  value: number | string;
  onChange: (value: number | string) => void;
  maximumFractionDigits?: number;
  required?: boolean;
  ariaLabel?: string;
};

export function AmountFieldHelp() {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: '8px' }}>Amount field capabilities</div>
      <div style={{ marginBottom: '8px' }}>
        The value is calculated when you press Enter or leave the field.
      </div>
      <div style={{ marginBottom: '4px', fontWeight: 700 }}>Basic math</div>
      <div style={{ marginBottom: '8px' }}>
        Use +, -, *, / and parentheses. Examples: 1200 + 350, (100 + 20) * 3, -500.
      </div>
      <div style={{ marginBottom: '4px', fontWeight: 700 }}>Number shortcuts</div>
      <div>
        k = 3 zeros (1k = 1,000){'\n'}
        kk or m = 6 zeros (1kk = 1m = 1,000,000){'\n'}
        b = 9 zeros (1b = 1,000,000,000){'\n'}
        mm = 12 zeros (1mm = 1,000,000,000,000){'\n\n'}
        Shortcuts are case-insensitive and work inside expressions, for example 1m + 250k or 1.5k * 2.
      </div>
    </div>
  );
}

const formatAmount = (amount: number | string, maximumFractionDigits: number) => {
  if (amount === 0) return '';
  const numericAmount = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numericAmount)) return amount;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(numericAmount);
};

const rawAmount = (amount: number | string) => amount === 0 ? '' : String(amount);

export function AmountInput({
  value,
  onChange,
  maximumFractionDigits = 2,
  required = false,
  ariaLabel = 'Amount'
}: AmountInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => rawAmount(value));

  useEffect(() => {
    if (!editing) setDraft(rawAmount(value));
  }, [editing, value]);

  const commitValue = (rawValue: string) => {
    const committed = evaluateNumberExpression(rawValue);
    setEditing(false);
    setDraft(rawAmount(committed));
    onChange(committed);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className="input"
      aria-label={ariaLabel}
      value={editing ? draft : formatAmount(value, maximumFractionDigits)}
      placeholder="0"
      required={required}
      onFocus={() => {
        setDraft(rawAmount(value));
        setEditing(true);
      }}
      onChange={event => {
        setDraft(event.target.value);
        onChange(event.target.value);
      }}
      onBlur={event => commitValue(event.target.value)}
      onKeyDown={event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        (event.target as HTMLInputElement).blur();
      }}
    />
  );
}
