import { useEffect } from 'react';
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

type CommentModalProps = {
  title: string;
  text: string;
  onChange: (text: string) => void;
  onClose: () => void;
  onSave: () => void;
  description?: string;
  placeholder?: string;
  saveLabel?: string;
  saving?: boolean;
  error?: string;
};

const overlayStyle = { position: 'fixed', inset: 0, zIndex: 100000 } as const;
const panelStyle = { width: '600px', minWidth: '300px', minHeight: '300px', resize: 'both' as const, overflow: 'hidden', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', position: 'relative' as const };

export function CommentModal({
  title,
  text,
  onChange,
  onClose,
  onSave,
  description,
  placeholder = 'Type your notes here...',
  saveLabel = 'Save Note',
  saving = false,
  error = ''
}: CommentModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, saving]);

  return createPortal(
    <div
      className="fixed flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      data-hotkeys-guard="true"
      style={overlayStyle}
      onMouseDown={event => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="glass-panel flex flex-col" style={panelStyle}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 style={{ margin: 0, fontSize: '18px' }}>{title}</h3>
            {description && <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: '12px' }}>{description}</p>}
          </div>
          <button className="btn" style={{ padding: '4px' }} onClick={onClose} disabled={saving} title="Close">
            <X size={20} />
          </button>
        </div>

        <textarea
          className="input w-full flex-1"
          style={{ resize: 'none', paddingTop: '12px', minHeight: '150px' }}
          placeholder={placeholder}
          value={text}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !saving) {
              event.preventDefault();
              onSave();
            }
          }}
          autoFocus
        />

        {error && <div style={{ marginTop: '12px', color: 'var(--danger)', fontSize: '13px' }}>{error}</div>}
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn mt-2" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary mt-2" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : saveLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function SnapshotCommentModal({ comment, onChange, onClose, onSave }: SnapshotCommentModalProps) {
  return (
    <CommentModal
      title={comment.title}
      text={comment.text}
      onChange={text => onChange({ ...comment, text })}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
