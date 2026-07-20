import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  className = 'fixed flex items-center justify-center bg-black/60 backdrop-blur-sm p-4',
  zIndex = 100000
}: ModalPortalProps) {
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
