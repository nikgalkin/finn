import { useEffect } from 'react';

let activeLocks = 0;
let restoreOverflow = '';
let restorePaddingRight = '';

export function useBodyScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    if (activeLocks === 0) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      restoreOverflow = document.body.style.overflow;
      restorePaddingRight = document.body.style.paddingRight;
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        const currentPadding = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
        document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
      }
    }
    activeLocks += 1;

    return () => {
      activeLocks -= 1;
      if (activeLocks > 0) return;
      document.body.style.overflow = restoreOverflow;
      document.body.style.paddingRight = restorePaddingRight;
    };
  }, [enabled]);
}
