import { useEffect, useState } from 'react';
import { API_URL } from '../types';
import type { ParsedSnapshot, Snapshot } from '../types';
import { normalizeSnapshotRates } from '../lib/finance';

type SortDirection = 'asc' | 'desc';

type UseSnapshotsOptions = {
  sort?: SortDirection;
  baseCurrency: string;
};

const parseSnapshot = (snapshot: Snapshot, baseCurrency: string): ParsedSnapshot => normalizeSnapshotRates({
  ...snapshot,
  data: JSON.parse(snapshot.data)
}, baseCurrency);

const sortSnapshots = (snapshots: ParsedSnapshot[], direction: SortDirection) => {
  return [...snapshots].sort((a, b) => {
    const result = a.month.localeCompare(b.month);
    return direction === 'asc' ? result : -result;
  });
};

export function useSnapshots(options: UseSnapshotsOptions) {
  const { sort = 'asc', baseCurrency } = options;
  const [snapshots, setSnapshots] = useState<ParsedSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/snapshots`)
      .then(res => res.json())
      .then((data: Snapshot[]) => {
        if (cancelled) return;
        setSnapshots(sortSnapshots((data || []).map(snapshot => parseSnapshot(snapshot, baseCurrency)), sort));
      })
      .catch(err => {
        if (cancelled) return;
        console.error(err);
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sort, baseCurrency]);

  return { snapshots, setSnapshots, loading, error };
}
