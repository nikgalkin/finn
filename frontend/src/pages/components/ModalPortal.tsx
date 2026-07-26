import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape';

type ModalPortalProps = {
  children: ReactNode;
  onClose: () => void;
  closeOnEscape?: boolean;
  className?: string;
  zIndex?: number | null;
};

export function ModalPortal({
  children,
  onClose,
  closeOnEscape = false,
  className = 'app-modal-backdrop',
  zIndex = 100000
}: ModalPortalProps) {
  useBodyScrollLock();
  useCloseOnEscape(onClose, { enabled: closeOnEscape });

  return createPortal(
    <div
      className={className}
      data-escape-guard={closeOnEscape ? 'true' : undefined}
      data-hotkeys-guard="true"
      style={{ position: 'fixed', inset: 0, ...(zIndex === null ? {} : { zIndex }) }}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body
  );
}
