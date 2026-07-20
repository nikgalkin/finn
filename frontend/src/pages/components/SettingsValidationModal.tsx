import { AlertTriangle, X } from 'lucide-react';
import { ModalPortal } from './ModalPortal';

export type SettingsValidationIssue = {
  section: string;
  value: string;
  message: string;
};

type SettingsValidationModalProps = {
  issues: SettingsValidationIssue[];
  onClose: () => void;
};

const panelStyle = {
  width: '520px',
  maxWidth: '94vw',
  maxHeight: '86vh',
  padding: 0,
  overflow: 'hidden',
  boxShadow: '0 30px 80px rgba(0, 0, 0, 0.55)',
  borderColor: 'rgba(251, 146, 60, 0.3)'
} as const;

export function SettingsValidationModal({ issues, onClose }: SettingsValidationModalProps) {
  return (
    <ModalPortal onClose={onClose} closeOnEscape>
      <div
        className="glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-validation-title"
        style={panelStyle}
        onClick={event => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '20px 20px 16px', borderBottom: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'grid', placeItems: 'center', width: '38px', height: '38px', flex: '0 0 38px', borderRadius: '12px', color: '#fb923c', background: 'rgba(251, 146, 60, 0.12)', border: '1px solid rgba(251, 146, 60, 0.22)' }}>
            <AlertTriangle size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 id="settings-validation-title" style={{ margin: 0, fontSize: '18px' }}>Settings need attention</h3>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.45 }}>
              Fix {issues.length === 1 ? 'this issue' : `these ${issues.length} issues`} before saving.
            </p>
          </div>
          <button className="btn" style={{ padding: '5px' }} onClick={onClose} aria-label="Close validation message">
            <X size={17} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '52vh', overflowY: 'auto', padding: '14px 20px' }}>
          {issues.map((issue, index) => (
            <div key={`${issue.section}-${issue.value}-${index}`} style={{ padding: '12px 13px', borderRadius: '10px', background: 'rgba(15, 23, 42, 0.52)', border: '1px solid rgba(239, 68, 68, 0.22)' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: '5px' }}>
                <span style={{ padding: '2px 7px', borderRadius: '999px', color: '#fda4af', background: 'rgba(239, 68, 68, 0.12)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.035em', textTransform: 'uppercase' }}>
                  {issue.section}
                </span>
                <strong style={{ minWidth: 0, overflow: 'hidden', color: 'var(--text-primary)', fontSize: '13px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {issue.value}
                </strong>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.4 }}>{issue.message}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center gap-3" style={{ padding: '14px 20px 18px', borderTop: '1px solid var(--glass-border)', background: 'rgba(15, 23, 42, 0.28)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Nothing has been saved yet.</span>
          <button className="btn btn-primary" onClick={onClose} autoFocus>Review settings</button>
        </div>
      </div>
    </ModalPortal>
  );
}
