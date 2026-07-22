import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowRightLeft, ArrowUp, Copy, MessageSquare, Plus, Save, Trash2, X } from 'lucide-react';
import type { AppSettings, FlowDirection, FlowEntry, FlowEntryType } from '../../types';
import type { FlowPeriodSeed } from '../../lib/cashFlow';
import { AmountFieldHelp, AmountInput } from './AmountInput';
import { HelpTooltip } from './HelpTooltip';
import { Spinner } from './PageLoader';
import { QuickHoverTooltip } from './QuickHoverTooltip';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';
import { CommentModal } from './SnapshotCommentModal';
import { SearchableSelect } from './graphs/SearchableSelect';

export type FlowPeriodDraft = {
  clientID: string;
  id?: number;
  entryType: FlowEntryType;
  direction: FlowDirection;
  counterparty: string;
  account: string;
  currency: string;
  amount: number | string;
  taxRate: number | string;
  category: string;
  comment: string;
  toAccount: string;
  toCurrency: string;
  toAmount: number | string;
};

type FlowPeriodModalProps = {
  month: string;
  entries: FlowEntry[];
  seedEntries?: FlowPeriodSeed[];
  categorySuggestions?: string[];
  settings: AppSettings;
  appendBlank?: boolean;
  focusEntryID?: number;
  lockMonth?: boolean;
  copyPreviousEntries?: FlowPeriodSeed[];
  saving: boolean;
  error: string;
  onMonthChange: (month: string) => void;
  onClose: () => void;
  onSave: (drafts: FlowPeriodDraft[]) => void;
};

const NO_CATEGORY_OPTION = '— No category —';
const NO_ACCOUNT_OPTION = '— Not assigned —';

const draftID = () => globalThis.crypto?.randomUUID?.() || `flow-${Date.now()}-${Math.random()}`;

const emptyDraft = (currency: string): FlowPeriodDraft => ({
  clientID: draftID(),
  entryType: 'external',
  direction: 'in',
  counterparty: '',
  account: '',
  currency,
  amount: '',
  taxRate: 0,
  category: '',
  comment: '',
  toAccount: '',
  toCurrency: currency,
  toAmount: ''
});

const entryToDraft = (entry: FlowEntry): FlowPeriodDraft => ({
  clientID: `entry-${entry.id}`,
  id: entry.id,
  entryType: entry.entryType || 'external',
  direction: entry.direction,
  counterparty: entry.counterparty,
  account: entry.account || '',
  currency: entry.currency,
  amount: String(entry.amount),
  taxRate: entry.taxRate || 0,
  category: entry.category,
  comment: entry.comment,
  toAccount: entry.toAccount || '',
  toCurrency: entry.toCurrency || entry.currency,
  toAmount: entry.toAmount ? String(entry.toAmount) : ''
});

const seedToDraft = (entry: FlowPeriodSeed): FlowPeriodDraft => ({
  ...entry,
  clientID: draftID(),
  amount: String(entry.amount),
  taxRate: entry.taxRate || 0,
  toAmount: entry.toAmount ? String(entry.toAmount) : ''
});

const isUntouchedBlankDraft = (draft: FlowPeriodDraft, currency: string) => (
  !draft.id
  && draft.entryType === 'external'
  && draft.direction === 'in'
  && !draft.counterparty
  && !draft.account
  && draft.currency === currency
  && draft.amount === ''
  && Number(draft.taxRate) === 0
  && !draft.category
  && !draft.comment
  && !draft.toAccount
  && draft.toCurrency === currency
  && draft.toAmount === ''
);

const formatMonth = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1));
};

export function FlowPeriodModal({
  month,
  entries,
  seedEntries = [],
  categorySuggestions = [],
  settings,
  appendBlank = false,
  focusEntryID,
  lockMonth = false,
  copyPreviousEntries,
  saving,
  error,
  onMonthChange,
  onClose,
  onSave
}: FlowPeriodModalProps) {
  const defaultCurrency = settings.baseCurrency || settings.currencies[0] || 'RUB';
  const [drafts, setDrafts] = useState<FlowPeriodDraft[]>(() => {
    const initial = [
      ...entries.map(entryToDraft),
      ...seedEntries.map(seedToDraft)
    ];
    if (appendBlank || initial.length === 0) initial.push(emptyDraft(defaultCurrency));
    return initial;
  });
  const initialDrafts = useRef(JSON.stringify(drafts));
  const [validationError, setValidationError] = useState('');
  const [commentEditor, setCommentEditor] = useState<{ clientID: string; text: string } | null>(null);
  const [copiedPrevious, setCopiedPrevious] = useState(false);
  const dirty = JSON.stringify(drafts) !== initialDrafts.current;

  const counterpartyOptions = useMemo(() => Array.from(new Set([
    ...(settings.cashFlow?.sources || []),
    ...drafts.map(draft => draft.counterparty)
  ].filter(Boolean))), [drafts, settings.cashFlow?.sources]);
  const categoryOptions = useMemo(() => Array.from(new Set([
    ...(settings.cashFlow?.categories || []),
    ...categorySuggestions,
    ...drafts.map(draft => draft.category)
  ].filter(Boolean))), [categorySuggestions, drafts, settings.cashFlow?.categories]);
  const accountOptions = useMemo(() => Array.from(new Set([
    ...settings.organizations.map(organization => organization.name),
    ...drafts.flatMap(draft => [draft.account, draft.toAccount])
  ].filter(Boolean))), [drafts, settings.organizations]);
  const currencyOptions = useMemo(() => Array.from(new Set([
    ...settings.currencies,
    ...drafts.flatMap(draft => [draft.currency, draft.toCurrency])
  ].filter(Boolean))), [drafts, settings.currencies]);

  const requestClose = () => {
    if (saving) return;
    if (dirty && !window.confirm('Discard unsaved Cash Flow changes?')) return;
    onClose();
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    if (!focusEntryID) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`flow-period-entry-${focusEntryID}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [focusEntryID]);

  useCloseOnEscape(requestClose, {
    enabled: !commentEditor,
    capture: false,
    preventDefault: false,
    stopPropagation: false,
    stopImmediatePropagation: false
  });

  const updateDraft = (clientID: string, patch: Partial<FlowPeriodDraft>) => {
    setDrafts(current => current.map(draft => draft.clientID === clientID ? { ...draft, ...patch } : draft));
    setValidationError('');
  };

  const defaultTaxRate = (counterparty: string) => settings.cashFlow?.taxRates?.[counterparty] || 0;

  const copyPrevious = () => {
    if (!copyPreviousEntries?.length || copiedPrevious || saving) return;
    setDrafts(current => [
      ...(current.length === 1 && isUntouchedBlankDraft(current[0], defaultCurrency) ? [] : current),
      ...copyPreviousEntries.map(seedToDraft)
    ]);
    setCopiedPrevious(true);
    setValidationError('');
  };

  const changeMonth = (nextMonth: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) return false;
    if (nextMonth === month) return true;
    if (dirty && !window.confirm('Switch month and discard unsaved changes?')) {
      return false;
    }
    onMonthChange(nextMonth);
    return true;
  };

  const commitMonthInput = (input: HTMLInputElement) => {
    if (!changeMonth(input.value)) input.value = month;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const invalidIndex = drafts.findIndex(draft => {
      const amount = Number(draft.amount);
      const taxRate = Number(draft.taxRate);
      if (draft.entryType === 'transfer') {
        const toAmount = Number(draft.toAmount);
        return !draft.account.trim() || !draft.toAccount.trim() || !draft.currency || !draft.toCurrency
          || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(toAmount) || toAmount <= 0
          || (draft.account.trim() === draft.toAccount.trim() && draft.currency === draft.toCurrency);
      }
      return !draft.counterparty.trim() || !draft.currency || !Number.isFinite(amount) || amount <= 0
        || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100;
    });
    if (invalidIndex >= 0) {
      setValidationError(`Movement ${invalidIndex + 1}: check its accounts, amounts, currencies, counterparty, and tax rate.`);
      return;
    }
    onSave(drafts);
  };

  const modal = (
    <div className="cash-flow-modal-backdrop" data-hotkeys-guard="true" onMouseDown={event => {
      if (event.target === event.currentTarget) requestClose();
    }}>
      <form className="cash-flow-period-modal glass-panel" onSubmit={submit}>
        <div className="cash-flow-period-header">
          <div className="cash-flow-period-header-month">
            <input
              className="input cash-flow-month-input"
              type="month"
              aria-label="Cash Flow month"
              defaultValue={month}
              onBlur={event => commitMonthInput(event.currentTarget)}
              onKeyDown={event => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                commitMonthInput(event.currentTarget);
              }}
              disabled={saving || lockMonth}
              title={lockMonth ? 'This month is linked to the snapshot period.' : undefined}
            />
          </div>
          <div className="cash-flow-period-header-info">
            <h3>Cash Flow · {formatMonth(month)}</h3>
            <p>Edit all movements for this month, then save the period once.</p>
          </div>
          <div className="cash-flow-period-header-actions">
            <button type="button" className="btn cash-flow-icon-button" onClick={requestClose} disabled={saving} title="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="cash-flow-period-toolbar">
          <span>{drafts.length} movement{drafts.length === 1 ? '' : 's'}</span>
          <span className="cash-flow-label-with-help">
            Amount supports calculations and shortcuts
            <HelpTooltip text={<AmountFieldHelp />} ariaLabel="Amount field help" width={400} />
          </span>
        </div>

        <div className="cash-flow-period-list">
          {drafts.length === 0 ? (
            <div className="cash-flow-period-empty">This month will be empty after saving.</div>
          ) : drafts.map((draft, index) => (
            <div
              key={draft.clientID}
              id={draft.id ? `flow-period-entry-${draft.id}` : undefined}
              className={`cash-flow-period-row${draft.entryType === 'transfer' ? ' is-transfer' : ''}${draft.id === focusEntryID ? ' is-focused' : ''}`}
            >
              <div className="cash-flow-period-row-number">{index + 1}</div>
              <div className="cash-flow-field cash-flow-period-direction">
                <span>Type</span>
                <div className="cash-flow-direction-switch" role="group" aria-label={`Movement ${index + 1} type`}>
                  <QuickHoverTooltip text="Incoming">
                    <button type="button" className={draft.entryType === 'external' && draft.direction === 'in' ? 'is-active is-in' : ''} aria-label="Incoming movement" aria-pressed={draft.entryType === 'external' && draft.direction === 'in'} onClick={() => updateDraft(draft.clientID, { entryType: 'external', direction: 'in', taxRate: defaultTaxRate(draft.counterparty) })}><ArrowDown size={16} /></button>
                  </QuickHoverTooltip>
                  <QuickHoverTooltip text="Outgoing">
                    <button type="button" className={draft.entryType === 'external' && draft.direction === 'out' ? 'is-active is-out' : ''} aria-label="Outgoing movement" aria-pressed={draft.entryType === 'external' && draft.direction === 'out'} onClick={() => updateDraft(draft.clientID, { entryType: 'external', direction: 'out', taxRate: 0 })}><ArrowUp size={16} /></button>
                  </QuickHoverTooltip>
                  <QuickHoverTooltip text="Transfer between accounts">
                    <button type="button" className={draft.entryType === 'transfer' ? 'is-active is-transfer' : ''} aria-label="Transfer between accounts" aria-pressed={draft.entryType === 'transfer'} onClick={() => updateDraft(draft.clientID, { entryType: 'transfer', direction: 'out', taxRate: 0 })}><ArrowRightLeft size={16} /></button>
                  </QuickHoverTooltip>
                </div>
              </div>
              {draft.entryType === 'transfer' ? (
                <>
                  <div className="cash-flow-field cash-flow-period-counterparty cash-flow-period-transfer-from">
                    <span>From account</span>
                    <SearchableSelect ariaLabel={`Movement ${index + 1} source account`} value={draft.account} onChange={account => updateDraft(draft.clientID, { account })} options={accountOptions} placeholder="Choose an account…" width="100%" dropdownWidth="240px" height="36px" textAlign="left" portal portalZIndex={100010} />
                  </div>
                  <div className="cash-flow-field cash-flow-period-amount">
                    <span>Sent</span>
                    <div className="cash-flow-amount-control">
                      <AmountInput value={draft.amount} onChange={amount => updateDraft(draft.clientID, { amount })} maximumFractionDigits={8} required ariaLabel={`Movement ${index + 1} sent amount`} />
                      <select className="input" aria-label={`Movement ${index + 1} sent currency`} value={draft.currency} onChange={event => updateDraft(draft.clientID, { currency: event.target.value })}>
                        {currencyOptions.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="cash-flow-field cash-flow-period-destination">
                    <span>To account</span>
                    <SearchableSelect ariaLabel={`Movement ${index + 1} destination account`} value={draft.toAccount} onChange={toAccount => updateDraft(draft.clientID, { toAccount })} options={accountOptions} placeholder="Choose an account…" width="100%" dropdownWidth="240px" height="36px" textAlign="left" portal portalZIndex={100010} />
                  </div>
                  <div className="cash-flow-field cash-flow-period-received">
                    <span>Received</span>
                    <div className="cash-flow-amount-control">
                      <AmountInput value={draft.toAmount} onChange={toAmount => updateDraft(draft.clientID, { toAmount })} maximumFractionDigits={8} required ariaLabel={`Movement ${index + 1} received amount`} />
                      <select className="input" aria-label={`Movement ${index + 1} received currency`} value={draft.toCurrency} onChange={event => updateDraft(draft.clientID, { toCurrency: event.target.value })}>
                        {currencyOptions.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="cash-flow-field cash-flow-period-counterparty">
                    <span>{draft.direction === 'in' ? 'From' : 'To'}</span>
                    <SearchableSelect ariaLabel={`Movement ${index + 1} ${draft.direction === 'in' ? 'from' : 'to'}`} value={draft.counterparty} onChange={counterparty => updateDraft(draft.clientID, { counterparty, taxRate: draft.direction === 'in' ? defaultTaxRate(counterparty) : 0 })} options={counterpartyOptions} placeholder={draft.direction === 'in' ? 'Choose a source…' : 'Choose a recipient…'} width="100%" dropdownWidth="260px" height="36px" textAlign="left" portal portalZIndex={100010} />
                  </div>
                  <div className="cash-flow-field cash-flow-period-account">
                    <span className="cash-flow-label-with-help">Own account <HelpTooltip text="Optional. Assigning the movement to an account lets analytics estimate returns for its deposit, stock, and other balance tags." ariaLabel="Own account help" width={330} /></span>
                    <SearchableSelect ariaLabel={`Movement ${index + 1} own account`} value={draft.account || NO_ACCOUNT_OPTION} onChange={account => updateDraft(draft.clientID, { account: account === NO_ACCOUNT_OPTION ? '' : account })} options={[NO_ACCOUNT_OPTION, ...accountOptions]} placeholder="Not assigned" width="100%" dropdownWidth="240px" height="36px" textAlign="left" portal portalZIndex={100010} />
                  </div>
                  <div className="cash-flow-field cash-flow-period-amount">
                    <span>{draft.direction === 'in' && Number(draft.taxRate) > 0 ? 'Gross amount' : 'Amount'}</span>
                    <div className="cash-flow-amount-control">
                      <AmountInput value={draft.amount} onChange={amount => updateDraft(draft.clientID, { amount })} maximumFractionDigits={8} required ariaLabel={`Movement ${index + 1} amount`} />
                      <select className="input" aria-label={`Movement ${index + 1} currency`} value={draft.currency} onChange={event => updateDraft(draft.clientID, { currency: event.target.value })}>
                        {currencyOptions.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="cash-flow-field cash-flow-period-tax">
                    <span className="cash-flow-period-tax-label">Tax {draft.direction === 'in' && Number(draft.taxRate) > 0 && Number(draft.amount) > 0 && <small>−{new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number(draft.amount) * Number(draft.taxRate) / 100)} {draft.currency}</small>}</span>
                    {draft.direction === 'in' ? <div className="cash-flow-tax-rate-control"><input className="input" type="number" min="0" max="100" step="0.01" aria-label={`Movement ${index + 1} tax rate`} value={draft.taxRate} onChange={event => updateDraft(draft.clientID, { taxRate: event.target.value })} /><span>%</span></div> : <div className="cash-flow-tax-disabled">—</div>}
                  </div>
                  <div className="cash-flow-field cash-flow-period-category">
                    <span>Category</span>
                    <SearchableSelect ariaLabel={`Movement ${index + 1} category`} value={draft.category || NO_CATEGORY_OPTION} onChange={category => updateDraft(draft.clientID, { category: category === NO_CATEGORY_OPTION ? '' : category })} options={[NO_CATEGORY_OPTION, ...categoryOptions]} placeholder="Choose a category" allowCustom width="100%" dropdownWidth="220px" height="36px" textAlign="left" portal portalZIndex={100010} />
                  </div>
                </>
              )}
              <div className="cash-flow-field cash-flow-period-comment">
                <span>Comment</span>
                <QuickHoverTooltip text={draft.comment}>
                  <button
                    type="button"
                    className={`cash-flow-comment-button${draft.comment ? ' has-comment' : ''}`}
                    onClick={() => setCommentEditor({ clientID: draft.clientID, text: draft.comment })}
                    aria-label={draft.comment ? 'Edit comment' : 'Add comment'}
                  >
                    <MessageSquare size={16} />
                    <span>{draft.comment || 'Add note'}</span>
                  </button>
                </QuickHoverTooltip>
              </div>
              <button type="button" className="btn btn-danger cash-flow-period-remove" onClick={() => setDrafts(current => current.filter(item => item.clientID !== draft.clientID))} title="Remove movement"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>

        <div className="cash-flow-period-add flex gap-2" style={{ flexWrap: 'wrap' }}>
          {copyPreviousEntries && (
            <button
              type="button"
              className="btn"
              onClick={copyPrevious}
              disabled={saving || copiedPrevious || copyPreviousEntries.length === 0}
              title={copyPreviousEntries.length === 0 ? 'The previous month has no external movements.' : `Copy ${copyPreviousEntries.length} external movement${copyPreviousEntries.length === 1 ? '' : 's'} from the previous month`}
            >
              <Copy size={16} /> {copiedPrevious ? 'Previous copied' : 'Copy previous'}
            </button>
          )}
          <button type="button" className="btn" onClick={() => setDrafts(current => [...current, emptyDraft(defaultCurrency)])} disabled={saving}><Plus size={16} /> Add movement</button>
        </div>

        {(validationError || error) && <div className="cash-flow-period-error">{validationError || error}</div>}
        <div className="cash-flow-period-footer">
          <button type="button" className="btn" onClick={requestClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner label="Saving Cash Flow period" size={16} /> : <Save size={16} />} Save period
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <>
      {createPortal(modal, document.body)}
      {commentEditor && (
        <CommentModal
          title="Movement comment"
          description="Enter saves · Shift+Enter adds a new line · Esc closes"
          text={commentEditor.text}
          onChange={text => setCommentEditor({ ...commentEditor, text })}
          onClose={() => setCommentEditor(null)}
          onSave={() => {
            updateDraft(commentEditor.clientID, { comment: commentEditor.text });
            setCommentEditor(null);
          }}
          placeholder="Context for this movement"
          saveLabel="Save comment"
        />
      )}
    </>
  );
}
