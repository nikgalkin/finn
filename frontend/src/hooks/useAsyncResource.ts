import { useEffect, useRef, useState } from 'react';

type UseAsyncResourceOptions = {
  enabled?: boolean;
  fallbackError?: string;
};

/**
 * Fetch-backed state with the cancellation guard, error normalisation and
 * loading flags that every resource in the app needs.
 *
 * `key` decides when to refetch: change it and the resource reloads. `load`
 * stays out of the dependency list on purpose, since callers rebuild it on
 * every render.
 */
export function useAsyncResource<T>(
  initial: T,
  load: () => Promise<T>,
  key: string,
  { enabled = true, fallbackError = 'Request failed.' }: UseAsyncResourceOptions = {}
) {
  const [initialValue] = useState(initial);
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [loaded, setLoaded] = useState(!enabled);
  const startedRef = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) {
      setData(initialValue);
      setError(null);
      setLoading(false);
      setLoaded(true);
      startedRef.current = false;
      return;
    }

    let cancelled = false;

    // Only the first run of an enabled resource shows a loader. A later key
    // change refetches in place, so views already showing data do not flash
    // their full-page loader.
    if (!startedRef.current) {
      setLoading(true);
      setLoaded(false);
    }
    startedRef.current = true;

    loadRef.current()
      .then(value => {
        if (!cancelled) setData(value);
      })
      .catch(cause => {
        if (cancelled) return;
        const failure = cause instanceof Error ? cause : new Error(fallbackError);
        console.error(failure);
        setError(failure);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setLoaded(true);
      });

    return () => { cancelled = true; };
  }, [key, enabled, fallbackError, initialValue]);

  return { data, setData, loading, loaded, error };
}
