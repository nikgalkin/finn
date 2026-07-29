import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

type ScrollForMoreProps = {
  className?: string;
  compact?: boolean;
  noun?: { singular: string; plural: string };
  orientation?: 'horizontal' | 'vertical';
  scrollContainerId: string;
  total: number;
  visible?: number;
  rowGap?: number;
  rowHeight?: number;
};

export function ScrollForMore({
  className = '',
  compact = false,
  noun,
  orientation = 'horizontal',
  scrollContainerId,
  total,
  visible,
  rowGap = 0,
  rowHeight
}: ScrollForMoreProps) {
  const [measuredVisible, setMeasuredVisible] = useState<number | null>(null);
  const remaining = Math.max(0, total - (visible ?? measuredVisible ?? total));
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    if (!rowHeight) return;

    const element = document.getElementById(scrollContainerId);
    if (!element) return;

    const measure = () => setMeasuredVisible(
      Math.max(1, Math.floor((element.clientHeight + rowGap) / (rowHeight + rowGap)))
    );
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rowGap, rowHeight, scrollContainerId, total]);

  useEffect(() => {
    if (remaining === 0) {
      setAtEnd(false);
      return;
    }

    const element = document.getElementById(scrollContainerId);
    if (!element) return;
    const updatePosition = () => {
      setAtEnd(element.scrollTop + element.clientHeight >= element.scrollHeight - 1);
    };

    updatePosition();
    element.addEventListener('scroll', updatePosition, { passive: true });
    return () => element.removeEventListener('scroll', updatePosition);
  }, [remaining, scrollContainerId]);

  if (remaining === 0) return null;

  const nounLabel = noun ? ` ${remaining === 1 ? noun.singular : noun.plural}` : '';
  const scroll = () => {
    const element = document.getElementById(scrollContainerId);
    if (!element) return;
    element.scrollTo({
      top: atEnd ? 0 : element.scrollHeight - element.clientHeight,
      behavior: 'smooth'
    });
  };

  return (
    <button
      type="button"
      className={`scroll-for-more is-${orientation}${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      onClick={scroll}
      aria-controls={scrollContainerId}
      aria-label={atEnd ? 'Scroll back to the first items' : `Scroll for ${remaining} more${nounLabel}`}
    >
      <span>Scroll for <strong>{remaining}</strong> more{nounLabel}</span>
      <ChevronDown className={atEnd ? 'is-up' : undefined} size={orientation === 'vertical' ? 13 : 12} />
    </button>
  );
}
