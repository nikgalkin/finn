import { useEffect, useState } from 'react';
import { API_URL } from '../types';
import type { FlowEntry } from '../types';

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
  const [entries, setEntries] = useState<FlowEntry[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`${API_URL}/flows`)
      .then(async response => {
        if (!response.ok) throw new Error('Could not load Cash Flow.');
        return response.json() as Promise<FlowEntry[]>;
      })
      .then(data => {
        if (!cancelled) setEntries(normalizeFlowEntries(data || []));
      })
      .catch(fetchError => {
        if (cancelled) return;
        const nextError = fetchError instanceof Error ? fetchError : new Error('Could not load Cash Flow.');
        setError(nextError);
        console.error(nextError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [enabled]);

  return { entries, error, loading };
}
