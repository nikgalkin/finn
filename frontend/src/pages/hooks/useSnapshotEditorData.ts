import { useEffect, useState } from 'react';
import { API_URL, type Snapshot, type SnapshotData } from '../../types';
import { useSettings } from '../../hooks/useSettings';

const initialSnapshotData: SnapshotData = { comment: '', rates: { USD: 90, EUR: 100 }, organizations: [] };

type UseSnapshotEditorDataProps = { isCopy: boolean; isNew: boolean; month?: string; sourceMonth?: string };

export const stripCommentsFromSnapshot = (snapshotData: SnapshotData): SnapshotData => ({
  ...snapshotData,
  comment: '',
  organizations: snapshotData.organizations.map(org => ({
    ...org,
    comment: '',
    balances: org.balances.map(balance => ({ ...balance, comment: '', tags: balance.tags || [] }))
  }))
});
//
const withNormalizedTags = (snapshotData: SnapshotData): SnapshotData => ({
  ...snapshotData,
  organizations: (snapshotData.organizations || []).map(org => ({ ...org, balances: org.balances.map(balance => ({ ...balance, tags: balance.tags || [] })) }))
});

const parseSnapshotData = (snapshot: Snapshot) => withNormalizedTags(JSON.parse(snapshot.data));

export function useSnapshotEditorData({ isCopy, isNew, month, sourceMonth }: UseSnapshotEditorDataProps) {
  const { settings, loading: settingsLoading } = useSettings();
  const [currentMonth, setCurrentMonth] = useState('');
  const [originalMonth, setOriginalMonth] = useState('');
  const [data, setData] = useState<SnapshotData>(initialSnapshotData);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [latestSnapshot, setLatestSnapshot] = useState<SnapshotData | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setSnapshotLoading(true);
      setLatestSnapshot(null);
      setDurationSeconds(0);

      try {
        if (isNew || isCopy) {
          const now = new Date();
          setCurrentMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
          setOriginalMonth('');

          if (sourceMonth) {
            const snapshot: Snapshot = await fetch(`${API_URL}/snapshots/${sourceMonth}`).then(res => res.json());
            if (!cancelled && snapshot.data) setData(stripCommentsFromSnapshot(JSON.parse(snapshot.data)));
          } else {
            setData(initialSnapshotData);
            const snapshots: Snapshot[] = await fetch(`${API_URL}/snapshots`).then(res => res.json());
            if (!cancelled && snapshots?.length > 0) setLatestSnapshot(parseSnapshotData(snapshots[0]));
          }
        } else {
          setCurrentMonth(month || '');
          setOriginalMonth(month || '');
          const snapshot: Snapshot = await fetch(`${API_URL}/snapshots/${month}`).then(res => res.json());
          if (!cancelled && snapshot.data) setData(parseSnapshotData(snapshot));
          if (!cancelled && snapshot.duration_seconds) setDurationSeconds(snapshot.duration_seconds);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setSnapshotLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [month, sourceMonth, isNew, isCopy]);

  return { currentMonth, data, durationSeconds, latestSnapshot, loading: settingsLoading || snapshotLoading, originalMonth, settings, settingsLoaded: !settingsLoading, setCurrentMonth, setData, setDurationSeconds };
}
