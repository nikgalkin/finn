import { useCallback } from 'react';
import type { ParsedSnapshot } from '../../types';
import { useHistoryEntryState } from '../../lib/historyEntryState';

type SnapshotDiffHistoryState = {
  modal: {
    currentMonth: string;
    previousMonth: string;
    scrollTop: number;
  } | null;
  onlyChanges: boolean;
};

const INITIAL_STATE: SnapshotDiffHistoryState = {
  modal: null,
  onlyChanges: true
};

export function useSnapshotDiffHistory(viewKey: string, snapshots: ParsedSnapshot[]) {
  const [view, setView, persistView] = useHistoryEntryState(viewKey, INITIAL_STATE);
  const modal = view.modal;
  const current = modal
    ? snapshots.find(snapshot => snapshot.month === modal.currentMonth) || null
    : null;
  const previous = modal
    ? snapshots.find(snapshot => snapshot.month === modal.previousMonth) || null
    : null;
  const data = current ? { current, previous } : null;

  const open = useCallback((nextCurrent: ParsedSnapshot, nextPrevious: ParsedSnapshot | null) => {
    setView(state => ({
      ...state,
      modal: {
        currentMonth: nextCurrent.month,
        previousMonth: nextPrevious?.month || '',
        scrollTop: 0
      }
    }));
  }, [setView]);

  const close = useCallback(() => {
    setView(state => ({ ...state, modal: null }));
  }, [setView]);

  const setOnlyChanges = useCallback((value: boolean) => {
    setView(state => ({ ...state, onlyChanges: value }));
  }, [setView]);

  const toggleOnlyChanges = useCallback(() => {
    setView(state => ({ ...state, onlyChanges: !state.onlyChanges }));
  }, [setView]);

  const setPeriod = useCallback((currentMonth: string, previousMonth: string) => {
    setView(state => state.modal
      ? { ...state, modal: { ...state.modal, currentMonth, previousMonth } }
      : state
    );
  }, [setView]);

  const persistScrollTop = useCallback((scrollTop: number) => {
    persistView(state => state.modal
      ? { ...state, modal: { ...state.modal, scrollTop } }
      : state
    );
  }, [persistView]);

  return {
    close,
    data,
    onlyChanges: view.onlyChanges,
    open,
    persistScrollTop,
    scrollTop: modal?.scrollTop || 0,
    setOnlyChanges,
    setPeriod,
    toggleOnlyChanges
  };
}
