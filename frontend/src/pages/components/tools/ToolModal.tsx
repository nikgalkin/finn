import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ModalPortal } from '../ModalPortal';
import { Spinner } from '../PageLoader';

type ToolModalProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
};

type ToolModalLoaderProps = {
  label: string;
  onClose: () => void;
};

export function ToolModal({
  title,
  subtitle,
  icon: Icon,
  accent,
  actions,
  children,
  footer,
  onClose
}: ToolModalProps) {
  return (
    <ModalPortal onClose={onClose} closeOnEscape className="tool-modal-overlay">
      <section
        className="tool-modal glass-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={event => event.stopPropagation()}
      >
        <header className="tool-modal-header">
          <div className="tool-modal-heading">
            <span className="tool-modal-icon" style={{ color: accent }}>
              <Icon size={19} />
            </span>
            <div>
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </div>
          </div>
          <div className="tool-modal-actions">
            {actions}
            <button type="button" className="btn" title="Close" aria-label="Close" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="tool-modal-body">{children}</div>
        {footer && <footer className="tool-modal-footer">{footer}</footer>}
      </section>
    </ModalPortal>
  );
}

export function ToolModalLoader({
  label,
  onClose
}: ToolModalLoaderProps) {
  return (
    <ModalPortal onClose={onClose} closeOnEscape className="tool-modal-overlay tool-modal-loading-overlay">
      <div className="tool-modal-loader" onClick={event => event.stopPropagation()}>
        <Spinner label={label} size={64} />
        <span>{label}…</span>
      </div>
    </ModalPortal>
  );
}
