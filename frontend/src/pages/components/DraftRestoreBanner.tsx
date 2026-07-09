type DraftRestoreBannerProps = {
  draftTimestamp: number;
  onRestore: () => void;
  onDiscard: () => void;
};

export function DraftRestoreBanner({ draftTimestamp, onRestore, onDiscard }: DraftRestoreBannerProps) {
  return (
    <div className="glass-panel flex justify-between items-center" style={{ borderColor: 'var(--accent)', background: 'rgba(59, 130, 246, 0.05)', marginBottom: '32px' }}>
      <div>
        <h4 style={{ margin: 0, color: 'var(--accent)' }}>Unsaved Draft Detected</h4>
        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          We found a draft from {new Date(draftTimestamp).toLocaleString()}. Would you like to resume editing?
        </p>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={onRestore}>Restore</button>
        <button className="btn btn-danger" onClick={onDiscard}>Discard Draft</button>
      </div>
    </div>
  );
}
