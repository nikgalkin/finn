import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type QuickHoverTooltipProps = {
  text: string;
  children: ReactNode;
  className?: string;
  placement?: 'anchor' | 'pointer';
  style?: CSSProperties;
};

type TooltipPosition = {
  left: number;
  top: number;
  above: boolean;
  centered: boolean;
};

type TooltipPoint = { x: number; y: number };

const TOOLTIP_WIDTH = 320;
const TOOLTIP_GAP = 12;
const VIEWPORT_PADDING = 12;

export function QuickHoverTooltip({ text, children, className = '', placement = 'anchor', style }: QuickHoverTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const pointerRef = useRef<TooltipPoint | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const close = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pointerRef.current = null;
    setPosition(null);
  };

  const open = (delay: number, point?: TooltipPoint) => {
    if (!text) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    pointerRef.current = point ?? null;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const latestPoint = pointerRef.current;
      const nextPosition: TooltipPosition = latestPoint ? {
        left: latestPoint.x,
        top: latestPoint.y - TOOLTIP_GAP,
        above: true,
        centered: true
      } : {
        left: Math.max(VIEWPORT_PADDING, Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING)),
        top: rect.top > 140 ? rect.top - 7 : rect.bottom + 7,
        above: rect.top > 140,
        centered: false
      };
      setPosition(nextPosition);
    }, delay);
  };

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!text) close();
  }, [text]);

  useLayoutEffect(() => {
    if (!position?.centered || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    const shift = rect.left < VIEWPORT_PADDING
      ? VIEWPORT_PADDING - rect.left
      : rect.right > window.innerWidth - VIEWPORT_PADDING
        ? window.innerWidth - VIEWPORT_PADDING - rect.right
        : 0;
    if (Math.abs(shift) < 0.5) return;
    setPosition(current => current?.centered ? { ...current, left: current.left + shift } : current);
  }, [position]);

  return (
    <span
      ref={anchorRef}
      className={`quick-hover-anchor${className ? ` ${className}` : ''}`}
      style={style}
      onMouseEnter={event => open(45, placement === 'pointer' ? { x: event.clientX, y: event.clientY } : undefined)}
      onMouseMove={event => {
        if (placement === 'pointer' && timerRef.current !== null) {
          pointerRef.current = { x: event.clientX, y: event.clientY };
        }
      }}
      onMouseLeave={close}
      onFocusCapture={() => open(0)}
      onBlurCapture={close}
    >
      {children}
      {position && text && createPortal(
        <span
          ref={tooltipRef}
          className="quick-hover-tooltip"
          role="tooltip"
          style={{
            left: `${position.left}px`,
            top: `${position.top}px`,
            transform: position.centered
              ? 'translate(-50%, -100%)'
              : position.above
                ? 'translateY(-100%)'
              : undefined
          }}
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}
