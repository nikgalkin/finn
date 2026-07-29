import { API_URL } from '../types';
import type { FlowEntry } from '../types';
import { useAsyncResource } from './useAsyncResource';

const NO_ENTRIES: FlowEntry[] = [];

const normalizeFlowEntries = (entries: FlowEntry[]) => [...entries]
  .map(entry => ({
    ...entry,
    entryType: entry.entryType || 'external' as const,
    account: entry.account || '',
    taxRate: entry.taxRate || 0,
    toAccount: entry.toAccount || '',
    toCurrency: entry.toCurrency || '',
    toAmount: entry.toAmount || 0
  }))
  .sort((left, right) => right.month.localeCompare(left.month) || right.id - left.id);

export function useFlowEntries(enabled: boolean) {
  const { data, loading, loaded, error } = useAsyncResource(
    NO_ENTRIES,
    async () => {
      const response = await fetch(`${API_URL}/flows`);
      if (!response.ok) throw new Error('Could not load Cash Flow.');
      const data = await response.json() as FlowEntry[];
      return normalizeFlowEntries(data || []);
    },
    'flows',
    { enabled, fallbackError: 'Could not load Cash Flow.' }
  );

  return { entries: data, error, loading, loaded };
}
