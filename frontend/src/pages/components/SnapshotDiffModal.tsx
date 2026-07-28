import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownUp, ChevronDown, Coins, ExternalLink, Folder, MessageSquare, RefreshCw, X } from 'lucide-react';
import { getCurrencyColor, getTagColor } from '../../types';
import type { FlowEntry, ParsedSnapshot } from '../../types';
import { summarizeFlowEntries } from '../../lib/cashFlow';
import { DELTA_NEGATIVE_COLOR, DELTA_NEUTRAL_COLOR, DELTA_POSITIVE_COLOR, formatExchangeRate } from '../../lib/format';
import { convertAmount, inferRateReferenceCurrency, orientExchangeRate } from '../../lib/finance';
import { buildTreeDiffData } from '../../lib/snapshotDiff';
import type { DiffStatus } from '../../lib/snapshotDiff';
import { isTextInputTarget } from '../../lib/hotkeys';
import { FlowNetSummary } from './FlowNetSummary';
import { HelpTooltip } from './HelpTooltip';
import { ModalPortal } from './ModalPortal';
import { AppSelect } from './AppSelect';

type DiffRateNode = {
  key: string;
  fromCurrency: string;
  toCurrency: string;
  previousRate: number | null;
  currentRate: number | null;
  delta: number | null;
  deltaPercent: number | null;
  status: DiffStatus;
};

type SnapshotDiffModalProps = {
  current: ParsedSnapshot;
  previous: ParsedSnapshot | null;
  snapshots: ParsedSnapshot[];
  cashFlowEnabled: boolean;
  flowEntries: FlowEntry[];
  onlyChanges: boolean;
  onOnlyChangesChange: (value: boolean) => void;
  scrollTop: number;
  onScrollTopChange: (value: number) => void;
  onPeriodChange: (currentMonth: string, previousMonth: string) => void;
  onClose: () => void;
};

const panelStyle = { width: '860px', maxWidth: '95vw', maxHeight: '85vh', overflow: 'visible' as const, padding: '16px 20px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' };
const balanceRowStyle = { display: 'grid', gridTemplateColumns: '68px minmax(130px, 1fr) 1fr 1fr 150px', alignItems: 'center', position: 'relative' as const, fontSize: '13px', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.02)', columnGap: '2px' };
const SCROLL_SAVE_THROTTLE_MS = 500;

const getStatusDeltaColor = (status: DiffStatus) => {
  if (status === 'up' || status === 'new') return DELTA_POSITIVE_COLOR;
  if (status === 'down' || status === 'deleted') return DELTA_NEGATIVE_COLOR;
  return DELTA_NEUTRAL_COLOR;
};

const formatRate = (value: number | null) => value === null ? '—' : formatExchangeRate(value);

const buildRateDiffData = (
  current: ParsedSnapshot,
  previous: ParsedSnapshot | null,
  onlyChanges: boolean
): DiffRateNode[] => {
  const referenceCurrency = inferRateReferenceCurrency(current.data.rates);
  const currencies = new Set([
    ...Object.keys(current.data.rates || {}),
    ...Object.keys(previous?.data.rates || {})
  ]);
  currencies.delete(referenceCurrency);

  const rateAt = (snapshot: ParsedSnapshot | null, currency: string) => {
    if (!snapshot) return null;
    const snapshotReference = inferRateReferenceCurrency(snapshot.data.rates, referenceCurrency);
    const hasCurrency = currency === snapshotReference || Object.hasOwn(snapshot.data.rates, currency);
    const hasReference = referenceCurrency === snapshotReference || Object.hasOwn(snapshot.data.rates, referenceCurrency);
    if (!hasCurrency || !hasReference) return null;
    const rate = convertAmount(1, currency, referenceCurrency, snapshot.data.rates);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  };

  return Array.from(currencies)
    .map(currency => {
      const rawPreviousRate = rateAt(previous, currency);
      const rawCurrentRate = rateAt(current, currency);
      const orientationRate = rawCurrentRate ?? rawPreviousRate;
      const orientation = orientExchangeRate(currency, referenceCurrency, orientationRate ?? 1);
      const normalizeRate = (rate: number | null) => {
        if (rate === null) return null;
        return orientation.inverted ? 1 / rate : rate;
      };
      const previousRate = normalizeRate(rawPreviousRate);
      const currentRate = normalizeRate(rawCurrentRate);
      const displayedDelta = previousRate !== null && currentRate !== null ? currentRate - previousRate : null;
      const displayedDeltaPercent = displayedDelta !== null && previousRate !== null && previousRate > 0
        ? (displayedDelta / previousRate) * 100
        : null;
      const delta = displayedDelta !== null && orientation.inverted ? -displayedDelta : displayedDelta;
      const deltaPercent = displayedDeltaPercent !== null && orientation.inverted ? -displayedDeltaPercent : displayedDeltaPercent;
      let status: DiffStatus = 'stable';
      if (previousRate === null && currentRate !== null) status = 'new';
      else if (previousRate !== null && currentRate === null) status = 'deleted';
      else if (delta !== null && delta > 1e-9) status = 'up';
      else if (delta !== null && delta < -1e-9) status = 'down';
      return {
        key: currency,
        fromCurrency: orientation.fromCurrency,
        toCurrency: orientation.toCurrency,
        previousRate,
        currentRate,
        delta,
        deltaPercent,
        status
      };
    })
    .filter(rate => !onlyChanges || rate.status !== 'stable')
    .sort((left, right) => left.key.localeCompare(right.key));
};

const renderTagPill = (tag: string, changed: boolean, removed = false) => {
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
        lineHeight: 1.4,
        opacity: removed ? 0.6 : 1,
        textDecoration: removed ? 'line-through' : 'none'
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

function ExpandablePeriodComment({ comment }: { comment: string }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const paragraphRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (expanded) return;
    const paragraph = paragraphRef.current;
    if (!paragraph) return;

    const updateOverflow = () => setCanExpand(paragraph.scrollHeight > paragraph.clientHeight + 1);
    updateOverflow();
    window.addEventListener('resize', updateOverflow);
    return () => window.removeEventListener('resize', updateOverflow);
  }, [comment, expanded]);

  const toggle = () => {
    if (canExpand) setExpanded(value => !value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canExpand || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    toggle();
  };

  return (
    <div
      className={`snapshot-diff-period-note-comment${expanded ? ' is-expanded' : ''}${canExpand ? ' is-expandable' : ''}`}
      role={canExpand ? 'button' : undefined}
      tabIndex={canExpand ? 0 : undefined}
      aria-expanded={canExpand ? expanded : undefined}
      onClick={toggle}
      onKeyDown={handleKeyDown}
    >
      <p ref={paragraphRef}>{comment}</p>
      {canExpand && <span>{expanded ? 'Collapse' : 'Show more'}</span>}
    </div>
  );
}

function CommentMarker({ comment, label }: { comment?: string; label?: string }) {
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
  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    if (position) {
      setPosition(null);
      return;
    }
    showTooltip(event.currentTarget);
  };

  return (
    <span
      className="diff-comment-marker"
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPosition(null)}
      onFocus={handleFocus}
      onBlur={() => setPosition(null)}
      onClick={handleClick}
      aria-label={label ? `View ${label.toLowerCase()}` : 'View comment'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        color: '#60a5fa',
        opacity: 0.9,
        position: 'relative',
        cursor: 'help',
        padding: label ? '2px 6px' : 0,
        border: label ? '1px solid rgba(59, 130, 246, 0.28)' : 'none',
        borderRadius: label ? '4px' : 0,
        background: label ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
        fontSize: '10px',
        fontWeight: 700
      }}
    >
      <MessageSquare size={12} />
      {label}
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

export function SnapshotDiffModal({
  current,
  previous,
  snapshots,
  cashFlowEnabled,
  flowEntries,
  onlyChanges,
  onOnlyChangesChange,
  scrollTop,
  onScrollTopChange,
  onPeriodChange,
  onClose
}: SnapshotDiffModalProps) {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(current.month);
  const [previousMonth, setPreviousMonth] = useState(previous?.month || '');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const onScrollTopChangeRef = useRef(onScrollTopChange);
  const pendingScrollTopRef = useRef<number | null>(null);
  const scrollSaveTimeoutRef = useRef(0);
  onScrollTopChangeRef.current = onScrollTopChange;
  const selectedCurrent = snapshots.find(snapshot => snapshot.month === currentMonth) || current;
  const selectedPrevious = snapshots.find(snapshot => snapshot.month === previousMonth) || null;
  const availableMonths = useMemo(() => snapshots.map(snapshot => snapshot.month), [snapshots]);
  const availableMonthOptions = useMemo(
    () => availableMonths.map(value => ({ value })),
    [availableMonths]
  );
  const toOptions = useMemo(
    () => availableMonths.filter(month => !selectedPrevious || month >= selectedPrevious.month),
    [availableMonths, selectedPrevious]
  );
  const toMonthOptions = useMemo(
    () => toOptions.map(value => ({ value })),
    [toOptions]
  );

  const treeDiffData = useMemo(
    () => buildTreeDiffData(selectedCurrent, selectedPrevious, onlyChanges),
    [selectedCurrent, selectedPrevious, onlyChanges]
  );
  const rateDiffData = useMemo(
    () => buildRateDiffData(selectedCurrent, selectedPrevious, onlyChanges),
    [onlyChanges, selectedCurrent, selectedPrevious]
  );
  const compactRateChanges = rateDiffData.filter(rate => rate.status !== 'stable');
  const selectedMonthFlowEntries = useMemo(
    () => flowEntries.filter(entry => entry.month === selectedCurrent.month && entry.entryType !== 'transfer'),
    [flowEntries, selectedCurrent.month]
  );
  const selectedMonthFlowTotals = useMemo(
    () => summarizeFlowEntries(selectedMonthFlowEntries),
    [selectedMonthFlowEntries]
  );

  const handlePreviousMonthChange = (month: string) => {
    setPreviousMonth(month);
    if (selectedCurrent.month < month) {
      setCurrentMonth(month);
      onPeriodChange(month, month);
      return;
    }
    onPeriodChange(selectedCurrent.month, month);
  };

  const handleCurrentMonthChange = (month: string) => {
    setCurrentMonth(month);
    onPeriodChange(month, selectedPrevious?.month || '');
  };

  const flushScrollTop = useCallback(() => {
    window.clearTimeout(scrollSaveTimeoutRef.current);
    scrollSaveTimeoutRef.current = 0;
    if (pendingScrollTopRef.current === null) return;
    onScrollTopChangeRef.current(pendingScrollTopRef.current);
    pendingScrollTopRef.current = null;
  }, []);

  const queueScrollTopSave = useCallback((value: number) => {
    pendingScrollTopRef.current = value;
    if (!scrollSaveTimeoutRef.current) {
      scrollSaveTimeoutRef.current = window.setTimeout(flushScrollTop, SCROLL_SAVE_THROTTLE_MS);
    }
  }, [flushScrollTop]);

  useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollTop;
    }
  }, [scrollTop]);

  useEffect(() => () => {
    flushScrollTop();
  }, [flushScrollTop]);

  useEffect(() => {
    const handleEditHotkey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTextInputTarget(event.target) || event.code !== 'KeyE') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      navigate(`/snapshot/${selectedCurrent.month}`);
    };

    window.addEventListener('keydown', handleEditHotkey, true);
    return () => window.removeEventListener('keydown', handleEditHotkey, true);
  }, [navigate, selectedCurrent.month]);

  return (
    <ModalPortal className="snapshot-diff-modal-backdrop" zIndex={10_000} onClose={onClose}>
      <div
        className="glass-panel snapshot-diff-modal flex flex-col"
        style={panelStyle}
        onClick={event => event.stopPropagation()}
      >
        <div className="snapshot-diff-header mb-3">
          <div className="snapshot-diff-period-picker">
            <span>From</span>
            <AppSelect
              ariaLabel="Diff start month"
              value={selectedPrevious?.month || ''}
              onChange={handlePreviousMonthChange}
              options={availableMonthOptions}
              placeholder="Select"
              searchable
              searchPlaceholder="Find month…"
              width="104px"
              dropdownWidth={156}
              height="24px"
              textAlign="center"
            />
            <span aria-hidden="true" className="snapshot-diff-period-arrow">→</span>
            <span>To</span>
            <AppSelect
              ariaLabel="Diff end month"
              value={selectedCurrent.month}
              onChange={handleCurrentMonthChange}
              options={toMonthOptions}
              placeholder="Select"
              searchable
              searchPlaceholder="Find month…"
              width="104px"
              dropdownWidth={156}
              height="24px"
              textAlign="center"
            />
          </div>
          <h3>Snapshot Diff</h3>
          <div className="snapshot-diff-header-actions">
            <Link
              to={`/snapshot/${selectedCurrent.month}`}
              className="btn snapshot-diff-edit-link"
              title={`Edit snapshot ${selectedCurrent.month}`}
            >
              <ExternalLink size={14} /> Edit <kbd>E</kbd>
            </Link>
            <label className="snapshot-diff-only-changes" title="Toggle changes only (D)">
              <input
                id="snapshot-diff-only-changes"
                name="snapshot-diff-only-changes"
                type="checkbox"
                checked={onlyChanges}
                onChange={event => onOnlyChangesChange(event.target.checked)}
              />
              <span className="snapshot-diff-switch" aria-hidden="true"><i /></span>
              <span>Changes only</span>
              <kbd>D</kbd>
            </label>
            <button className="btn" style={{ padding: '4px' }} onClick={onClose} aria-label="Close diff">
              <X size={18} />
            </button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '2px' }}
          onScroll={event => queueScrollTopSave(event.currentTarget.scrollTop)}
        >
          <div
            key={`${selectedPrevious?.month || 'none'}:${selectedCurrent.month}:${onlyChanges}`}
            className="snapshot-diff-content"
          >
          {(selectedCurrent.data.comment || selectedPrevious?.data.comment) && (
            <section className="snapshot-diff-period-notes">
              {selectedPrevious?.data.comment && (
                <div className="snapshot-diff-period-note">
                  <div className="snapshot-diff-period-note-label">
                    <MessageSquare size={14} /> Previous · {selectedPrevious.month}
                  </div>
                  <ExpandablePeriodComment comment={selectedPrevious.data.comment} />
                </div>
              )}
              {selectedCurrent.data.comment && (
                <div className="snapshot-diff-period-note">
                  <div className="snapshot-diff-period-note-label">
                    <MessageSquare size={14} /> Current · {selectedCurrent.month}
                  </div>
                  <ExpandablePeriodComment comment={selectedCurrent.data.comment} />
                </div>
              )}
            </section>
          )}

          {cashFlowEnabled && selectedMonthFlowEntries.length > 0 && (
            <section className="snapshot-diff-recorded-flow">
              <div className="snapshot-diff-recorded-flow-heading">
                <div className="snapshot-diff-recorded-flow-title">
                  <ArrowDownUp size={15} />
                  <strong>Recorded Cash Flow</strong>
                  <span>{selectedCurrent.month}</span>
                  <HelpTooltip
                    text="Optional recorded movements. They provide context and are not expected to match the snapshot change."
                    ariaLabel="Recorded Cash Flow explanation"
                    width={340}
                  />
                </div>
                <FlowNetSummary totals={selectedMonthFlowTotals} compact label="" />
                <Link to={`/flow?month=${selectedCurrent.month}`} className="btn">
                  Open month <ExternalLink size={14} />
                </Link>
              </div>
            </section>
          )}

          {rateDiffData.length > 0 && (
            <details className="snapshot-diff-rates">
              <summary className="snapshot-diff-rates-title">
                <RefreshCw size={15} />
                <strong>Exchange Rate Changes</strong>
                <span className="snapshot-diff-rate-summary">
                  {compactRateChanges.slice(0, 4).map(rate => {
                    const sign = rate.delta !== null && rate.delta > 0 ? '+' : '';
                    const value = rate.status === 'new'
                      ? 'NEW'
                      : rate.status === 'deleted'
                        ? 'REMOVED'
                        : rate.delta === null ? '—' : `${sign}${formatRate(rate.delta)}`;
                    return (
                      <span
                        key={rate.key}
                        style={{ color: getStatusDeltaColor(rate.status) }}
                      >
                        <b>{rate.key}</b> {value}
                      </span>
                    );
                  })}
                  {compactRateChanges.length > 4 && <em>+{compactRateChanges.length - 4}</em>}
                  {compactRateChanges.length === 0 && <em>No changes</em>}
                </span>
                <span className="snapshot-diff-rates-period">{rateDiffData.length} · {selectedPrevious?.month || '—'} → {selectedCurrent.month}</span>
                <ChevronDown className="snapshot-diff-rates-chevron" size={15} />
              </summary>
              <div className="snapshot-diff-rate-list">
                {rateDiffData.map(rate => {
                  const deltaColor = getStatusDeltaColor(rate.status);
                  const deltaSign = rate.delta !== null && rate.delta > 0 ? '+' : '';
                  return (
                    <div key={rate.key} className="snapshot-diff-rate-row">
                      <strong style={{ color: getCurrencyColor(rate.fromCurrency) }}>{rate.fromCurrency} → {rate.toCurrency}</strong>
                      <span className="snapshot-diff-rate-values">
                        <b>{formatRate(rate.previousRate)}</b>
                        <span>→</span>
                        <b>{formatRate(rate.currentRate)}</b>
                      </span>
                      <span style={{ color: deltaColor, fontWeight: 750 }}>
                        {rate.status === 'new' ? 'NEW' : rate.status === 'deleted' ? 'REMOVED' : rate.delta === null ? '—' : `${deltaSign}${formatRate(rate.delta)}`}
                        {rate.deltaPercent !== null && (
                          <small> ({deltaSign}{rate.deltaPercent.toFixed(2)}%)</small>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

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
                  const deltaColor = getStatusDeltaColor(balance.status);
                  const deltaSign = balance.status === 'up' || balance.status === 'new' ? '+' : '';

                  const visiblePreviousTags = balance.tagsChanged
                    ? balance.previousTags.filter(tag => tag !== 'untagged')
                    : [];
                  const visibleCurrentTags = balance.tagsChanged
                    ? balance.currentTags.filter(tag => tag !== 'untagged')
                    : balance.currentTags;
                  const showTagTransition = visiblePreviousTags.length > 0 && visibleCurrentTags.length > 0;
                  const hasStatus = balance.status === 'new' || balance.status === 'deleted';

                  return (
                    <div
                      key={balanceIndex}
                      style={balanceRowStyle}
                    >
                      {hasStatus && (
                        <span
                          style={{
                            position: 'absolute',
                            left: '-15px',
                            top: '50%',
                            color: getStatusDeltaColor(balance.status),
                            fontSize: '8px',
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            lineHeight: 1,
                            writingMode: 'vertical-rl',
                            transform: 'translateY(-50%) rotate(180deg)'
                          }}
                        >
                          {balance.status === 'new' ? 'NEW' : 'RMV'}
                        </span>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <Coins size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
                          <span style={{
                            color: getCurrencyColor(balance.currency),
                            fontWeight: 700,
                            letterSpacing: '0.03em'
                          }}>
                            {balance.currency}
                          </span>
                          <CommentMarker comment={balance.comment} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '4px', flexWrap: 'wrap', minWidth: 0 }}>
                        {visiblePreviousTags.map(tag => renderTagPill(tag, false, visibleCurrentTags.length === 0))}
                        {showTagTransition && (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '10px', opacity: 0.7 }}>{'->'}</span>
                        )}
                        {visibleCurrentTags.map(tag => renderTagPill(tag, balance.tagsChanged))}
                      </div>

                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                        from: <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{Math.round(balance.previousAmt).toLocaleString('en-US')}</span>
                      </div>

                      <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                        to: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{Math.round(balance.currentAmt).toLocaleString('en-US')}</span>
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
        </div>
      </div>
    </ModalPortal>
  );
}
