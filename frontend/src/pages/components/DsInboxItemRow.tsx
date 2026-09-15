import { useState } from 'react';
import { ArrowDown, ArrowRightLeft, ArrowUp, Check, Copy, FileText, Pencil, RotateCcw, X } from 'lucide-react';
import { AmountInput } from './AmountInput';
import { AppSelect } from './AppSelect';
import { committedDraft, draftFromItem, flowDraftIssues } from '../../lib/dsInbox';
import type { EditableFlowDraft } from '../../lib/dsInbox';
import { formatFlowAmount } from '../../lib/format';
import { getTagColor } from '../../types';
import type { DsInboxItem, FlowEntryDraft } from '../../types';

type DsInboxItemRowProps = {
  item: DsInboxItem;
  selected: boolean;
  selectable: boolean;
  saving: boolean;
  currencies: string[];
  accounts: string[];
  tags: string[];
  categories: string[];
  onSelect: (id: number, selected: boolean) => void;
  onSave: (id: number, draft: FlowEntryDraft) => Promise<boolean>;
  onAccept: (id: number, allowDuplicates: boolean) => void;
  onReject: (id: number) => void;
  onReopen: (id: number) => void;
};

const toOptions = (values: string[], colorize = false) => values.map(value => ({
  value,
  color: colorize ? getTagColor(value) : undefined
}));

const statusLabel: Record<string, string> = {
  pending: 'waiting',
  invalid: 'needs fixing',
  accepted: 'accepted',
  rejected: 'rejected',
  detached: 'movement deleted'
};

export function DsInboxItemRow({
  item,
  selected,
  selectable,
  saving,
  currencies,
  accounts,
  tags,
  categories,
  onSelect,
  onSave,
  onAccept,
  onReject,
  onReopen
}: DsInboxItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditableFlowDraft>(() => draftFromItem(item));
  const [rawOpen, setRawOpen] = useState(false);

  const stored = draftFromItem(item);
  const issues = flowDraftIssues(editing ? draft : stored);
  const isTransfer = (editing ? draft : stored).entryType === 'transfer';
  const editable = item.status === 'pending' || item.status === 'invalid';
  const isBalance = item.kind === 'balance';

  const update = (patch: Partial<EditableFlowDraft>) => setDraft(current => ({ ...current, ...patch }));

  const startEditing = () => {
    setDraft(draftFromItem(item));
    setEditing(true);
  };

  const save = async () => {
    const saved = await onSave(item.id, committedDraft(draft));
    if (saved) setEditing(false);
  };

  const directionMark = isTransfer
    ? <ArrowRightLeft size={14} className="is-transfer" />
    : stored.direction === 'in'
      ? <ArrowUp size={14} className="is-in" />
      : <ArrowDown size={14} className="is-out" />;

  return (
    <article
      className={`ds-item is-${item.status}${item.duplicate ? ' is-duplicate' : ''}${editing ? ' is-editing' : ''}`}
      data-hotkeys-guard={editing ? 'true' : undefined}
    >
      <div className="ds-item-main">
        <label className="ds-item-select">
          <input
            type="checkbox"
            checked={selected}
            disabled={!selectable}
            onChange={event => onSelect(item.id, event.target.checked)}
            aria-label={`Select ${item.externalId}`}
          />
        </label>

        {editing ? (
          <div className="ds-item-editor">
            <div className="ds-item-editor-row">
              <label className="ds-field">
                <span>Month</span>
                <input
                  className="input"
                  aria-invalid={issues.month ? true : undefined}
                  value={draft.month}
                  placeholder="2026-08"
                  onChange={event => update({ month: event.target.value })}
                />
              </label>

              <div className="ds-field">
                <span>Type</span>
                <div className="cash-flow-direction-switch">
                  <button
                    type="button"
                    className={!isTransfer && draft.direction === 'in' ? 'is-active is-in' : ''}
                    onClick={() => update({ entryType: 'external', direction: 'in' })}
                  >In</button>
                  <button
                    type="button"
                    className={!isTransfer && draft.direction === 'out' ? 'is-active is-out' : ''}
                    onClick={() => update({ entryType: 'external', direction: 'out', taxRate: 0 })}
                  >Out</button>
                  <button
                    type="button"
                    className={isTransfer ? 'is-active is-transfer' : ''}
                    onClick={() => update({ entryType: 'transfer', direction: 'out' })}
                  >Transfer</button>
                </div>
              </div>

              {!isTransfer && (
                <label className="ds-field is-wide">
                  <span>Counterparty</span>
                  <input
                    className="input"
                    aria-invalid={issues.counterparty ? true : undefined}
                    value={draft.counterparty}
                    onChange={event => update({ counterparty: event.target.value })}
                  />
                </label>
              )}

              <div className="ds-field">
                <span>{isTransfer ? 'From account' : 'Own account'}</span>
                <AppSelect
                  ariaLabel="Account"
                  value={draft.account}
                  options={toOptions(accounts)}
                  placeholder={isTransfer ? 'Pick an account' : 'None'}
                  searchable
                  allowCustom
                  onChange={value => update({ account: value })}
                />
              </div>

              <div className="ds-field is-narrow">
                <span>Currency</span>
                <AppSelect
                  ariaLabel="Currency"
                  value={draft.currency}
                  options={toOptions(currencies)}
                  placeholder="—"
                  allowCustom
                  onChange={value => update({ currency: value.toUpperCase() })}
                />
              </div>

              <label className="ds-field is-narrow">
                <span>Amount</span>
                <AmountInput
                  value={draft.amount}
                  maximumFractionDigits={8}
                  ariaLabel="Amount"
                  onChange={amount => update({ amount })}
                />
              </label>
            </div>

            {isTransfer ? (
              <div className="ds-item-editor-row">
                <div className="ds-field">
                  <span>To account</span>
                  <AppSelect
                    ariaLabel="Destination account"
                    value={draft.toAccount}
                    options={toOptions(accounts)}
                    placeholder="Pick an account"
                    searchable
                    allowCustom
                    onChange={value => update({ toAccount: value })}
                  />
                </div>
                <div className="ds-field is-narrow">
                  <span>To currency</span>
                  <AppSelect
                    ariaLabel="Destination currency"
                    value={draft.toCurrency}
                    options={toOptions(currencies)}
                    placeholder="—"
                    allowCustom
                    onChange={value => update({ toCurrency: value.toUpperCase() })}
                  />
                </div>
                <label className="ds-field is-narrow">
                  <span>To amount</span>
                  <AmountInput
                    value={draft.toAmount}
                    maximumFractionDigits={8}
                    ariaLabel="Received amount"
                    onChange={toAmount => update({ toAmount })}
                  />
                </label>
                <div className="ds-field">
                  <span>To tag</span>
                  <AppSelect
                    ariaLabel="Destination tag"
                    value={draft.toTag}
                    options={toOptions(tags, true)}
                    placeholder="Auto"
                    allowCustom
                    onChange={value => update({ toTag: value })}
                  />
                </div>
              </div>
            ) : (
              <div className="ds-item-editor-row">
                <div className="ds-field">
                  <span>Category</span>
                  <AppSelect
                    ariaLabel="Category"
                    value={draft.category}
                    options={toOptions(categories)}
                    placeholder="None"
                    searchable
                    allowCustom
                    onChange={value => update({ category: value })}
                  />
                </div>
                <div className="ds-field">
                  <span>Tag</span>
                  <AppSelect
                    ariaLabel="Balance tag"
                    value={draft.tag}
                    options={toOptions(tags, true)}
                    placeholder="Auto"
                    allowCustom
                    onChange={value => update({ tag: value })}
                  />
                </div>
                {draft.direction === 'in' && (
                  <label className="ds-field is-narrow">
                    <span>Tax %</span>
                    <AmountInput
                      value={draft.taxRate}
                      ariaLabel="Tax rate"
                      onChange={taxRate => update({ taxRate })}
                    />
                  </label>
                )}
                <label className="ds-field is-wide">
                  <span>Comment</span>
                  <input
                    className="input"
                    value={draft.comment}
                    onChange={event => update({ comment: event.target.value })}
                  />
                </label>
              </div>
            )}

            {Object.keys(issues).length > 0 && (
              <p className="ds-item-issues">{Object.values(issues).join(' · ')}</p>
            )}

            <div className="ds-item-editor-actions">
              <button className="btn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                <Check size={15} /> Save
              </button>
            </div>
          </div>
        ) : (
          <div className="ds-item-summary">
            <span className="ds-item-direction">{item.kind === 'raw' && !item.draft ? <FileText size={14} /> : directionMark}</span>
            <span className="ds-item-title">
              {item.kind === 'raw' && !item.draft
                ? <em>Not parsed — fill it in below</em>
                : isTransfer
                  ? `${stored.account || '—'} → ${stored.toAccount || '—'}`
                  : stored.counterparty || <em>No counterparty</em>}
            </span>
            <span className="ds-item-meta">
              {stored.category && <span className="ds-chip">{stored.category}</span>}
              {stored.tag && <span className="ds-chip" style={{ color: getTagColor(stored.tag) }}>{stored.tag}</span>}
              {item.duplicate && <span className="ds-chip is-warn"><Copy size={11} /> already in Cash Flow</span>}
              <span className={`ds-chip is-status is-${item.status}`}>{statusLabel[item.status] || item.status}</span>
            </span>
            <span className="ds-item-amount">
              {stored.amount > 0 && formatFlowAmount(stored.amount, stored.currency)}
              {isTransfer && stored.toAmount > 0 && (
                <small>→ {formatFlowAmount(stored.toAmount, stored.toCurrency)}</small>
              )}
            </span>
          </div>
        )}

        {!editing && (
          <div className="ds-item-actions">
            {editable && !isBalance && (
              <button className="btn" onClick={startEditing} title="Edit this movement" aria-label="Edit">
                <Pencil size={15} />
              </button>
            )}
            {editable && !isBalance && (
              <button
                className="btn btn-primary"
                onClick={() => onAccept(item.id, Boolean(item.duplicate))}
                disabled={Object.keys(issues).length > 0 || !item.draft}
                title={item.duplicate ? 'Accept anyway, even though an identical movement exists' : 'Add to Cash Flow'}
                aria-label="Accept"
              >
                <Check size={15} />
              </button>
            )}
            {editable && (
              <button className="btn btn-danger" onClick={() => onReject(item.id)} title="Reject" aria-label="Reject">
                <X size={15} />
              </button>
            )}
            {item.status === 'detached' && (
              <button className="btn" onClick={() => onReopen(item.id)} title="Put it back in the queue">
                <RotateCcw size={15} /> <span>Reopen</span>
              </button>
            )}
          </div>
        )}
      </div>

      {item.note && <p className="ds-item-note">{item.note}</p>}

      {isBalance && (
        <p className="ds-item-note">A balance reading. Applying these to a snapshot will come in a later version.</p>
      )}

      {item.raw && (
        <div className="ds-item-raw">
          <button className="ds-item-raw-toggle" onClick={() => setRawOpen(open => !open)} aria-expanded={rawOpen}>
            {rawOpen ? 'Hide the original' : 'Original'}
          </button>
          {rawOpen && <pre>{item.raw}</pre>}
          {!rawOpen && <span className="ds-item-raw-preview">{item.raw}</span>}
        </div>
      )}
    </article>
  );
}
