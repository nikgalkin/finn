import { useEffect, useState } from 'react';
import type { SnapshotData } from '../../types';

interface UseSnapshotDraftProps {
  draftKey: string;
  isDirty: boolean;
  data: SnapshotData;
  currentMonth: string;
  durationSeconds: number;
  isNew: boolean;
}

export function useSnapshotDraft({
  draftKey,
  isDirty,
  data,
  currentMonth,
  durationSeconds,
  isNew
}: UseSnapshotDraftProps) {
  const [draftToRestore, setDraftToRestore] = useState<any>(null);

  useEffect(() => {
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        setDraftToRestore(JSON.parse(savedDraft));
      } catch {
        localStorage.removeItem(draftKey);
      }
    }
  }, [draftKey]);

  useEffect(() => {
    if (!isDirty) return;
    if (draftToRestore) return;
    if (isNew && data.organizations.length === 0) return;

    const draftData = {
      data,
      currentMonth,
      durationSeconds,
      timestamp: Date.now()
    };
    localStorage.setItem(draftKey, JSON.stringify(draftData));
  }, [isDirty, data, currentMonth, durationSeconds, draftKey, isNew, draftToRestore]);

  const discardDraft = () => {
    localStorage.removeItem(draftKey);
    setDraftToRestore(null);
  };

  return {
    draftToRestore,
    setDraftToRestore,
    discardDraft
  };
}
