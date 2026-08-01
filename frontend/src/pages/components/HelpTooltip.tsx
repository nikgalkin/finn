import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type HelpTooltipProps = {
  text: ReactNode;
  ariaLabel?: string;
  width?: number;
  placement?: 'bottom' | 'side';
};

export function HelpTooltip({ text, ariaLabel = 'Chart explanation', width = 320, placement = 'bottom' }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const calculatePosition = useCallback((buttonRect: DOMRect, tooltipRect?: DOMRect) => {
    const viewportPadding = 12;
    const gap = placement === 'side' ? 14 : 8;
    const tooltipWidth = tooltipRect?.width ?? Math.min(width, window.innerWidth - viewportPadding * 2);
    const tooltipHeight = tooltipRect?.height ?? 0;
    const maxLeft = window.innerWidth - tooltipWidth - viewportPadding;
    const maxTop = window.innerHeight - tooltipHeight - viewportPadding;

    if (placement === 'side') {
      const fitsRight = buttonRect.right + gap + tooltipWidth <= window.innerWidth - viewportPadding;
      const fitsLeft = buttonRect.left - gap - tooltipWidth >= viewportPadding;
      if (fitsRight || fitsLeft) {
        return {
          left: fitsRight ? buttonRect.right + gap : buttonRect.left - tooltipWidth - gap,
          top: Math.max(viewportPadding, Math.min(buttonRect.top - 8, maxTop)),
        };
      }
    }

    const preferredTop = buttonRect.bottom + gap;
    return {
      left: Math.max(viewportPadding, Math.min(buttonRect.left - 24, maxLeft)),
      top: preferredTop + tooltipHeight <= window.innerHeight - viewportPadding
        ? preferredTop
        : Math.max(viewportPadding, buttonRect.top - tooltipHeight - gap),
    };
  }, [placement, width]);

  useLayoutEffect(() => {
    if (!open) return;

    const buttonRect = buttonRef.current?.getBoundingClientRect();
    const tooltipRect = tooltipRef.current?.getBoundingClientRect();
    if (!buttonRect || !tooltipRect) return;

    const nextPosition = calculatePosition(buttonRect, tooltipRect);
    setPosition(current => (
      current.top === nextPosition.top && current.left === nextPosition.left ? current : nextPosition
    ));
  }, [calculatePosition, open]);

  const openTooltip = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    setPosition(calculatePosition(rect));
    setOpen(true);
  };

  return (
    <span
      onMouseEnter={openTooltip}
      onMouseLeave={() => setOpen(false)}
      onFocus={openTooltip}
      onBlur={() => setOpen(false)}
      onClick={event => event.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, verticalAlign: 'middle' }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        onClick={event => {
          event.stopPropagation();
          openTooltip();
        }}
        style={{
          width: '18px',
          height: '18px',
          padding: 0,
          border: '1px solid var(--glass-border)',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          color: 'var(--text-secondary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'help',
          fontFamily: 'inherit',
          fontSize: '11px',
          fontWeight: 700,
          lineHeight: 1,
          paddingBottom: '1px'
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            zIndex: 200000,
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${width}px`,
            maxWidth: 'calc(100vw - 24px)',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid var(--glass-border)',
            background: 'var(--bg-color)',
            color: 'var(--text-primary)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
            fontSize: '12px',
            fontWeight: 500,
            lineHeight: 1.45,
            letterSpacing: 0,
            textTransform: 'none',
            whiteSpace: 'pre-line',
            pointerEvents: 'none'
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </span>
  );
}
