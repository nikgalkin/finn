import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Calendar, Edit, MessageSquare, TrendingUp } from 'lucide-react';
import { getCurrencyColor, getTagColor } from '../types';
import type { CommentItem, FlowDecomposition } from '../lib/finance';
import type { ParsedSnapshot } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useSnapshots } from '../hooks/useSnapshots';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { SnapshotDiffModal } from './components/SnapshotDiffModal';
import { calculateFlowDecomposition, calculateTotals, convertAmount, extractComments } from '../lib/finance';
import { isTextInputTarget } from '../lib/hotkeys';
import { StickyPageHeader } from './components/StickyPageHeader';

type FeedMode = 'all' | 'comments';

type FeedItemTone = 'comment' | 'positive' | 'negative' | 'neutral';

type FeedEntity = {
  kind: 'organization' | 'currency' | 'tag';
  name: string;
};

type FeedItem = {
  id: string;
  month: string;
  kind: 'comment' | 'highlight';
  title: string;
  text: string;
  meta?: string;
  score: number;
  tone: FeedItemTone;
  comment?: CommentItem;
  targetOrgName?: string;
  entities?: FeedEntity[];
};

type FeedPeriod = {
  month: string;
  snapshot: ParsedSnapshot;
  previousSnapshot: ParsedSnapshot | null;
  comments: FeedItem[];
  highlights: FeedItem[];
};

const HIGHLIGHT_RULES = {
  totalDeltaPercent: 0.08,
  totalDeltaMedianMultiplier: 2.25,
  organicDeltaPercent: 0.06,
  organicDeltaMedianMultiplier: 2,
  fxDeltaPercent: 0.035,
  fxDeltaMedianMultiplier: 2.5,
  newEntryPercent: 0.05,
  newEntryMedianMultiplier: 1.25,
  orgMoverPercent: 0.07,
  orgMoverMedianMultiplier: 1.5,
  tagShareDeltaPercentPoints: 15,
  tagShareValuePercent: 0.04,
  maxAutoHighlightsPerMonth: 1
};

const HIGHLIGHT_BADGE_COLOR = '#f59e0b';
const HIGHLIGHT_BADGE_BORDER = 'rgba(245, 158, 11, 0.35)';

const getOrgColor = (orgName: string) => {
  if (!orgName) return 'hsl(0, 0%, 50%)';
  let hash = 0;
  for (let i = 0; i < orgName.length; i++) {
    hash = orgName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 75%)`;
};

const toNumber = (value: number | string | undefined): number => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const median = (values: number[]) => {
  const sorted = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const getSignedPercent = (current: number, previous: number) => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

const formatMoney = (value: number, currency: string) => {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('en-US')} ${currency}`;
};

const formatPercent = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const getToneForValue = (value: number): FeedItemTone => {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
};

const getToneColor = (tone: FeedItemTone) => {
  if (tone === 'comment') return '#3b82f6';
  if (tone === 'positive') return 'var(--diff-positive, hsl(142, 45%, 55%))';
  if (tone === 'negative') return 'var(--diff-negative, hsl(0, 45%, 60%))';
  return 'var(--text-secondary)';
};

const getToneBorderColor = (tone: FeedItemTone) => {
  if (tone === 'comment') return 'rgba(59, 130, 246, 0.3)';
  if (tone === 'positive') return 'rgba(18, 192, 82, 0.3)';
  if (tone === 'negative') return 'rgba(214, 60, 60, 0.3)';
  return 'rgba(148, 163, 184, 0.25)';
};

const getCommentTitle = (comment: CommentItem) => {
  if (comment.type === 'snapshot') return 'Snapshot note';
  if (comment.type === 'balance' && comment.orgName && comment.currency) return `${comment.orgName} · ${comment.currency}`;
  if (comment.orgName) return comment.orgName;
  return 'Note';
};

const renderItemTitle = (item: FeedItem) => {
  const comment = item.comment;

  if (!comment) return item.title;
  if (comment.type === 'snapshot') return 'Snapshot note';
  if (!comment.orgName) return item.title;

  return (
    <>
      <span style={{ color: getOrgColor(comment.orgName) }}>{comment.orgName}</span>
      {comment.currency && (
        <>
          <span style={{ color: 'var(--text-secondary)' }}>·</span>
          <span style={{ color: getCurrencyColor(comment.currency) }}>{comment.currency}</span>
        </>
      )}
    </>
  );
};

const getEntityColor = (entity: FeedEntity) => {
  if (entity.kind === 'organization') return getOrgColor(entity.name);
  if (entity.kind === 'currency') return getCurrencyColor(entity.name);
  return getTagColor(entity.name);
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const renderColoredEntities = (text: string, entities?: FeedEntity[]) => {
  const uniqueEntities = Array.from(
    new Map((entities || []).filter(entity => entity.name).map(entity => [`${entity.kind}:${entity.name}`, entity])).values()
  ).sort((a, b) => b.name.length - a.name.length);
  if (uniqueEntities.length === 0) return text;

  const byName = new Map(uniqueEntities.map(entity => [entity.name, entity]));
  const matcher = new RegExp(`(${uniqueEntities.map(entity => escapeRegExp(entity.name)).join('|')})`, 'g');

  return text.split(matcher).map((part, index) => {
    const entity = byName.get(part);
    return entity
      ? <span key={`${part}-${index}`} style={{ color: getEntityColor(entity), fontWeight: 700 }}>{part}</span>
      : part;
  });
};

const renderCommentTags = (comment?: CommentItem) => {
  if (comment?.type !== 'balance' || !comment.tags?.length) return null;

  return comment.tags.map(tag => (
    <span
      key={tag}
      style={{
        color: getTagColor(tag),
        border: `1px solid ${getTagColor(tag)}55`,
        background: 'rgba(255,255,255,0.025)',
        borderRadius: '4px',
        padding: '1px 5px',
        fontSize: '10px',
        fontWeight: 700,
        lineHeight: 1.4
      }}
    >
      {tag}
    </span>
  ));
};

const buildOrganizationValues = (snapshot: ParsedSnapshot, baseCurrency: string) => {
  const values: Record<string, number> = {};

  snapshot.data.organizations.forEach(org => {
    if (!org.name) return;
    values[org.name] = org.balances.reduce((total, balance) => {
      return total + convertAmount(toNumber(balance.amount), balance.currency, baseCurrency, snapshot.data.rates);
    }, 0);
  });

  return values;
};

const buildCurrencyValues = (snapshot: ParsedSnapshot, baseCurrency: string) => {
  const values: Record<string, number> = {};

  snapshot.data.organizations.forEach(org => {
    org.balances.forEach(balance => {
      if (!balance.currency) return;
      values[balance.currency] = (values[balance.currency] || 0) + convertAmount(toNumber(balance.amount), balance.currency, baseCurrency, snapshot.data.rates);
    });
  });

  return values;
};

const buildTagValues = (snapshot: ParsedSnapshot, baseCurrency: string) => {
  const values: Record<string, number> = {};

  snapshot.data.organizations.forEach(org => {
    org.balances.forEach(balance => {
      const amount = convertAmount(toNumber(balance.amount), balance.currency, baseCurrency, snapshot.data.rates);
      const tags = balance.tags && balance.tags.length > 0 ? balance.tags : ['untagged'];
      tags.forEach(tag => {
        values[tag] = (values[tag] || 0) + (amount / tags.length);
      });
    });
  });

  return values;
};

const getLargestMover = (previousValues: Record<string, number>, currentValues: Record<string, number>) => {
  return Array.from(new Set([...Object.keys(previousValues), ...Object.keys(currentValues)]))
    .map(name => {
      const previous = previousValues[name] || 0;
      const current = currentValues[name] || 0;
      return {
        name,
        current,
        previous,
        delta: current - previous,
        percent: getSignedPercent(current, previous)
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
};

const getLargestShareShift = (previousValues: Record<string, number>, currentValues: Record<string, number>) => {
  const previousTotal = Object.values(previousValues).reduce((sum, value) => sum + value, 0);
  const currentTotal = Object.values(currentValues).reduce((sum, value) => sum + value, 0);

  return Array.from(new Set([...Object.keys(previousValues), ...Object.keys(currentValues)]))
    .map(name => {
      const previousShare = previousTotal > 0 ? ((previousValues[name] || 0) / previousTotal) * 100 : 0;
      const currentShare = currentTotal > 0 ? ((currentValues[name] || 0) / currentTotal) * 100 : 0;
      return {
        name,
        previousShare,
        currentShare,
        shareDelta: currentShare - previousShare,
        valueDelta: (currentValues[name] || 0) - (previousValues[name] || 0)
      };
    })
    .sort((a, b) => Math.abs(b.shareDelta) - Math.abs(a.shareDelta))[0];
};

const getNewLargestEntry = (previousValues: Record<string, number>, currentValues: Record<string, number>) => {
  return Object.entries(currentValues)
    .filter(([name, value]) => !previousValues[name] && value > 1)
    .sort((a, b) => b[1] - a[1])[0];
};

const addCandidate = (items: FeedItem[], item: FeedItem | null) => {
  if (item) items.push(item);
};

const buildHighlightItems = (snapshots: ParsedSnapshot[], baseCurrency: string) => {
  const chronological = [...snapshots].sort((a, b) => a.month.localeCompare(b.month));
  const totals = chronological.map(snapshot => calculateTotals(snapshot, baseCurrency).totalBase);
  const flowByMonth = chronological.map((snapshot, index) => {
    const previous = index > 0 ? chronological[index - 1] : null;
    return previous ? calculateFlowDecomposition(snapshot, previous, baseCurrency) : { organicDelta: 0, fxImpactDelta: 0 };
  });

  const totalDeltas = totals.slice(1).map((total, index) => Math.abs(total - totals[index]));
  const organicDeltas = flowByMonth.map(flow => Math.abs(flow.organicDelta));
  const fxDeltas = flowByMonth.map(flow => Math.abs(flow.fxImpactDelta));
  const medianTotalDelta = median(totalDeltas);
  const medianOrganicDelta = median(organicDeltas);
  const medianFxDelta = median(fxDeltas);
  const items: FeedItem[] = [];

  chronological.forEach((snapshot, index) => {
    extractComments(snapshot).forEach((comment, commentIndex) => {
      items.push({
        id: `${snapshot.month}-comment-${commentIndex}`,
        month: snapshot.month,
        kind: 'comment',
        title: getCommentTitle(comment),
        text: comment.text,
        score: 10_000 + commentIndex,
        tone: 'comment',
        comment,
        targetOrgName: comment.orgName
      });
    });

    if (index === 0) return;

    const previous = chronological[index - 1];
    const previousTotal = totals[index - 1];
    const currentTotal = totals[index];
    const totalDelta = currentTotal - previousTotal;
    const flow: FlowDecomposition = flowByMonth[index];
    const absoluteTotal = Math.max(currentTotal, previousTotal, 1);
    const monthlyCandidates: FeedItem[] = [];

    const totalThreshold = Math.max(
      absoluteTotal * HIGHLIGHT_RULES.totalDeltaPercent,
      medianTotalDelta * HIGHLIGHT_RULES.totalDeltaMedianMultiplier,
      1
    );
    addCandidate(monthlyCandidates, Math.abs(totalDelta) >= totalThreshold ? {
      id: `${snapshot.month}-total-delta`,
      month: snapshot.month,
      kind: 'highlight',
      title: totalDelta > 0 ? 'Net worth jumped' : 'Net worth dropped',
      text: `${formatMoney(totalDelta, baseCurrency)} overall change versus previous snapshot.`,
      meta: `${formatPercent(getSignedPercent(currentTotal, previousTotal))} month over month`,
      score: 500 + (Math.abs(totalDelta) / totalThreshold) * 80,
      tone: getToneForValue(totalDelta)
    } : null);

    const organicThreshold = Math.max(
      absoluteTotal * HIGHLIGHT_RULES.organicDeltaPercent,
      medianOrganicDelta * HIGHLIGHT_RULES.organicDeltaMedianMultiplier,
      1
    );
    addCandidate(monthlyCandidates, Math.abs(flow.organicDelta) >= organicThreshold ? {
      id: `${snapshot.month}-organic-delta`,
      month: snapshot.month,
      kind: 'highlight',
      title: flow.organicDelta > 0 ? 'Large organic increase' : 'Large organic decrease',
      text: `${formatMoney(flow.organicDelta, baseCurrency)} from balance changes, excluding exchange-rate movement.`,
      score: 560 + (Math.abs(flow.organicDelta) / organicThreshold) * 90,
      tone: getToneForValue(flow.organicDelta)
    } : null);

    const fxThreshold = Math.max(
      absoluteTotal * HIGHLIGHT_RULES.fxDeltaPercent,
      medianFxDelta * HIGHLIGHT_RULES.fxDeltaMedianMultiplier,
      1
    );
    addCandidate(monthlyCandidates, Math.abs(flow.fxImpactDelta) >= fxThreshold ? {
      id: `${snapshot.month}-fx-delta`,
      month: snapshot.month,
      kind: 'highlight',
      title: 'FX impact stood out',
      text: `${formatMoney(flow.fxImpactDelta, baseCurrency)} came from exchange-rate movement.`,
      score: 540 + (Math.abs(flow.fxImpactDelta) / fxThreshold) * 85,
      tone: getToneForValue(flow.fxImpactDelta)
    } : null);

    const previousOrgValues = buildOrganizationValues(previous, baseCurrency);
    const currentOrgValues = buildOrganizationValues(snapshot, baseCurrency);
    const newOrg = getNewLargestEntry(previousOrgValues, currentOrgValues);
    const newEntryThreshold = Math.max(
      absoluteTotal * HIGHLIGHT_RULES.newEntryPercent,
      medianTotalDelta * HIGHLIGHT_RULES.newEntryMedianMultiplier,
      1
    );
    addCandidate(monthlyCandidates, newOrg && newOrg[1] >= newEntryThreshold ? {
      id: `${snapshot.month}-new-org-${newOrg[0]}`,
      month: snapshot.month,
      kind: 'highlight',
      title: 'New organization appeared',
      text: `${newOrg[0]} now holds ${formatMoney(newOrg[1], baseCurrency).replace('+', '')}.`,
      score: 620 + (newOrg[1] / absoluteTotal) * 100,
      tone: 'neutral',
      targetOrgName: newOrg[0],
      entities: [{ kind: 'organization', name: newOrg[0] }]
    } : null);

    const orgMover = getLargestMover(previousOrgValues, currentOrgValues);
    const orgThreshold = Math.max(
      absoluteTotal * HIGHLIGHT_RULES.orgMoverPercent,
      medianTotalDelta * HIGHLIGHT_RULES.orgMoverMedianMultiplier,
      1
    );
    addCandidate(monthlyCandidates, orgMover && Math.abs(orgMover.delta) >= orgThreshold ? {
      id: `${snapshot.month}-org-${orgMover.name}`,
      month: snapshot.month,
      kind: 'highlight',
      title: `${orgMover.name} moved noticeably`,
      text: `${formatMoney(orgMover.delta, baseCurrency)} versus previous snapshot.`,
      meta: orgMover.previous > 0 ? `${formatPercent(orgMover.percent)} for this organization` : 'New or reactivated balance',
      score: 520 + (Math.abs(orgMover.delta) / orgThreshold) * 70,
      tone: getToneForValue(orgMover.delta),
      targetOrgName: orgMover.name,
      entities: [{ kind: 'organization', name: orgMover.name }]
    } : null);

    const previousCurrencyValues = buildCurrencyValues(previous, baseCurrency);
    const currentCurrencyValues = buildCurrencyValues(snapshot, baseCurrency);
    const newCurrency = getNewLargestEntry(previousCurrencyValues, currentCurrencyValues);
    addCandidate(monthlyCandidates, newCurrency && newCurrency[1] >= newEntryThreshold ? {
      id: `${snapshot.month}-new-currency-${newCurrency[0]}`,
      month: snapshot.month,
      kind: 'highlight',
      title: 'New currency exposure',
      text: `${newCurrency[0]} appeared with ${formatMoney(newCurrency[1], baseCurrency).replace('+', '')} equivalent.`,
      score: 590 + (newCurrency[1] / absoluteTotal) * 100,
      tone: 'neutral',
      entities: [{ kind: 'currency', name: newCurrency[0] }]
    } : null);

    const previousTagValues = buildTagValues(previous, baseCurrency);
    const currentTagValues = buildTagValues(snapshot, baseCurrency);
    const tagShift = getLargestShareShift(previousTagValues, currentTagValues);
    addCandidate(monthlyCandidates, tagShift
      && tagShift.name !== 'untagged'
      && Math.abs(tagShift.shareDelta) >= HIGHLIGHT_RULES.tagShareDeltaPercentPoints
      && Math.abs(tagShift.valueDelta) >= absoluteTotal * HIGHLIGHT_RULES.tagShareValuePercent ? {
      id: `${snapshot.month}-tag-${tagShift.name}`,
      month: snapshot.month,
      kind: 'highlight',
      title: `${tagShift.name} share shifted`,
      text: `${tagShift.previousShare.toFixed(1)}% -> ${tagShift.currentShare.toFixed(1)}% of portfolio.`,
      meta: `${formatMoney(tagShift.valueDelta, baseCurrency)} value change`,
      score: 530 + Math.abs(tagShift.shareDelta) * 8,
      tone: getToneForValue(tagShift.valueDelta),
      entities: [{ kind: 'tag', name: tagShift.name }]
    } : null);

    monthlyCandidates.forEach(item => {
      item.entities = [...(item.entities || []), { kind: 'currency', name: baseCurrency }];
    });

    monthlyCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, HIGHLIGHT_RULES.maxAutoHighlightsPerMonth)
      .forEach(item => items.push(item));
  });

  return items.sort((a, b) => {
    const monthResult = b.month.localeCompare(a.month);
    if (monthResult !== 0) return monthResult;
    if (a.kind !== b.kind) return a.kind === 'comment' ? -1 : 1;
    return b.score - a.score;
  });
};

const buildFeedPeriods = (snapshots: ParsedSnapshot[], feedItems: FeedItem[], mode: FeedMode): FeedPeriod[] => {
  const itemsByMonth = feedItems.reduce<Record<string, FeedItem[]>>((result, item) => {
    if (!result[item.month]) result[item.month] = [];
    result[item.month].push(item);
    return result;
  }, {});

  const chronological = [...snapshots].sort((a, b) => a.month.localeCompare(b.month));
  const previousByMonth = new Map<string, ParsedSnapshot | null>();
  chronological.forEach((snapshot, index) => {
    previousByMonth.set(snapshot.month, index > 0 ? chronological[index - 1] : null);
  });

  return [...snapshots]
    .sort((a, b) => b.month.localeCompare(a.month))
    .map(snapshot => {
      const monthItems = itemsByMonth[snapshot.month] || [];
      const comments = monthItems
        .filter(item => item.kind === 'comment')
        .sort((a, b) => a.score - b.score);
      const highlights = mode === 'comments'
        ? []
        : monthItems
          .filter(item => item.kind === 'highlight')
          .sort((a, b) => b.score - a.score);

      return {
        month: snapshot.month,
        snapshot,
        previousSnapshot: previousByMonth.get(snapshot.month) || null,
        comments,
        highlights
      };
    })
    .filter(period => period.comments.length > 0 || period.highlights.length > 0);
};

export default function CommentFeed() {
  const { settings } = useSettings();
  const { snapshots, loading } = useSnapshots({ sort: 'asc' });
  const baseCurrency = settings.baseCurrency || 'RUB';
  const navigate = useNavigate();
  const [mode, setMode] = useState<FeedMode>('all');
  const [diffModalData, setDiffModalData] = useState<{ current: ParsedSnapshot; previous: ParsedSnapshot | null } | null>(null);
  const [onlyChanges, setOnlyChanges] = useState(true);
  useEscapeToDashboard({ blocked: Boolean(diffModalData) });

  const feedItems = useMemo(() => buildHighlightItems(snapshots, baseCurrency), [snapshots, baseCurrency]);
  const commentCount = feedItems.filter(item => item.kind === 'comment').length;
  const highlightCount = feedItems.filter(item => item.kind === 'highlight').length;
  const visiblePeriods = useMemo(() => buildFeedPeriods(snapshots, feedItems, mode), [snapshots, feedItems, mode]);

  useEffect(() => {
    if (!diffModalData) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTextInputTarget(event.target)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setDiffModalData(null);
      } else if (event.code === 'KeyD') {
        event.preventDefault();
        setOnlyChanges(previous => !previous);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [diffModalData]);

  const openSnapshot = (item: FeedItem) => {
    if (item.targetOrgName) {
      navigate(`/snapshot/${item.month}?focusOrg=${encodeURIComponent(item.targetOrgName)}`);
      return;
    }
    navigate(`/snapshot/${item.month}`);
  };

  const renderFeedItem = (item: FeedItem) => {
    const isHighlight = item.kind === 'highlight';
    const badgeColor = isHighlight ? HIGHLIGHT_BADGE_COLOR : getToneColor(item.tone);
    const badgeBorderColor = isHighlight ? HIGHLIGHT_BADGE_BORDER : getToneBorderColor(item.tone);

    return (
      <article key={item.id} className="glass-panel" style={{ padding: '16px 18px', borderLeft: `3px solid ${getToneColor(item.tone)}` }}>
        <div className="flex justify-between gap-4" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '7px', fontSize: '15px', margin: 0, marginBottom: '6px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                {isHighlight ? renderColoredEntities(item.title, item.entities) : renderItemTitle(item)}
                {!isHighlight && renderCommentTags(item.comment)}
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: badgeColor,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${badgeBorderColor}`,
                borderLeftWidth: '1px',
                padding: '2px 6px',
                borderRadius: '4px',
                lineHeight: 1.2,
                marginLeft: '3px',
                position: 'relative'
              }}>
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '-8px',
                    top: '-1px',
                    bottom: '-1px',
                    width: '1px',
                    background: 'var(--glass-border)'
                  }}
                />
                {isHighlight ? 'HIGHLIGHT' : 'COMMENT'}
              </span>
            </h3>

            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.5 }}>
              {isHighlight ? renderColoredEntities(item.text, item.entities) : item.text}
            </div>
            {item.meta && (
              <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                {isHighlight ? renderColoredEntities(item.meta, item.entities) : item.meta}
              </div>
            )}
          </div>

          <button
            className="btn"
            title={item.targetOrgName ? 'Edit focused snapshot' : 'Edit'}
            style={{ padding: '8px', flexShrink: 0, color: 'var(--text-secondary)' }}
            onClick={() => openSnapshot(item)}
          >
            <Edit size={16} />
          </button>
        </div>
      </article>
    );
  };

  if (loading) return <div>Loading feed...</div>;

  return (
    <div>
      <StickyPageHeader>
        <div className="flex items-center gap-4">
          <Link to="/" className="btn" title="Back to dashboard"><ArrowLeft size={18} /></Link>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Financial Feed</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
              {commentCount} comments · {highlightCount} auto highlights
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', padding: '4px', gap: '4px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
          <button
            className="btn"
            style={{
              padding: '7px 12px',
              background: mode === 'all' ? 'var(--accent)' : 'transparent',
              borderColor: mode === 'all' ? 'var(--accent)' : 'transparent',
              color: mode === 'all' ? '#fff' : 'var(--text-secondary)'
            }}
            onClick={() => setMode('all')}
          >
            <TrendingUp size={15} /> All
          </button>
          <button
            className="btn"
            style={{
              padding: '7px 12px',
              background: mode === 'comments' ? 'var(--accent)' : 'transparent',
              borderColor: mode === 'comments' ? 'var(--accent)' : 'transparent',
              color: mode === 'comments' ? '#fff' : 'var(--text-secondary)'
            }}
            onClick={() => setMode('comments')}
          >
            <MessageSquare size={15} /> Only comments
          </button>
        </div>
      </StickyPageHeader>

      {visiblePeriods.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          {mode === 'comments' ? 'No comments yet.' : 'No feed events yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visiblePeriods.map(period => (
            <section key={period.month} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  padding: '10px 2px',
                  borderBottom: '1px solid var(--glass-border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Calendar size={18} style={{ color: 'var(--text-secondary)' }} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{period.month}</h3>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {period.comments.length} comments · {period.highlights.length} highlights
                  </span>
                </div>

                <button
                  className="btn"
                  style={{ padding: '7px 10px', fontSize: '13px' }}
                  title={period.previousSnapshot
                    ? `Compare with ${period.previousSnapshot.month}`
                    : snapshots.length > 1 ? 'Choose a comparison period' : 'Not enough snapshots to compare'}
                  disabled={snapshots.length < 2}
                  onClick={() => setDiffModalData({ current: period.snapshot, previous: period.previousSnapshot })}
                >
                  <ArrowLeftRight size={15} /> Diff
                </button>
              </div>

              {period.highlights.map(renderFeedItem)}
              {period.comments.map(renderFeedItem)}
            </section>
          ))}
        </div>
      )}

      {diffModalData && (
        <SnapshotDiffModal
          current={diffModalData.current}
          previous={diffModalData.previous}
          snapshots={snapshots}
          onlyChanges={onlyChanges}
          onOnlyChangesChange={setOnlyChanges}
          onClose={() => setDiffModalData(null)}
        />
      )}
    </div>
  );
}
