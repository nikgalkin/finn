type SnapshotMonth = {
  month: string;
};

export const nextCalendarMonth = (month: string) => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return '';

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
};

export const monthAfterLatestSnapshot = (snapshots: SnapshotMonth[], fallbackMonth: string) => {
  const latestMonth = snapshots
    .map(snapshot => snapshot.month)
    .filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    .sort()
    .at(-1);

  return nextCalendarMonth(latestMonth || fallbackMonth);
};
