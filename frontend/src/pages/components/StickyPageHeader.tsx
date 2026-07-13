import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type StickyPageHeaderProps = {
  children: ReactNode;
  marginBottom?: string;
  compactTop?: boolean;
};

export function StickyPageHeader({ children, marginBottom = '24px', compactTop = false }: StickyPageHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const updateStuckState = () => {
      const header = headerRef.current;
      if (!header) return;
      setIsStuck(window.scrollY > 0 && header.getBoundingClientRect().top <= 0.5);
    };

    updateStuckState();
    window.addEventListener('scroll', updateStuckState, { passive: true });
    window.addEventListener('resize', updateStuckState);
    return () => {
      window.removeEventListener('scroll', updateStuckState);
      window.removeEventListener('resize', updateStuckState);
    };
  }, []);

  return (
    <div
      ref={headerRef}
      className={`sticky-page-header flex justify-between items-center${compactTop ? ' is-compact-top' : ''}${isStuck ? ' is-stuck' : ''}`}
      style={{ marginBottom }}
    >
      {children}
    </div>
  );
}
