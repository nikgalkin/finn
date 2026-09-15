import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchDatasourceSummary } from '../lib/dsApi';

export type DatasourceInboxBadge = {
  available: boolean;
  pending: number;
};

const emptyBadge: DatasourceInboxBadge = { available: false, pending: 0 };

/**
 * Just enough to decide whether the header shows an Inbox link and what number
 * goes on it.
 *
 * It reloads on every navigation rather than polling: accepting an item is what
 * changes the count, and leaving the page is the moment the header has to catch
 * up. The summary endpoint only reads config and the pending count; refreshing
 * the badge never hashes or executes a plugin binary.
 */
export function useDatasourceInbox(): DatasourceInboxBadge {
  const location = useLocation();
  const [badge, setBadge] = useState<DatasourceInboxBadge>(emptyBadge);

  useEffect(() => {
    let cancelled = false;

    fetchDatasourceSummary()
      .then(view => {
        if (cancelled) return;
        setBadge(view);
      })
      .catch(() => {
        if (!cancelled) setBadge(emptyBadge);
      });

    return () => { cancelled = true; };
  }, [location.pathname]);

  return badge;
}
