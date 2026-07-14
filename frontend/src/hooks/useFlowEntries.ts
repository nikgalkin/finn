import { useEffect, useState } from 'react';
import { API_URL } from '../types';
import type { FlowEntry } from '../types';

const normalizeFlowEntries = (entries: FlowEntry[]) => [...entries]
  .map(entry => ({ ...entry, taxRate: entry.taxRate || 0 }))
  .sort((left, right) => right.month.localeCompare(left.month) || right.id - left.id);

export function useFlowEntries(enabled: boolean) {
  const [entries, setEntries] = useState<FlowEntry[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setError(null);
      return;
    }

    let cancelled = false;
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
      });

    return () => { cancelled = true; };
  }, [enabled]);

  return { entries, error };
}

