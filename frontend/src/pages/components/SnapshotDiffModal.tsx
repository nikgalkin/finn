import { useMemo, useState } from 'react';
import type { FocusEvent, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Coins, Folder, MessageSquare, X } from 'lucide-react';
import { getCurrencyColor, getTagColor } from '../../types';
import type { ParsedSnapshot } from '../../types';

type DiffStatus = 'new' | 'deleted' | 'up' | 'down' | 'stable';

type DiffBalanceNode = {
  currency: string;
  currentTags: string[];
  previousTags: string[];
  tagsChanged: boolean;
  comment?: string;
  previousAmt: number;
  currentAmt: number;
  delta: number;
  deltaPercent: number;
  status: DiffStatus;
};

type DiffOrgNode = {
  orgName: string;
  comment?: string;
  balances: DiffBalanceNode[];
  hasChanges: boolean;
};

type SnapshotDiffModalProps = {
  current: ParsedSnapshot;
  previous: ParsedSnapshot | null;
  onlyChanges: boolean;
  onOnlyChangesChange: (value: boolean) => void;
  onClose: () => void;
};

const overlayStyle = { position: 'fixed', inset: 0 } as const;
const panelStyle = { width: '740px', maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' as const, padding: '16px 20px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' };
const balanceRowStyle = { display: 'grid', gridTemplateColumns: '210px 1fr 1fr 150px', alignItems: 'center', fontSize: '13px', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.02)', gap: '8px' };

const normalizeTags = (tags?: string[]) => {
  return (tags && tags.length > 0 ? tags : ['untagged']).filter(Boolean);
};

const areTagsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((tag, index) => tag === rightSorted[index]);
};

const renderTagPill = (tag: string, changed: boolean) => {
  const color = tag === 'untagged' ? 'var(--text-secondary)' : getTagColor(tag);
  const borderColor = tag === 'untagged' ? 'rgba(148,163,184,0.2)' : `${getTagColor(tag)}55`;

  return (
    <span
      key={tag}
      style={{
        color,
        border: `1px solid ${borderColor}`,
        background: changed ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.02)',
        borderRadius: '4px',
        padding: '1px 5px',
        fontSize: '10px',
        fontWeight: 700,
        lineHeight: 1.4
      }}
    >
      {tag}
    </span>
  );
};

type TooltipPosition = {
  left: number;
  top: number;
  placement: 'top' | 'bottom';
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

function CommentMarker({ comment }: { comment?: string }) {
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  if (!comment) return null;

  const showTooltip = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const placement = rect.top < 96 ? 'bottom' : 'top';
    setPosition({
      left: clamp(rect.left + rect.width / 2, 150, window.innerWidth - 150),
      top: placement === 'top' ? rect.top - 8 : rect.bottom + 8,
      placement
    });
  };

  const handleMouseEnter = (event: MouseEvent<HTMLSpanElement>) => showTooltip(event.currentTarget);
  const handleFocus = (event: FocusEvent<HTMLSpanElement>) => showTooltip(event.currentTarget);

  return (
    <span
      className="diff-comment-marker"
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPosition(null)}
      onFocus={handleFocus}
      onBlur={() => setPosition(null)}
      style={{ display: 'inline-flex', color: '#3b82f6', opacity: 0.85, position: 'relative', cursor: 'help' }}
    >
      <MessageSquare size={12} />
      {position && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: position.left,
            top: position.top,
            transform: position.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            width: 'max-content',
            maxWidth: '280px',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid var(--glass-border)',
            background: 'var(--bg-color)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontWeight: 500,
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
            zIndex: 10_000
          }}
        >
          {comment}
        </div>,
        document.body
      )}
    </span>
  );
}

const buildTreeDiffData = (
  current: ParsedSnapshot,
  previous: ParsedSnapshot | null,
  onlyChanges: boolean
): DiffOrgNode[] => {
  const currentOrgs = current.data.organizations;
  const previousOrgs = previous ? previous.data.organizations : [];

  const orgNames = new Set<string>();
  currentOrgs.forEach(org => org.name && orgNames.add(org.name));
  previousOrgs.forEach(org => org.name && orgNames.add(org.name));

  const tree: DiffOrgNode[] = Array.from(orgNames).map(orgName => {
    const currentOrg = currentOrgs.find(org => org.name === orgName);
    const previousOrg = previousOrgs.find(org => org.name === orgName);

    const currencies = new Set<string>();
    currentOrg?.balances.forEach(balance => balance.currency && currencies.add(balance.currency));
    previousOrg?.balances.forEach(balance => balance.currency && currencies.add(balance.currency));

    let hasChanges = false;

    const balances: DiffBalanceNode[] = Array.from(currencies).map(currency => {
      const currentBalance = currentOrg?.balances.find(balance => balance.currency === currency);
      const previousBalance = previousOrg?.balances.find(balance => balance.currency === currency);

      const currentAmt = currentBalance ? Number(currentBalance.amount || 0) : 0;
      const previousAmt = previousBalance ? Number(previousBalance.amount || 0) : 0;
      const delta = currentAmt - previousAmt;
      const deltaPercent = previousAmt > 0 ? (delta / previousAmt) * 100 : 0;
      const currentTags = normalizeTags(currentBalance?.tags);
      const previousTags = normalizeTags(previousBalance?.tags);
      const tagsChanged = Boolean(currentBalance || previousBalance) && !areTagsEqual(currentTags, previousTags);
      const comment = currentBalance?.comment || previousBalance?.comment || undefined;

      if (Math.abs(delta) >= 0.01 || tagsChanged) {
        hasChanges = true;
      }

      let status: DiffStatus = 'stable';
      if (!previousBalance && currentBalance) status = 'new';
      else if (previousBalance && !currentBalance) status = 'deleted';
      else if (delta > 0) status = 'up';
      else if (delta < 0) status = 'down';

      return { currency, currentTags, previousTags, tagsChanged, comment, currentAmt, previousAmt, delta, deltaPercent, status };
    }).sort((a, b) => a.currency.localeCompare(b.currency));

    return { orgName, comment: currentOrg?.comment || previousOrg?.comment || undefined, balances, hasChanges };
  }).sort((a, b) => a.orgName.localeCompare(b.orgName));

  if (!onlyChanges) return tree;

  return tree
    .filter(org => org.hasChanges)
    .map(org => ({
      ...org,
      balances: org.balances.filter(balance => Math.abs(balance.delta) >= 0.01 || balance.tagsChanged)
    }));
};

export function SnapshotDiffModal({
  current,
  previous,
  onlyChanges,
  onOnlyChangesChange,
  onClose
}: SnapshotDiffModalProps) {
  const treeDiffData = useMemo(
    () => buildTreeDiffData(current, previous, onlyChanges),
    [current, previous, onlyChanges]
  );

  return createPortal(
    <div
      className="fixed z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      style={overlayStyle}
      onClick={onClose}
    >
      <div
        className="glass-panel flex flex-col"
        style={panelStyle}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>Granular Hierarchy Diff</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Comparing <b>{current.month}</b> with {previous ? <b>{previous.month}</b> : 'previous (none)'}
            </p>
          </div>
          <button className="btn" style={{ padding: '4px' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <input
            type="checkbox"
            id="onlyChangesCheckbox"
            checked={onlyChanges}
            onChange={event => onOnlyChangesChange(event.target.checked)}
            title="Toggle changes only (D)"
            style={{ cursor: 'pointer', width: '15px', height: '16px', accentColor: 'var(--accent)' }}
          />
          <label htmlFor="onlyChangesCheckbox" title="Toggle changes only (D)" style={{ fontSize: '14px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
            Show changes only (hide zero deltas)
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {treeDiffData.map((org, orgIndex) => (
            <div
              key={orgIndex}
              style={{
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.01)',
                border: '1px solid var(--glass-border)',
                borderRadius: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                <Folder size={16} style={{ color: 'var(--accent)' }} />
                <span>{org.orgName}</span>
                <CommentMarker comment={org.comment} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
                {org.balances.map((balance, balanceIndex) => {
                  let deltaColor = 'var(--text-secondary)';
                  let deltaSign = '';
                  if (balance.status === 'up' || balance.status === 'new') {
                    deltaColor = 'var(--diff-positive, hsl(142, 45%, 55%))';
                    deltaSign = '+';
                  }
                  else if (balance.status === 'down' || balance.status === 'deleted') {
                    deltaColor = 'var(--diff-negative, hsl(0, 45%, 60%))';
                  }

                  return (
                    <div
                      key={balanceIndex}
                      style={balanceRowStyle}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <Coins size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
                          <span style={{
                            color: getCurrencyColor(balance.currency),
                            fontWeight: 700,
                            letterSpacing: '0.03em'
                          }}>
                            {balance.currency}
                          </span>
                          {balance.status === 'new' && <span style={{ fontSize: '9px', color: 'var(--diff-positive, hsl(142, 45%, 55%))', fontWeight: 600 }}>[NEW]</span>}
                          {balance.status === 'deleted' && <span style={{ fontSize: '9px', color: 'var(--diff-negative, hsl(0, 45%, 60%))', fontWeight: 600 }}>[RMV]</span>}
                          <CommentMarker comment={balance.comment} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          {balance.tagsChanged && balance.previousTags.map(tag => renderTagPill(tag, false))}
                          {balance.tagsChanged && (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '10px', opacity: 0.7 }}>{'->'}</span>
                          )}
                          {balance.currentTags.map(tag => renderTagPill(tag, balance.tagsChanged))}
                        </div>
                      </div>

                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                        prev: <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{Math.round(balance.previousAmt).toLocaleString('en-US')}</span>
                      </div>

                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                        curr: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{Math.round(balance.currentAmt).toLocaleString('en-US')}</span>
                      </div>

                      <div style={{ color: deltaColor, fontWeight: 700, textAlign: 'right' }}>
                        {deltaSign}{Math.round(balance.delta).toLocaleString('en-US')}
                        {balance.status !== 'new' && balance.status !== 'deleted' && balance.previousAmt > 0 && (
                          <span style={{ fontSize: '0.85em', marginLeft: '4px', opacity: 0.8, fontWeight: 500 }}>
                            ({deltaSign}{balance.deltaPercent.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {treeDiffData.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px', fontSize: '13px' }}>
              No historical changes detected in this period.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
