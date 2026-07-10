import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type StickyPageHeaderProps = {
  children: ReactNode;
  marginBottom?: string;
};

export function StickyPageHeader({ children, marginBottom = '24px' }: StickyPageHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsStuck(!entry.isIntersecting);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} className="sticky-page-header-sentinel" aria-hidden="true" />
      <div
        className={`sticky-page-header flex justify-between items-center${isStuck ? ' is-stuck' : ''}`}
        style={{ marginBottom }}
      >
        {children}
      </div>
    </>
  );
}
