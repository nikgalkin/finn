import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type MouseEvent } from 'react';
import { adjacentFieldIndex } from '../../lib/fieldNavigation';
import { normalizeNumberExpressionInput, parseNumberExpression } from '../../lib/numberExpression';

type AmountInputProps = {
  value: number | string;
  onChange: (value: number | string) => void;
  maximumFractionDigits?: number;
  required?: boolean;
  ariaLabel?: string;
  id?: string;
  name?: string;
  navigationGroup?: string;
};

export function AmountFieldHelp() {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: '8px' }}>Amount field capabilities</div>
      <div style={{ marginBottom: '8px' }}>
        The value is calculated when you press Enter or leave the field. In the snapshot editor, Enter moves to the next Amount field and Shift+Enter moves to the previous one.
      </div>
      <div style={{ marginBottom: '4px', fontWeight: 700 }}>Basic math</div>
      <div style={{ marginBottom: '8px' }}>
        Use +, -, *, / and parentheses. Examples: 1200 + 350, (100 + 20) * 3, -500.
      </div>
      <div style={{ marginBottom: '4px', fontWeight: 700 }}>Number shortcuts</div>
      <div style={{ marginBottom: '8px' }}>
        Thousands are grouped with spaces. Both 1.5 and 1,5 are accepted as decimals.{`\n\n`}
        k = 3 zeros (1k = 1 000){'\n'}
        kk or m = 6 zeros (1kk = 1m = 1 000 000){'\n'}
        b = 9 zeros (1b = 1 000 000 000){'\n'}
        mm = 12 zeros (1mm = 1 000 000 000 000){'\n\n'}
        Shortcuts are case-insensitive and work inside expressions, for example 1m + 250k or 1,5k * 2.
      </div>
      <div style={{ marginBottom: '4px', fontWeight: 700 }}>Accepted characters</div>
      <div style={{ marginBottom: '8px' }}>
        The field takes digits, spaces, + - * / ( ) . , % and the shortcut letters. Anything else is refused as you type. A shortcut typed in Cyrillic still counts: к, м and б after a digit are read as k, m and b, and so are the л, ь and и those keys produce when the layout is still switched.
      </div>
      <div style={{ marginBottom: '4px', fontWeight: 700 }}>One month of annual interest</div>
      <div>
        Add or subtract a trailing annual rate with %. Example: 100 + 12% = 101, calculated as 100 + (100 × 12% ÷ 12). The shortcut always applies one month of interest to the expression before it.
      </div>
    </div>
  );
}

const formatAmount = (amount: number | string, maximumFractionDigits: number): string => {
  if (amount === 0) return '';
  const numericAmount = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numericAmount)) return String(amount);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(numericAmount).replace(/,/g, ' ');
};

const editingAmount = (amount: number | string, maximumFractionDigits: number) => {
  if (amount === 0) return '';
  if (typeof amount === 'string') return amount;
  return new Intl.NumberFormat('en-US', {
    useGrouping: false,
    maximumFractionDigits
  }).format(amount);
};

export function AmountInput({
  value,
  onChange,
  maximumFractionDigits = 2,
  required = false,
  ariaLabel = 'Amount',
  id,
  name,
  navigationGroup
}: AmountInputProps) {
  const generatedId = `amount-${useId()}`;
  const inputId = id || generatedId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => formatAmount(value, maximumFractionDigits));
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(formatAmount(value, maximumFractionDigits));
      const empty = typeof value === 'string' && value.trim() === '';
      setInvalid(!empty && parseNumberExpression(value) === null);
    }
  }, [editing, maximumFractionDigits, value]);

  // Rejected characters shorten the value under the caret, so the caret is put
  // back where the accepted text ends instead of jumping to the end of the field.
  useLayoutEffect(() => {
    if (caretRef.current === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  }, [draft]);

  const handleChange = (input: HTMLInputElement) => {
    const normalized = normalizeNumberExpressionInput(input.value);
    if (normalized === null) {
      input.value = draft;
      const caret = Math.min(input.selectionStart ?? draft.length, draft.length);
      input.setSelectionRange(caret, caret);
      return;
    }

    const normalizedPrefix = normalizeNumberExpressionInput(
      input.value.slice(0, input.selectionStart ?? input.value.length)
    );
    const caret = normalizedPrefix?.length ?? Math.min(input.selectionStart ?? draft.length, draft.length);
    setInvalid(false);

    if (normalized === draft) {
      input.value = normalized;
      input.setSelectionRange(caret, caret);
      return;
    }

    caretRef.current = caret;
    setDraft(normalized);
    onChange(normalized);
  };

  const commitValue = (rawValue: string) => {
    const committed = rawValue.trim() === '' ? 0 : parseNumberExpression(rawValue);
    setEditing(false);
    if (committed === null) {
      setInvalid(true);
      setDraft(rawValue);
      return;
    }

    setInvalid(false);
    setDraft(formatAmount(committed, maximumFractionDigits));
    onChange(committed);
  };

  const moveCaretToEnd = (input: HTMLInputElement) => {
    input.setSelectionRange(input.value.length, input.value.length);
  };

  // Amounts are appended to far more often than they are edited in the middle,
  // so a click anywhere in the field starts typing after the last character.
  const handleMouseDown = (event: MouseEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (document.activeElement === input) return;

    event.preventDefault();
    input.focus();
  };

  const handleCopy = (event: ClipboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selectionStart = input.selectionStart;
    const selectionEnd = input.selectionEnd;
    if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) return;

    event.preventDefault();
    event.clipboardData.setData('text/plain', input.value.slice(selectionStart, selectionEnd).replace(/\s/g, ''));
  };

  const navigateToAdjacentAmount = (input: HTMLInputElement, direction: 1 | -1) => {
    if (!navigationGroup) return;
    requestAnimationFrame(() => {
      const fields = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-amount-navigation]'))
        .filter(field => (
          field.dataset.amountNavigation === navigationGroup
          && !field.disabled
          && field.getClientRects().length > 0
        ));
      const currentIndex = fields.indexOf(input);
      const nextIndex = adjacentFieldIndex(currentIndex, fields.length, direction);
      if (nextIndex === null) return;

      const nextField = fields[nextIndex];
      const wrapped = fields.length > 1 && (direction === 1
        ? nextIndex <= currentIndex
        : nextIndex >= currentIndex);
      nextField?.focus({ preventScroll: wrapped });
      if (wrapped) {
        nextField?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  };

  return (
    <input
      ref={inputRef}
      id={inputId}
      name={name || inputId}
      type="text"
      inputMode="decimal"
      className="input"
      data-amount-navigation={navigationGroup}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      value={draft}
      placeholder="0"
      required={required}
      onMouseDown={handleMouseDown}
      onFocus={event => {
        const exactValue = editingAmount(value, maximumFractionDigits);
        setEditing(true);
        setInvalid(false);
        setDraft(exactValue);
        caretRef.current = exactValue.length;
        moveCaretToEnd(event.currentTarget);
      }}
      onChange={event => handleChange(event.target)}
      onCopy={handleCopy}
      onBlur={event => commitValue(event.target.value)}
      onKeyDown={event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const input = event.currentTarget;
        const canNavigate = input.value.trim() === '' || parseNumberExpression(input.value) !== null;
        input.blur();
        if (canNavigate) navigateToAdjacentAmount(input, event.shiftKey ? -1 : 1);
      }}
    />
  );
}
