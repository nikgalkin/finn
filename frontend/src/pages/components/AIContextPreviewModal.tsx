import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, FileJson, X } from 'lucide-react';
import type { LocalAIContextPreview } from '../../types';

type AIContextPreviewModalProps = {
  preview: LocalAIContextPreview | null;
  loading: boolean;
  error: string;
  onClose: () => void;
};

export function AIContextPreviewModal({ preview, loading, error, onClose }: AIContextPreviewModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => setCopied(false), [preview]);

  const copyPrompt = async () => {
    if (!preview?.prompt) return;
    await navigator.clipboard.writeText(preview.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return createPortal(
    <div className="ai-context-modal-overlay" data-hotkeys-guard="true" data-escape-guard="true" onClick={onClose}>
      <div className="glass-panel ai-context-modal" onClick={event => event.stopPropagation()}>
        <div className="ai-context-modal-header">
          <div>
            <div className="flex items-center gap-2">
              <FileJson size={19} color="var(--accent)" />
              <h3>Sent model context</h3>
            </div>
            <p>This is the exact system prompt used to start a conversation with the current data and response style.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => void copyPrompt()} disabled={!preview?.prompt || loading}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="btn" onClick={onClose} title="Close context preview">
              <X size={18} />
            </button>
          </div>
        </div>

        {preview && (
          <div className="ai-context-modal-meta">
            <span>{preview.snapshotCount} snapshots</span>
            <span>{Math.max(1, Math.round(preview.bytes / 1024))} KB</span>
            <span>data {preview.dataFingerprint}</span>
          </div>
        )}

        {loading ? (
          <div className="ai-context-modal-state">Preparing context…</div>
        ) : error ? (
          <div className="ai-context-modal-state is-error">{error}</div>
        ) : (
          <pre className="ai-context-prompt"><code>{preview?.prompt}</code></pre>
        )}
      </div>
    </div>,
    document.body
  );
}
