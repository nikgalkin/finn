import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

type StoredHistoryEntry = {
  scrollY?: number;
  views?: Record<string, unknown>;
};

type StateUpdate<T> = T | ((previous: T) => T);

const STORAGE_PREFIX = 'finn_history_entry:';
const SCROLL_WRITE_THROTTLE_MS = 500;
const SCROLL_RESTORE_WINDOW_MS = 3_000;
const pageWasReloaded = performance.getEntriesByType('navigation')
  .some(entry => (entry as PerformanceNavigationTiming).type === 'reload');
let reloadedEntryCleared = false;

const storageKey = (entryId: string) => `${STORAGE_PREFIX}${entryId}`;

const prepareEntry = (entryId: string) => {
  if (!pageWasReloaded || reloadedEntryCleared) return;
  reloadedEntryCleared = true;

  try {
    window.sessionStorage.removeItem(storageKey(entryId));
  } catch {
    // Navigation must still work when session storage is unavailable.
  }
};

const readEntry = (entryId: string): StoredHistoryEntry => {
  prepareEntry(entryId);

  try {
    const raw = window.sessionStorage.getItem(storageKey(entryId));
    return raw ? JSON.parse(raw) as StoredHistoryEntry : {};
  } catch {
    return {};
  }
};

const writeEntry = (entryId: string, update: (entry: StoredHistoryEntry) => StoredHistoryEntry) => {
  try {
    const next = update(readEntry(entryId));
    window.sessionStorage.setItem(storageKey(entryId), JSON.stringify(next));
  } catch {
    // History restoration is a convenience; navigation must still work if storage is unavailable.
  }
};

const historyEntryId = (key: string, pathname: string, search: string) => {
  return `${key}:${pathname}${search}`;
};

export function useHistoryEntryState<T>(viewKey: string, initialState: T) {
  const location = useLocation();
  const entryId = historyEntryId(location.key, location.pathname, location.search);
  const initialStateRef = useRef(initialState);
  const entryIdRef = useRef(entryId);
  const stateRef = useRef<T>(
    (readEntry(entryId).views?.[viewKey] as T | undefined) ?? initialStateRef.current
  );
  const [state, setRenderedState] = useState(stateRef.current);

  if (entryIdRef.current !== entryId) {
    entryIdRef.current = entryId;
    stateRef.current = (readEntry(entryId).views?.[viewKey] as T | undefined) ?? initialStateRef.current;
  }

  const commit = useCallback((update: StateUpdate<T>, render: boolean) => {
    const next = typeof update === 'function'
      ? (update as (previous: T) => T)(stateRef.current)
      : update;

    stateRef.current = next;
    writeEntry(entryIdRef.current, entry => ({
      ...entry,
      views: {
        ...entry.views,
        [viewKey]: next
      }
    }));

    if (render) setRenderedState(next);
  }, [viewKey]);

  const setState = useCallback((update: StateUpdate<T>) => commit(update, true), [commit]);
  const persistState = useCallback((update: StateUpdate<T>) => commit(update, false), [commit]);

  return [state, setState, persistState] as const;
}

export function HistoryScrollRestoration() {
  const location = useLocation();
  const entryId = historyEntryId(location.key, location.pathname, location.search);

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    return () => {
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  useLayoutEffect(() => {
    const storedScrollY = readEntry(entryId).scrollY;
    const targetScrollY = typeof storedScrollY === 'number' && storedScrollY > 0 ? storedScrollY : 0;
    let active = true;
    let restoring = targetScrollY > 0;
    let animationFrame = 0;
    let restoreTimeout = 0;
    let writeTimeout = 0;
    let pendingScrollY: number | null = null;

    const flushScroll = () => {
      window.clearTimeout(writeTimeout);
      writeTimeout = 0;
      if (pendingScrollY === null) return;
      writeEntry(entryId, entry => ({ ...entry, scrollY: pendingScrollY ?? entry.scrollY }));
      pendingScrollY = null;
    };

    const queueScrollSave = () => {
      if (restoring) return;
      pendingScrollY = window.scrollY;
      if (!writeTimeout) {
        writeTimeout = window.setTimeout(flushScroll, SCROLL_WRITE_THROTTLE_MS);
      }
    };

    const finishRestoring = (scrollY: number) => {
      if (!active || !restoring) return;
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
      restoring = false;
      observer.disconnect();
      window.clearTimeout(restoreTimeout);
      pendingScrollY = window.scrollY;
      flushScroll();
    };

    const tryRestore = () => {
      if (!active || !restoring) return;
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (targetScrollY <= maxScrollY + 1) {
        finishRestoring(targetScrollY);
      }
    };

    const cancelPendingRestoration = () => {
      if (!restoring) return;
      restoring = false;
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(restoreTimeout);
    };

    const observer = new ResizeObserver(() => {
      if (!active || !restoring) return;
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(tryRestore);
    });

    observer.observe(document.documentElement);
    window.addEventListener('scroll', queueScrollSave, { passive: true });
    // HashRouter can emit popstate and hashchange around the same transition.
    // The old effect's cleanup cancels its restoration; listening here would
    // also cancel the newly mounted history entry's restoration.

    if (restoring) {
      animationFrame = requestAnimationFrame(tryRestore);
      restoreTimeout = window.setTimeout(cancelPendingRestoration, SCROLL_RESTORE_WINDOW_MS);
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      pendingScrollY = 0;
      flushScroll();
    }

    return () => {
      active = false;
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(restoreTimeout);
      window.clearTimeout(writeTimeout);
      window.removeEventListener('scroll', queueScrollSave);
      flushScroll();
    };
  }, [entryId]);

  return null;
}
