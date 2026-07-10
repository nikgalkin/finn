import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, MessageSquare, Save } from 'lucide-react';

type SnapshotEditorHeaderProps = {
  title: string;
  durationSeconds: number;
  hasMonthlyComment: boolean;
  onOpenMonthlyComment: () => void;
  onSave: () => void;
};

const formatTimer = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
  }

  return `${mm}:${ss}`;
};

const getCommentButtonStyle = (hasComment: boolean) => ({
  padding: '6px',
  color: hasComment ? '#3b82f6' : 'rgba(255, 255, 255, 0.6)',
  transition: 'color 0.2s'
});

const headerStyle = {
  position: 'sticky' as const,
  top: 0,
  zIndex: 999,
  background: 'transparent',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  padding: '16px 4px',
  borderBottom: '1px solid var(--glass-border)',
  margin: '0 -4px 32px'
};

export function SnapshotEditorHeader({
  title,
  durationSeconds,
  hasMonthlyComment,
  onOpenMonthlyComment,
  onSave
}: SnapshotEditorHeaderProps) {
  return (
    <div className="flex justify-between items-center" style={headerStyle}>
      <div className="flex items-center gap-4">
        <Link to="/" className="btn" style={{ padding: '8px 12px' }}>
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-3">
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0, lineHeight: 1 }}>
            {title}
          </h2>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent)' }}>
          <Clock size={16} />
          <span>{formatTimer(durationSeconds)}</span>
        </div>

        <button
          className="btn"
          style={getCommentButtonStyle(hasMonthlyComment)}
          title="Add monthly note"
          onClick={onOpenMonthlyComment}
        >
          <MessageSquare size={18} />
        </button>
        <button className="btn btn-primary" onClick={onSave}>
          <Save size={18} className="mr-2" /> Save
        </button>
      </div>
    </div>
  );
}
