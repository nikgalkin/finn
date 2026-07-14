import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type QuickHoverTooltipProps = {
  text: string;
  children: ReactNode;
};

type TooltipPosition = {
  left: number;
  top: number;
  above: boolean;
};

const TOOLTIP_WIDTH = 320;
const VIEWPORT_PADDING = 12;

export function QuickHoverTooltip({ text, children }: QuickHoverTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const close = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setPosition(null);
  };

  const open = (delay: number) => {
    if (!text) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextPosition = {
      left: Math.max(VIEWPORT_PADDING, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING)),
      top: rect.top > 140 ? rect.top - 7 : rect.bottom + 7,
      above: rect.top > 140
    };
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPosition(nextPosition);
    }, delay);
  };

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  return (
    <span
      ref={anchorRef}
      className="quick-hover-anchor"
      onMouseEnter={() => open(45)}
      onMouseLeave={close}
      onFocusCapture={() => open(0)}
      onBlurCapture={close}
    >
      {children}
      {position && createPortal(
        <span
          className="quick-hover-tooltip"
          role="tooltip"
          style={{
            left: `${position.left}px`,
            top: `${position.top}px`,
            transform: position.above ? 'translateY(-100%)' : undefined
          }}
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}
