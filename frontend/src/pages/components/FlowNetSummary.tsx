import type { FlowSummary } from '../../lib/cashFlow';
import { QuickHoverTooltip } from './QuickHoverTooltip';

type FlowNetSummaryProps = {
  totals: FlowSummary;
  label?: string;
  compact?: boolean;
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 8
}).format(value);

const formatTaxNumber = (value: number) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1
}).format(value);

export function FlowNetSummary({ totals, label = 'Recorded net', compact = false }: FlowNetSummaryProps) {
  if (totals.length === 0) return null;

  return (
    <div className={`cash-flow-net-summary${compact ? ' is-compact' : ''}`}>
      {label && <span className="cash-flow-net-label">{label}</span>}
      {totals.map(([currency, total]) => {
        const displayedNet = Math.round(Math.abs(total.net));
        const state = displayedNet === 0 ? 'is-neutral' : total.net > 0 ? 'is-positive' : 'is-negative';
        const sign = displayedNet === 0 ? '' : total.net > 0 ? '+' : '−';
        const details = [
          `Incoming after tax: ${formatNumber(total.incomingNet)} ${currency}`,
          `Outgoing: ${formatNumber(total.outgoing)} ${currency}`,
          total.tax > 0 ? `Gross incoming: ${formatNumber(total.incoming)} ${currency}` : '',
          total.tax > 0 ? `Tax: ${formatTaxNumber(total.tax)} ${currency}` : ''
        ].filter(Boolean).join(' · ');

        return (
          <QuickHoverTooltip key={currency} text={details}>
            <span className={`cash-flow-net-pill ${state}`} tabIndex={0}>
              <strong>{currency}</strong>
              <i>{sign}{new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(displayedNet)}</i>
            </span>
          </QuickHoverTooltip>
        );
      })}
    </div>
  );
}
