import type { FlowEntry } from '../types';

export type FlowPeriodSeed = Omit<FlowEntry, 'id' | 'month'>;

export type FlowCurrencySummary = {
  incoming: number;
  incomingNet: number;
  outgoing: number;
  tax: number;
  net: number;
};

export type FlowSummary = Array<[string, FlowCurrencySummary]>;

export const calculateFlowTax = (
  entry: Pick<FlowEntry, 'entryType' | 'direction' | 'amount' | 'taxRate'>
) => entry.entryType !== 'transfer' && entry.direction === 'in' ? entry.amount * (entry.taxRate || 0) / 100 : 0;

export const copyFlowPeriodEntries = (entries: FlowEntry[], month: string): FlowPeriodSeed[] => entries
  .filter(entry => entry.month === month && entry.entryType !== 'transfer')
  .map(({ id: _id, month: _month, ...entry }) => ({ ...entry, taxRate: entry.taxRate || 0, comment: '' }));

export const summarizeFlowEntries = (entries: FlowEntry[]): FlowSummary => {
  const byCurrency = new Map<string, FlowCurrencySummary>();

  entries.forEach(entry => {
    if (entry.entryType === 'transfer') return;
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
