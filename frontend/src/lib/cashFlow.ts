import type { FlowEntry } from '../types';

export type FlowCurrencySummary = {
  incoming: number;
  incomingNet: number;
  outgoing: number;
  tax: number;
  net: number;
};

export type FlowSummary = Array<[string, FlowCurrencySummary]>;

export const calculateFlowTax = (
  entry: Pick<FlowEntry, 'direction' | 'amount' | 'taxRate'>
) => entry.direction === 'in' ? entry.amount * (entry.taxRate || 0) / 100 : 0;

export const summarizeFlowEntries = (entries: FlowEntry[]): FlowSummary => {
  const byCurrency = new Map<string, FlowCurrencySummary>();

  entries.forEach(entry => {
    const total = byCurrency.get(entry.currency) || {
      incoming: 0,
      incomingNet: 0,
      outgoing: 0,
      tax: 0,
      net: 0
    };

    if (entry.direction === 'in') {
      total.incoming += entry.amount;
      total.tax += calculateFlowTax(entry);
    } else {
      total.outgoing += entry.amount;
    }

    total.incomingNet = total.incoming - total.tax;
    total.net = total.incomingNet - total.outgoing;
    byCurrency.set(entry.currency, total);
  });

  return Array.from(byCurrency.entries()).sort(([left], [right]) => left.localeCompare(right));
};

