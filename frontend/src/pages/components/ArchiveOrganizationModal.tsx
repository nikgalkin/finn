import { Archive, AlertTriangle, X } from 'lucide-react';
import { ModalPortal } from './ModalPortal';
import { Spinner } from './PageLoader';

type ArchiveOrganizationModalProps = {
  name: string;
  country?: string;
  loading: boolean;
  error: string;
  snapshotCount: number;
  latestNonZeroBalances: string[];
  onCancel: () => void;
  onConfirm: () => void;
};

const panelStyle = { width: '500px', maxWidth: '94vw', padding: 0, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0, 0, 0, 0.55)' } as const;

export function ArchiveOrganizationModal({
  name,
  country,
  loading,
  error,
  snapshotCount,
  latestNonZeroBalances,
  onCancel,
  onConfirm
}: ArchiveOrganizationModalProps) {
  const isBlocked = loading || !!error || latestNonZeroBalances.length > 0;

  return (
    <ModalPortal onClose={onCancel} closeOnEscape>
      <div className="glass-panel" role="dialog" aria-modal="true" aria-labelledby="archive-organization-title" style={panelStyle} onClick={event => event.stopPropagation()}>
        <div style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr) auto', alignItems: 'start', gap: '14px', padding: '20px', borderBottom: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'grid', placeItems: 'center', width: '38px', height: '38px', flex: '0 0 38px', borderRadius: '12px', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.22)' }}>
            <Archive size={19} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 id="archive-organization-title" style={{ margin: 0, fontSize: '18px' }}>Archive {name || 'organization'}?</h3>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.45 }}>
              Historical snapshots and contry {country || 'the stored country'} will remain unchanged.
            </p>
          </div>
          <button className="btn" style={{ padding: '5px' }} onClick={onCancel} aria-label="Close archive message"><X size={17} /></button>
        </div>

        <div style={{ padding: '18px 20px' }}>
          {loading ? (
            <div style={{ display: 'grid', minHeight: '80px', placeItems: 'center' }}><Spinner label="Checking organization history" size={26} /></div>
          ) : error ? (
            <div className="flex items-start gap-2" style={{ padding: '12px', color: '#fda4af', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', fontSize: '12px', lineHeight: 1.45 }}>
              <AlertTriangle size={17} style={{ flex: '0 0 auto' }} /> {error}
            </div>
          ) : latestNonZeroBalances.length > 0 ? (
            <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.22)', borderRadius: '10px' }}>
              <div className="flex items-center gap-2" style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 700 }}>
                <AlertTriangle size={17} /> Latest balance is not zero
              </div>
              <div style={{ marginTop: '7px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>
                Update the latest snapshot first: {latestNonZeroBalances.join(' · ')}. This prevents assets from disappearing from the next snapshot.
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.55 }}>
              Used in <strong style={{ color: 'var(--text-primary)' }}>{snapshotCount}</strong> historical snapshot{snapshotCount === 1 ? '' : 's'}. After saving Settings, it will no longer appear in Fill from Settings, Add Organization, or Copy previous.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2" style={{ padding: '14px 20px 18px', borderTop: '1px solid var(--glass-border)', background: 'rgba(15, 23, 42, 0.28)' }}>
          <button className="btn" onClick={onCancel}>{isBlocked ? 'Close' : 'Cancel'}</button>
          {!isBlocked && <button className="btn" style={{ color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.35)' }} onClick={onConfirm}>Archive</button>}
        </div>
      </div>
    </ModalPortal>
  );
}
