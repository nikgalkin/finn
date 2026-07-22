import { useEffect, useState } from 'react';
import { ChevronDown, FilePenLine, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  listSnapshotDrafts,
  removeSnapshotDraft,
  SNAPSHOT_DRAFT_PREFIX,
  SNAPSHOT_DRAFT_TTL_DAYS,
  SNAPSHOT_DRAFTS_CHANGED_EVENT,
  type SnapshotDraftSummary
} from '../../lib/snapshotDraftStorage';
import type { SnapshotDraftChangeSummary } from '../../lib/snapshotDraftDiff';

const formatSavedAt = (timestamp: number) => new Date(timestamp).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

const changeLabel = (count: number, singular: string, plural = `${singular}s`) => (
  count > 0 ? `${count} ${count === 1 ? singular : plural}` : null
);

const draftChangeLabels = (summary?: SnapshotDraftChangeSummary) => {
  if (!summary) return [];
  const balanceChanges = summary.balancesAdded + summary.balancesRemoved + summary.balancesUpdated;
  return [
    changeLabel(summary.organizationsAdded, 'organization added', 'organizations added'),
    changeLabel(summary.organizationsRemoved, 'organization removed', 'organizations removed'),
    changeLabel(summary.organizationsUpdated, 'organization updated', 'organizations updated'),
    changeLabel(balanceChanges, 'balance changed', 'balances changed'),
    changeLabel(summary.ratesChanged, 'rate changed', 'rates changed'),
    changeLabel(summary.notesChanged, 'note changed', 'notes changed'),
    summary.monthChanged ? 'period changed' : null
  ].filter((label): label is string => Boolean(label));
};

export function SnapshotDraftsNotice() {
  const [drafts, setDrafts] = useState<SnapshotDraftSummary[]>(() => listSnapshotDrafts());

  const handleRemove = (draft: SnapshotDraftSummary) => {
    if (!window.confirm(`Delete the unsaved draft "${draft.label}"? This cannot be undone.`)) return;
    removeSnapshotDraft(draft.key);
  };

  useEffect(() => {
    const refresh = () => setDrafts(listSnapshotDrafts());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(SNAPSHOT_DRAFT_PREFIX)) refresh();
    };

    refresh();
    window.addEventListener(SNAPSHOT_DRAFTS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(SNAPSHOT_DRAFTS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  if (drafts.length === 0) return null;

  return (
    <details className="snapshot-drafts-notice glass-panel">
      <summary>
        <span className="snapshot-drafts-notice-icon" aria-hidden="true"><FilePenLine size={18} /></span>
        <span className="snapshot-drafts-notice-copy">
          <strong>{drafts.length} unsaved {drafts.length === 1 ? 'draft' : 'drafts'}</strong>
          <small>Drafts are kept for {SNAPSHOT_DRAFT_TTL_DAYS} days</small>
        </span>
        <ChevronDown className="snapshot-drafts-notice-chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="snapshot-drafts-list">
        {drafts.map(draft => {
          const changes = draftChangeLabels(draft.changeSummary);
          return (
            <div className="snapshot-drafts-row" key={draft.key}>
              <div className="snapshot-drafts-details">
                <strong>{draft.label}</strong>
                <small>Saved {formatSavedAt(draft.timestamp)}</small>
                {changes.length > 0 && (
                  <div className="snapshot-drafts-changes" aria-label="Draft changes">
                    {changes.map(change => <span key={change}>{change}</span>)}
                  </div>
                )}
              </div>
              <div className="snapshot-drafts-actions">
                <Link className="btn" to={draft.route} state={{ restoreDraft: true }}>Continue</Link>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleRemove(draft)}
                  title={`Delete draft: ${draft.label}`}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
