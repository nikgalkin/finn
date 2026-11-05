import type { SnapshotTiming } from '../types';

type SnapshotMonth = {
  month: string;
};

const shiftCalendarMonth = (month: string, offset: number) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return '';

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const index = year * 12 + monthNumber - 1 + offset;
  const nextYear = Math.floor(index / 12);
  const nextMonth = ((index % 12) + 12) % 12 + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
};

export const nextCalendarMonth = (month: string) => shiftCalendarMonth(month, 1);
export const previousCalendarMonth = (month: string) => shiftCalendarMonth(month, -1);

/** Calendar month whose closing movements belong to this snapshot. */
export const snapshotFlowMonth = (month: string, timing: SnapshotTiming = 'end') => (
  timing === 'start' ? previousCalendarMonth(month) : month
);

export type SnapshotFlowPeriod = { fromMonth: string; toMonth: string };

export const snapshotFlowPeriod = (previousMonth: string, currentMonth: string, timing: SnapshotTiming = 'end'): SnapshotFlowPeriod => ({
  fromMonth: nextCalendarMonth(snapshotFlowMonth(previousMonth, timing)),
  toMonth: snapshotFlowMonth(currentMonth, timing)
});

export const monthAfterLatestSnapshot = (snapshots: SnapshotMonth[], fallbackMonth: string) => {
  const latestMonth = snapshots
    .map(snapshot => snapshot.month)
    .filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    .sort()
    .at(-1);

  return nextCalendarMonth(latestMonth || fallbackMonth);
};
