import { Link } from 'react-router-dom';
import { ArrowDownUp, ArrowLeft, Clock, Copy, MessageSquare, Save } from 'lucide-react';
import { StickyPageHeader } from './StickyPageHeader';

type SnapshotEditorHeaderProps = {
  title: string;
  subtitle: string;
  copySourceMonth?: string;
  cleanStateLabel: string;
  durationSeconds: number;
  hasMonthlyComment: boolean;
  isDirty: boolean;
  cashFlowEnabled: boolean;
  cashFlowLoading: boolean;
  onOpenMonthlyComment: () => void;
  onOpenCashFlow: () => void;
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

export function SnapshotEditorHeader({
  title,
  subtitle,
  copySourceMonth,
  cleanStateLabel,
  durationSeconds,
  hasMonthlyComment,
  isDirty,
  cashFlowEnabled,
  cashFlowLoading,
  onOpenMonthlyComment,
  onOpenCashFlow,
  onSave
}: SnapshotEditorHeaderProps) {
  return (
    <StickyPageHeader marginBottom="18px">
      <div className="snapshot-editor-heading">
        <Link to="/" className="btn snapshot-editor-back" aria-label="Back to overview" title="Back to overview">
          <ArrowLeft size={20} />
        </Link>
        <div className="snapshot-editor-title">
          <div className="snapshot-editor-title-row">
            <div className="snapshot-editor-title-main">
              <h2>{title}</h2>
              {copySourceMonth && (
                <span className="snapshot-editor-copy-source" title={`Balances copied from ${copySourceMonth}`}>
                  <Copy size={12} aria-hidden="true" />
                  Source {copySourceMonth}
                </span>
              )}
            </div>
            <span
              className={`snapshot-editor-save-state${isDirty ? ' is-dirty' : ''}`}
              aria-live="polite"
            >
              <i aria-hidden="true" />
              {isDirty ? 'Unsaved changes' : cleanStateLabel}
            </span>
          </div>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="snapshot-editor-actions">
        {cashFlowEnabled && (
          <button className="btn snapshot-editor-action" onClick={onOpenCashFlow} disabled={cashFlowLoading} title="Edit Cash Flow for this snapshot month">
            <ArrowDownUp size={17} /> {cashFlowLoading ? 'Opening…' : 'Cash Flow'}
          </button>
        )}
        <div className="snapshot-editor-timer" aria-label={`Editing time ${formatTimer(durationSeconds)}`}>
          <Clock size={16} />
          <span>{formatTimer(durationSeconds)}</span>
        </div>

        <button
          className={`btn snapshot-editor-note${hasMonthlyComment ? ' has-comment' : ''}`}
          style={getCommentButtonStyle(hasMonthlyComment)}
          title="Add monthly note"
          aria-label={hasMonthlyComment ? 'Edit monthly note' : 'Add monthly note'}
          onClick={onOpenMonthlyComment}
        >
          <MessageSquare size={18} />
        </button>
        <button className="btn btn-primary snapshot-editor-save" onClick={onSave}>
          <Save size={18} className="mr-2" /> Save
        </button>
      </div>
    </StickyPageHeader>
  );
}
