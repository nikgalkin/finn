import { API_URL } from '../types';
import type { ParsedSnapshot, Snapshot } from '../types';
import { normalizeSnapshotRates } from '../lib/finance';
import { useAsyncResource } from './useAsyncResource';

type SortDirection = 'asc' | 'desc';

type UseSnapshotsOptions = {
  sort?: SortDirection;
  baseCurrency: string;
};

const NO_SNAPSHOTS: ParsedSnapshot[] = [];

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
  const { data, setData, loading, error } = useAsyncResource(
    NO_SNAPSHOTS,
    async () => {
      const response = await fetch(`${API_URL}/snapshots`);
      const snapshots = await response.json() as Snapshot[];
      return sortSnapshots((snapshots || []).map(snapshot => parseSnapshot(snapshot, baseCurrency)), sort);
    },
    `${sort}|${baseCurrency}`
  );

  return { snapshots: data, setSnapshots: setData, loading, error };
}
