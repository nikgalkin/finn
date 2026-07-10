import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type ActiveSnapshotComment = {
  type: 'month' | 'org' | 'balance';
  orgId?: string;
  index?: number;
  text: string;
  initialText: string;
  title: string;
};

type SnapshotCommentModalProps = {
  comment: ActiveSnapshotComment;
  onChange: (comment: ActiveSnapshotComment) => void;
  onClose: () => void;
  onSave: () => void;
};

const overlayStyle = { position: 'fixed', inset: 0, zIndex: 100000 } as const;
const panelStyle = { width: '600px', minWidth: '300px', minHeight: '300px', resize: 'both' as const, overflow: 'hidden', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', position: 'relative' as const };

export function SnapshotCommentModal({ comment, onChange, onClose, onSave }: SnapshotCommentModalProps) {
  return createPortal(
    <div className="fixed flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-hotkeys-guard="true" style={overlayStyle}>
      <div className="glass-panel flex flex-col" style={panelStyle}>
        <div className="flex justify-between items-center mb-4">
          <h3 style={{ margin: 0, fontSize: '18px' }}>{comment.title}</h3>
          <button className="btn" style={{ padding: '4px' }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <textarea
          className="input w-full flex-1"
          style={{ resize: 'none', paddingTop: '12px', minHeight: '150px' }}
          placeholder="Type your notes here..."
          value={comment.text}
          onChange={event => onChange({ ...comment, text: event.target.value })}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            } else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSave();
            }
          }}
          autoFocus
        />

        <div className="flex justify-end gap-2 mt-6">
          <button className="btn mt-2" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary mt-2" onClick={onSave}>Save Note</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
