import { useEffect, useState } from 'react';
import { API_URL } from '../types';
import type { ParsedSnapshot, Snapshot } from '../types';

type SortDirection = 'asc' | 'desc';

type UseSnapshotsOptions = {
  sort?: SortDirection;
};

const parseSnapshot = (snapshot: Snapshot): ParsedSnapshot => ({
  ...snapshot,
  data: JSON.parse(snapshot.data)
});

const sortSnapshots = (snapshots: ParsedSnapshot[], direction: SortDirection) => {
  return [...snapshots].sort((a, b) => {
    const result = a.month.localeCompare(b.month);
    return direction === 'asc' ? result : -result;
  });
};

export function useSnapshots(options: UseSnapshotsOptions = {}) {
  const { sort = 'asc' } = options;
  const [snapshots, setSnapshots] = useState<ParsedSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_URL}/snapshots`)
      .then(res => res.json())
      .then((data: Snapshot[]) => {
        if (cancelled) return;
        setSnapshots(sortSnapshots((data || []).map(parseSnapshot), sort));
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
  }, [sort]);

  return { snapshots, setSnapshots, loading, error };
}
