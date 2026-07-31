import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { NetWorthCardChoice, NetWorthStripChoice } from '../../lib/visualPreferences';
import { allocationColor } from '../../lib/chartColors';
import { QuickHoverTooltip } from './QuickHoverTooltip';
import { ScrollForMore } from './ScrollForMore';
import { formatCompact, formatExchangeRate, formatNumber, formatPercent, formatSigned, getDeltaColor } from '../../lib/format';

export type NetWorthDelta = {
  amount: number;
  percent: number;
};

export type NetWorthAllocation = {
  name: string;
  value: number;
};

export type NetWorthFlow = {
  previousMonth: string;
  previousTotal: number;
  deposits: number;
  fxImpact: number;
};

export type NetWorthHistoryPoint = {
  month: string;
  delta: number;
  percent: number;
};

export type NetWorthPanelData = {
  month: string;
  baseCurrency: string;
  secondaryCurrency: string | null;
  totalBase: number;
  totalSecondary: number;
  secondaryRate: number | null;
  monthDelta: NetWorthDelta | null;
  yearDelta: NetWorthDelta | null;
  organizations: NetWorthAllocation[];
  snapshots: number;
  allocation: NetWorthAllocation[];
  flow: NetWorthFlow | null;
  history: NetWorthHistoryPoint[];
};

type DashboardNetWorthPanelProps = {
  variant: NetWorthCardChoice;
  strip?: NetWorthStripChoice;
  data: NetWorthPanelData;
};

const STABLE_THRESHOLD = 1;

const deltaTone = (delta: NetWorthDelta | null) => {
  if (!delta || Math.abs(delta.amount) < STABLE_THRESHOLD) return 'flat';
  return delta.amount > 0 ? 'positive' : 'negative';
};

const deltaAmountLabel = (delta: NetWorthDelta | null) => (
  !delta || Math.abs(delta.amount) < STABLE_THRESHOLD ? 'Stable' : formatSigned(delta.amount)
);

const deltaPercentLabel = (delta: NetWorthDelta | null) => (
  !delta || Math.abs(delta.amount) < STABLE_THRESHOLD ? '' : formatPercent(delta.percent, 1)
);

const compactDeltaAmountLabel = (delta: NetWorthDelta | null) => {
  if (!delta) return '—';
  if (Math.abs(delta.amount) < STABLE_THRESHOLD) return 'Stable';
  return `${delta.amount > 0 ? '+' : ''}${formatCompact(delta.amount)}`;
};

const deltaColor = (delta: NetWorthDelta | null) => (
  !delta || Math.abs(delta.amount) < STABLE_THRESHOLD ? undefined : getDeltaColor(delta.amount)
);

const trendIcon = (delta: NetWorthDelta | null) => {
  const tone = deltaTone(delta);
  return tone === 'positive' ? TrendingUp : tone === 'negative' ? TrendingDown : Minus;
};

function DeltaChip({ delta, caption }: { delta: NetWorthDelta | null; caption: string }) {
  if (!delta) return null;

  const tone = deltaTone(delta);
  const Icon = trendIcon(delta);
  const percent = deltaPercentLabel(delta);

  return (
    <span className={`dashboard-net-worth-chip is-${tone}`}>
      <Icon size={13} aria-hidden="true" />
      <strong>{deltaAmountLabel(delta)}</strong>
      {percent && <em>{percent}</em>}
      <span>{caption}</span>
    </span>
  );
}

function ClassicVariant({ data }: { data: NetWorthPanelData }) {
  return (
    <div className="dashboard-net-worth-classic">
      <div className="dashboard-net-worth-classic-heading">
        <h3 className="dashboard-net-worth-label">Total Net Worth</h3>
        {data.secondaryCurrency && data.secondaryRate && (
          <span>
            1 {data.secondaryCurrency} = {formatExchangeRate(data.secondaryRate)} {data.baseCurrency}
          </span>
        )}
      </div>
      <MoneyStack data={data} inline />
      <div className="dashboard-net-worth-classic-meta">
        <div className="dashboard-net-worth-classic-metric">
          <span>Month</span>
          <div>
            <strong style={{ color: deltaColor(data.monthDelta) }}>{compactDeltaAmountLabel(data.monthDelta)}</strong>
            <small>{deltaPercentLabel(data.monthDelta)}</small>
          </div>
        </div>
        <div className="dashboard-net-worth-classic-metric">
          <span>Year</span>
          <div>
            <strong style={{ color: deltaColor(data.yearDelta) }}>{compactDeltaAmountLabel(data.yearDelta)}</strong>
            <small>{deltaPercentLabel(data.yearDelta)}</small>
          </div>
        </div>
        <div className="dashboard-net-worth-classic-metric">
          <span>Organizations</span>
          <div><strong>{data.organizations.length}</strong></div>
        </div>
        <div className="dashboard-net-worth-classic-metric">
          <span>Snapshots</span>
          <div><strong>{data.snapshots}</strong></div>
        </div>
      </div>
    </div>
  );
}

function MoneyAmount({ value, className, tooltip }: { value: number; className: string; tooltip: string }) {
  return (
    <QuickHoverTooltip text={tooltip} className="dashboard-net-worth-money-anchor" placement="pointer">
      <span className={className}>{formatCompact(value)}</span>
    </QuickHoverTooltip>
  );
}

function MoneyStack({ data, inline = false }: { data: NetWorthPanelData; inline?: boolean }) {
  if (!inline) {
    return (
      <div className="dashboard-net-worth-money">
        <span className="dashboard-net-worth-money-amount">{formatNumber(data.totalBase)}</span>
        <small>{data.baseCurrency}</small>
        {data.secondaryCurrency && (
          <>
            <span className="dashboard-net-worth-money-amount is-secondary">
              <span className="dashboard-net-worth-money-approx">≈</span>{formatNumber(data.totalSecondary)}
            </span>
            <small className="is-secondary">{data.secondaryCurrency}</small>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard-net-worth-money is-inline">
      <span className="dashboard-net-worth-money-pair">
        <MoneyAmount
          value={data.totalBase}
          className="dashboard-net-worth-money-amount"
          tooltip={`Base currency\n${formatNumber(data.totalBase)} ${data.baseCurrency}`}
        />
        <small>{data.baseCurrency}</small>
      </span>
      {data.secondaryCurrency && (
        <span className="dashboard-net-worth-money-pair">
          <span className="dashboard-net-worth-money-divider" aria-hidden="true">/</span>
          <MoneyAmount
            value={data.totalSecondary}
            className="dashboard-net-worth-money-amount is-secondary"
            tooltip={`Secondary currency\n${formatNumber(data.totalSecondary)} ${data.secondaryCurrency}`}
          />
          <small className="is-secondary">{data.secondaryCurrency}</small>
        </span>
      )}
    </div>
  );
}

const ALLOCATION_VISIBLE_LIMIT = 6;
const ALLOCATION_MIN_SHARE = 2;
const ALLOCATION_OTHER_COLOR = 'rgb(var(--muted-rgb))';

type AllocationSegment = {
  key: string;
  name: string;
  value: number;
  percent: number;
  color: string;
  title: string;
};

const buildAllocationSegments = (items: NetWorthAllocation[], baseCurrency: string): AllocationSegment[] => {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return [];

  const share = (value: number) => (value / total) * 100;
  const describe = (item: NetWorthAllocation) => (
    `${item.name} — ${share(item.value).toFixed(1)}% · ${formatNumber(item.value)} ${baseCurrency}`
  );

  const segments: AllocationSegment[] = [];
  const collapsed: NetWorthAllocation[] = [];

  items.forEach((item, index) => {
    const fits = segments.length < ALLOCATION_VISIBLE_LIMIT
      && (segments.length === 0 || share(item.value) >= ALLOCATION_MIN_SHARE);

    if (fits) {
      segments.push({
        key: item.name,
        name: item.name,
        value: item.value,
        percent: share(item.value),
        color: allocationColor(index),
        title: describe(item)
      });
      return;
    }

    collapsed.push(item);
  });

  if (collapsed.length === 1) {
    const [item] = collapsed;
    segments.push({
      key: item.name,
      name: item.name,
      value: item.value,
      percent: share(item.value),
      color: allocationColor(items.indexOf(item)),
      title: describe(item)
    });
  } else if (collapsed.length > 1) {
    const value = collapsed.reduce((sum, item) => sum + item.value, 0);
    segments.push({
      key: 'allocation-other',
      name: `Other · ${collapsed.length}`,
      value,
      percent: share(value),
      color: ALLOCATION_OTHER_COLOR,
      title: collapsed.map(describe).join('\n')
    });
  }

  return segments;
};

function AllocationStrip({ data, items, label }: { data: NetWorthPanelData; items: NetWorthAllocation[]; label: string }) {
  const segments = buildAllocationSegments(items, data.baseCurrency);
  if (segments.length === 0) return null;

  return (
    <div className="dashboard-net-worth-bar-track" aria-label={label}>
      {segments.map(segment => (
        <QuickHoverTooltip
          key={segment.key}
          text={segment.title}
          className="dashboard-net-worth-bar-segment"
          placement="pointer"
          style={{ flexGrow: segment.value, backgroundColor: segment.color }}
        >
          <span className="dashboard-net-worth-bar-segment-label">
            <span className="dashboard-net-worth-bar-segment-name">{segment.name}</span>
            <strong>{segment.percent.toFixed(1)}%</strong>
          </span>
        </QuickHoverTooltip>
      ))}
    </div>
  );
}

const FLOW_DEPOSITS_COLOR = 'rgb(var(--success-rgb))';
const FLOW_FX_COLOR = '#818cf8';

function FlowStrip({ data }: { data: NetWorthPanelData }) {
  if (!data.flow) return null;

  const { deposits, fxImpact, previousMonth, previousTotal } = data.flow;
  const magnitude = Math.abs(deposits) + Math.abs(fxImpact);
  if (magnitude < 1) return null;

  const parts = [
    { key: 'deposits', name: 'Deposits', value: deposits, color: FLOW_DEPOSITS_COLOR },
    { key: 'fx', name: 'FX impact', value: fxImpact, color: FLOW_FX_COLOR }
  ].filter(part => Math.abs(part.value) >= 1);

  return (
    <div className="dashboard-net-worth-strip">
      <div className="dashboard-net-worth-bar-track" aria-label="What moved net worth this month">
        {parts.map(part => (
          <QuickHoverTooltip
            key={part.key}
            text={`${part.name}\n${formatSigned(part.value)} ${data.baseCurrency}`}
            className="dashboard-net-worth-bar-segment"
            placement="pointer"
            style={{ flexGrow: Math.abs(part.value), backgroundColor: part.color }}
          >
            <span className="dashboard-net-worth-bar-segment-label">
              <span className="dashboard-net-worth-bar-segment-name">{part.name}</span>
              <strong>{formatSigned(part.value)}</strong>
            </span>
          </QuickHoverTooltip>
        ))}
      </div>
      <div className="dashboard-net-worth-strip-caption">
        <span>{previousMonth} · {formatNumber(previousTotal)}</span>
        <span className="dashboard-net-worth-strip-caption-end">
          {data.month} · <strong>{formatNumber(data.totalBase)}</strong>
        </span>
      </div>
    </div>
  );
}

const HISTORY_VISIBLE_MONTHS = 24;

function HistoryStrip({ data }: { data: NetWorthPanelData }) {
  const points = data.history.slice(-HISTORY_VISIBLE_MONTHS);
  if (points.length < 2) return null;

  const peak = Math.max(...points.map(point => Math.abs(point.delta)), 1);
  const ups = points.filter(point => point.delta > 0).length;
  const best = points.reduce((top, point) => point.percent > top.percent ? point : top, points[0]);

  return (
    <div className="dashboard-net-worth-strip">
      <div className="dashboard-net-worth-history" aria-label="Monthly change history">
        {points.map(point => (
          <QuickHoverTooltip
            key={point.month}
            text={`${point.month}\n${formatSigned(point.delta)} ${data.baseCurrency} (${formatPercent(point.percent, 1)})`}
            className="dashboard-net-worth-history-anchor"
            placement="pointer"
          >
            <span
              className={`dashboard-net-worth-history-bar is-${point.delta >= 0 ? 'positive' : 'negative'}`}
              style={{ height: `${Math.max(8, (Math.abs(point.delta) / peak) * 100)}%` }}
            />
          </QuickHoverTooltip>
        ))}
      </div>
      <div className="dashboard-net-worth-strip-caption">
        <span>{points[0].month}</span>
        <span>{ups} up · {points.length - ups} down · best {formatPercent(best.percent, 1)} in {best.month}</span>
        <span className="dashboard-net-worth-strip-caption-end">{points[points.length - 1].month}</span>
      </div>
    </div>
  );
}

const MILESTONE_STEPS = [0.25, 0.5, 1];
const MILESTONE_MIN_GAP = 0.03;
const MILESTONE_PACE_MONTHS = 6;

const nextMilestone = (total: number) => {
  if (total <= 0) return null;
  const magnitude = 10 ** Math.floor(Math.log10(total));

  for (const step of MILESTONE_STEPS) {
    const size = magnitude * step;
    const candidate = Math.ceil(total / size) * size;
    const target = candidate > total ? candidate : candidate + size;
    if (target - total >= total * MILESTONE_MIN_GAP) return target;
  }

  return Math.ceil(total / magnitude) * magnitude + magnitude;
};

function GoalStrip({ data }: { data: NetWorthPanelData }) {
  const target = nextMilestone(data.totalBase);
  if (!target) return null;

  const progress = Math.min(100, (data.totalBase / target) * 100);
  const remaining = target - data.totalBase;
  const pacePoints = data.history.slice(-MILESTONE_PACE_MONTHS);
  const pace = pacePoints.length > 0
    ? pacePoints.reduce((sum, point) => sum + point.delta, 0) / pacePoints.length
    : 0;
  const months = pace > 0 ? Math.ceil(remaining / pace) : null;

  return (
    <div className="dashboard-net-worth-strip">
      <div className="dashboard-net-worth-strip-caption">
        <span>To <strong>{formatNumber(target)} {data.baseCurrency}</strong></span>
        <span className="dashboard-net-worth-strip-caption-end">
          {progress.toFixed(1)}% · {formatNumber(remaining)} to go
        </span>
      </div>
      <div className="dashboard-net-worth-goal-track">
        <span className="dashboard-net-worth-goal-fill" style={{ width: `${progress}%` }} />
      </div>
      {months !== null && (
        <div className="dashboard-net-worth-strip-caption is-muted">
          <span>At {formatSigned(pace)} {data.baseCurrency} per month — about {months} {months === 1 ? 'month' : 'months'}</span>
        </div>
      )}
    </div>
  );
}

function BarHead({ data, facts }: { data: NetWorthPanelData; facts: string }) {
  return (
    <div className="dashboard-net-worth-bar-head">
      <div className="dashboard-net-worth-bar-headline">
        <h3 className="dashboard-net-worth-label">Total Net Worth</h3>
        <MoneyStack data={data} inline />
      </div>
      <div className="dashboard-net-worth-bar-chips">
        <DeltaChip delta={data.monthDelta} caption="MoM" />
        <DeltaChip delta={data.yearDelta} caption="YoY" />
      </div>
      <span className="dashboard-net-worth-bar-facts">{facts}</span>
    </div>
  );
}

type NetWorthStripProps = {
  data: NetWorthPanelData;
  strip: NetWorthStripChoice;
  allocationItems: NetWorthAllocation[];
  allocationLabel: string;
};

function NetWorthStrip({ data, strip, allocationItems, allocationLabel }: NetWorthStripProps) {
  return (
    <>
      {strip === 'allocation' && <AllocationStrip data={data} items={allocationItems} label={allocationLabel} />}
      {strip === 'flow' && <FlowStrip data={data} />}
      {strip === 'history' && <HistoryStrip data={data} />}
      {strip === 'goal' && <GoalStrip data={data} />}
    </>
  );
}

const bestMonthFact = (data: NetWorthPanelData) => {
  if (data.history.length === 0) return null;
  const best = data.history.reduce((top, point) => point.percent > top.percent ? point : top, data.history[0]);
  return best.percent > 0 ? `best ${formatPercent(best.percent, 1)} in ${best.month}` : null;
};

const describeFacts = (data: NetWorthPanelData, parts: string[]) => [
  data.secondaryCurrency && data.secondaryRate
    ? `1 ${data.secondaryCurrency} = ${formatExchangeRate(data.secondaryRate)} ${data.baseCurrency}`
    : null,
  ...parts,
  bestMonthFact(data)
].filter(Boolean).join(' · ');

const SPLIT_LEGEND_SCROLL_ID = 'dashboard-net-worth-split-legend-scroll';
const SPLIT_LEGEND_ROW_HEIGHT = 16;
const SPLIT_LEGEND_ROW_GAP = 1;

function SplitVariant({ data, strip }: { data: NetWorthPanelData; strip: NetWorthStripChoice }) {
  const facts = describeFacts(data, [
    `${data.allocation.length} currencies`,
    `${data.snapshots} snapshots`
  ]);
  const organizationTotal = data.organizations.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="dashboard-net-worth-split">
      <div className="dashboard-net-worth-split-main">
        <BarHead data={data} facts={facts} />
        <NetWorthStrip
          data={data}
          strip={strip}
          allocationItems={data.allocation}
          allocationLabel="Currency allocation"
        />
      </div>

      <div className="dashboard-net-worth-split-legend">
        <div
          id={SPLIT_LEGEND_SCROLL_ID}
          className="dashboard-net-worth-split-legend-scroll"
          tabIndex={0}
          aria-label="Organization allocation"
        >
          {data.organizations.map((item, index) => {
            const percent = organizationTotal > 0 ? (item.value / organizationTotal) * 100 : 0;
            return (
              <div key={item.name} className="dashboard-pie-legend-row">
                <span className="dashboard-pie-legend-marker" style={{ backgroundColor: allocationColor(index) }} />
                <span className="dashboard-pie-legend-name" title={item.name}>{item.name}</span>
                <span className="dashboard-pie-legend-value">{percent.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
        <ScrollForMore
          compact
          noun={{ singular: 'organization', plural: 'organizations' }}
          scrollContainerId={SPLIT_LEGEND_SCROLL_ID}
          total={data.organizations.length}
          rowGap={SPLIT_LEGEND_ROW_GAP}
          rowHeight={SPLIT_LEGEND_ROW_HEIGHT}
        />
      </div>
    </div>
  );
}

export function DashboardNetWorthPanel({ variant, strip = 'allocation', data }: DashboardNetWorthPanelProps) {
  return (
    <section className={`glass-panel dashboard-net-worth-panel is-${variant}`}>
      {variant === 'split' && <SplitVariant data={data} strip={strip} />}
      {variant === 'classic' && <ClassicVariant data={data} />}
    </section>
  );
}
