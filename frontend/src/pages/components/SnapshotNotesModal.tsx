import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Edit, X } from 'lucide-react';
import { getCurrencyColor } from '../../types';
import type { ParsedSnapshot } from '../../types';

type SnapshotNotesModalProps = {
  snapshot: ParsedSnapshot;
  onClose: () => void;
};

const overlayStyle = { position: 'fixed', inset: 0 } as const;
const panelStyle = { width: '500px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' as const, padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' };
const noteCardStyle = { padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' };

export function SnapshotNotesModal({ snapshot, onClose }: SnapshotNotesModalProps) {
  return createPortal(
    <div className="fixed z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" style={overlayStyle} onClick={onClose}>
      <div className="glass-panel flex flex-col" style={panelStyle} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>Notes for {snapshot.month}</h3>
          <div className="flex items-center gap-2">
            <Link to={`/snapshot/${snapshot.month}`} className="btn btn-primary" title="Edit snapshot (E)" style={{ padding: '6px 12px', fontSize: '13px' }}>
              <Edit size={14} /> Edit
            </Link>
            <button className="btn" style={{ padding: '4px' }} onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {snapshot.data.comment && (
            <div style={noteCardStyle}>
              <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.9em', marginBottom: '6px', letterSpacing: '0.05em' }}>SNAPSHOT NOTE</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.95em' }}>{snapshot.data.comment}</div>
            </div>
          )}

          {snapshot.data.organizations.map(org => {
            const balancesWithComments = org.balances.filter(balance => balance.comment);
            if (!org.comment && balancesWithComments.length === 0) return null;

            return (
              <div key={org.id} style={noteCardStyle}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '1.05em', marginBottom: '6px' }}>{org.name}</div>
                {org.comment && (
                  <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: '8px', paddingLeft: '4px' }}>
                    {org.comment}
                  </div>
                )}
                {balancesWithComments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', borderTop: org.comment ? '1px solid rgba(255,255,255,0.03)' : 'none', paddingTop: org.comment ? '8px' : '0' }}>
                    {balancesWithComments.map((balance, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', fontSize: '0.9em' }}>
                        <span style={{ 
                          color: getCurrencyColor(balance.currency), 
                          fontWeight: 700, 
                          minWidth: '50px',
                          background: 'rgba(255,255,255,0.02)',
                          padding: '1px 4px',
                          borderRadius: '4px',
                          border: `1px solid ${getCurrencyColor(balance.currency)}20`
                        }}>
                          [{balance.currency}]
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>{balance.comment}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
