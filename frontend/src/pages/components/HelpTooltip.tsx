import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

type HelpTooltipProps = {
  text: ReactNode;
  ariaLabel?: string;
  width?: number;
};

export function HelpTooltip({ text, ariaLabel = 'Chart explanation', width = 320 }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const buttonRect = buttonRef.current?.getBoundingClientRect();
    const tooltipRect = tooltipRef.current?.getBoundingClientRect();
    if (!buttonRect || !tooltipRect) return;

    const viewportPadding = 12;
    const gap = 8;
    const preferredTop = buttonRect.bottom + gap;
    const top = preferredTop + tooltipRect.height <= window.innerHeight - viewportPadding
      ? preferredTop
      : Math.max(viewportPadding, buttonRect.top - tooltipRect.height - gap);

    setPosition(current => current.top === top ? current : { ...current, top });
  }, [open]);

  const openTooltip = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportPadding = 12;
    const preferredLeft = rect.left - 24;
    const maxLeft = window.innerWidth - width - viewportPadding;

    setPosition({
      top: rect.bottom + 8,
      left: Math.max(viewportPadding, Math.min(preferredLeft, maxLeft))
    });
    setOpen(true);
  };

  return (
    <span
      onMouseEnter={openTooltip}
      onMouseLeave={() => setOpen(false)}
      onFocus={openTooltip}
      onBlur={() => setOpen(false)}
      onClick={event => event.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        onClick={event => {
          event.stopPropagation();
          if (open) setOpen(false);
          else openTooltip();
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
          cursor: 'help'
        }}
      >
        <HelpCircle size={13} />
      </button>
      {open && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            zIndex: 10000,
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
