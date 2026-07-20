import { useEffect } from 'react';

type EscapeCloseOptions = {
  enabled?: boolean;
  capture?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  stopImmediatePropagation?: boolean;
};

export function useCloseOnEscape(onClose: () => void, options: EscapeCloseOptions = {}) {
  const {
    enabled = true,
    capture = true,
    preventDefault = true,
    stopPropagation = true,
    stopImmediatePropagation = stopPropagation
  } = options;

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (preventDefault) event.preventDefault();
      if (stopPropagation) event.stopPropagation();
      if (stopImmediatePropagation) event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, capture);
    return () => window.removeEventListener('keydown', handleKeyDown, capture);
  }, [capture, enabled, onClose, preventDefault, stopImmediatePropagation, stopPropagation]);
}
