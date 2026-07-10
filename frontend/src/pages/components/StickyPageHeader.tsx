import type { ReactNode } from 'react';

type StickyPageHeaderProps = {
  children: ReactNode;
  marginBottom?: string;
};

export function StickyPageHeader({ children, marginBottom = '24px' }: StickyPageHeaderProps) {
  return (
    <div
      className="sticky-page-header flex justify-between items-center"
      style={{ marginBottom }}
    >
      {children}
    </div>
  );
}
