import { useEffect, useState } from 'react';
import { API_URL, type AppSettings, type Snapshot, type SnapshotData } from '../../types';
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

const withNormalizedSnapshotData = (
  snapshotData: SnapshotData,
  settings: AppSettings,
  refreshOrganizationMetadata = false,
  excludeArchived = false
): SnapshotData => ({
  ...snapshotData,
  organizations: (snapshotData.organizations || [])
    .filter(org => {
      if (!excludeArchived) return true;
      const configured = settings.organizations.find(organization => (
        organization.name.trim().toLocaleLowerCase() === org.name.trim().toLocaleLowerCase()
      ));
      return !configured?.archivedAt;
    })
    .map(org => {
      const configured = settings.organizations.find(organization => (
        organization.name.trim().toLocaleLowerCase() === org.name.trim().toLocaleLowerCase()
      ));
      return {
        ...org,
        country: refreshOrganizationMetadata ? configured?.country || org.country : org.country || configured?.country,
        balances: org.balances.map(balance => ({ ...balance, tags: balance.tags || [] }))
      };
    })
});

const parseSnapshotData = (
  snapshot: Snapshot,
  settings: AppSettings,
  refreshOrganizationMetadata = false,
  excludeArchived = false
) => withNormalizedSnapshotData(JSON.parse(snapshot.data), settings, refreshOrganizationMetadata, excludeArchived);

export function useSnapshotEditorData({ isCopy, isNew, month, sourceMonth }: UseSnapshotEditorDataProps) {
  const { settings, loading: settingsLoading } = useSettings();
  const [currentMonth, setCurrentMonth] = useState('');
  const [originalMonth, setOriginalMonth] = useState('');
  const [data, setData] = useState<SnapshotData>(initialSnapshotData);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [latestSnapshot, setLatestSnapshot] = useState<SnapshotData | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);

  useEffect(() => {
    if (settingsLoading) return;
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
            if (!cancelled && snapshot.data) {
              setData(stripCommentsFromSnapshot(parseSnapshotData(snapshot, settings, true, true)));
            }
          } else {
            setData(initialSnapshotData);
            const snapshots: Snapshot[] = await fetch(`${API_URL}/snapshots`).then(res => res.json());
            if (!cancelled && snapshots?.length > 0) setLatestSnapshot(parseSnapshotData(snapshots[0], settings));
          }
        } else {
          setCurrentMonth(month || '');
          setOriginalMonth(month || '');
          const snapshot: Snapshot = await fetch(`${API_URL}/snapshots/${month}`).then(res => res.json());
          if (!cancelled && snapshot.data) setData(parseSnapshotData(snapshot, settings));
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
  }, [month, sourceMonth, isNew, isCopy, settings, settingsLoading]);

  return { currentMonth, data, durationSeconds, latestSnapshot, loading: settingsLoading || snapshotLoading, originalMonth, settings, settingsLoaded: !settingsLoading, setCurrentMonth, setData, setDurationSeconds };
}
