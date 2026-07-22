import { useCallback, useEffect, useState } from 'react';
import type { SnapshotData } from '../../types';
import {
  readSnapshotDraft,
  removeSnapshotDraft,
  writeSnapshotDraft,
  type SnapshotDraft
} from '../../lib/snapshotDraftStorage';
import { summarizeSnapshotDraftChanges } from '../../lib/snapshotDraftDiff';

interface UseSnapshotDraftProps {
  draftKey: string;
  isDirty: boolean;
  data: SnapshotData;
  currentMonth: string;
  durationSeconds: number;
  isNew: boolean;
  baseline: {
    data: SnapshotData;
    currentMonth: string;
  } | null;
}

export function useSnapshotDraft({
  draftKey,
  isDirty,
  data,
  currentMonth,
  durationSeconds,
  isNew,
  baseline
}: UseSnapshotDraftProps) {
  const [draftState, setDraftState] = useState<{ key: string; draft: SnapshotDraft | null }>(() => ({
    key: draftKey,
    draft: readSnapshotDraft(draftKey)
  }));
  const draftToRestore = draftState.key === draftKey ? draftState.draft : null;
  const setDraftToRestore = useCallback((draft: SnapshotDraft | null) => {
    setDraftState({ key: draftKey, draft });
  }, [draftKey]);

  useEffect(() => {
    setDraftState({ key: draftKey, draft: readSnapshotDraft(draftKey) });
  }, [draftKey]);

  useEffect(() => {
    if (!isDirty) return;
    if (draftToRestore) return;
    if (isNew && data.organizations.length === 0) return;

    writeSnapshotDraft(draftKey, {
      data,
      currentMonth,
      durationSeconds,
      timestamp: Date.now(),
      changeSummary: baseline ? summarizeSnapshotDraftChanges(baseline, { data, currentMonth }) : undefined
    });
  }, [isDirty, data, currentMonth, durationSeconds, draftKey, isNew, draftToRestore, baseline]);

  const discardDraft = useCallback(() => {
    removeSnapshotDraft(draftKey);
    setDraftToRestore(null);
  }, [draftKey, setDraftToRestore]);

  return {
    draftToRestore,
    setDraftToRestore,
    discardDraft
  };
}
