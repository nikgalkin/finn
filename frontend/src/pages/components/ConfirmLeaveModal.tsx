import { AlertTriangle } from 'lucide-react';
import { ModalPortal } from './ModalPortal';

type ConfirmLeaveModalProps = {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
};

const panelStyle = { width: '440px', maxWidth: '92vw', padding: '20px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' };

export function ConfirmLeaveModal({ message, onCancel, onConfirm }: ConfirmLeaveModalProps) {
  return (
    <ModalPortal onClose={onCancel}>
      <div className="glass-panel" style={panelStyle} onClick={event => event.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} style={{ color: '#eab308' }} />
          <h3 style={{ margin: 0, fontSize: '18px' }}>Unsaved changes</h3>
        </div>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>Stay</button>
          <button className="btn btn-danger" onClick={onConfirm}>Leave</button>
        </div>
      </div>
    </ModalPortal>
  );
}
