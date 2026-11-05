import assert from 'node:assert/strict';
import test from 'node:test';
import { monthAfterLatestSnapshot, nextCalendarMonth, previousCalendarMonth, snapshotFlowMonth, snapshotFlowPeriod } from '../src/lib/snapshotMonth.ts';

test('advances a snapshot month across year boundaries', () => {
  assert.equal(nextCalendarMonth('2026-07'), '2026-08');
  assert.equal(nextCalendarMonth('2026-12'), '2027-01');
});

test('matches snapshot timing to the correct calendar month across year boundaries', () => {
  assert.equal(previousCalendarMonth('2026-01'), '2025-12');
  assert.equal(snapshotFlowMonth('2026-11'), '2026-11');
  assert.equal(snapshotFlowMonth('2026-11', 'end'), '2026-11');
  assert.equal(snapshotFlowMonth('2026-11', 'start'), '2026-10');
  assert.equal(snapshotFlowMonth('2026-01', 'start'), '2025-12');
});

test('snapshot periods cover all intervening months in either timing mode', () => {
  assert.deepEqual(snapshotFlowPeriod('2026-09', '2026-11', 'start'), { fromMonth: '2026-09', toMonth: '2026-10' });
  assert.deepEqual(snapshotFlowPeriod('2026-09', '2026-11', 'end'), { fromMonth: '2026-10', toMonth: '2026-11' });
  assert.deepEqual(snapshotFlowPeriod('2026-12', '2027-01', 'start'), { fromMonth: '2026-12', toMonth: '2026-12' });
});

test('copies into the month after the latest snapshot rather than the source month', () => {
  assert.equal(monthAfterLatestSnapshot([
    { month: '2026-07' },
    { month: '2026-04' },
    { month: '2026-06' }
  ], '2026-04'), '2026-08');
});

test('falls back to the copied snapshot when the list is unavailable', () => {
  assert.equal(monthAfterLatestSnapshot([], '2026-07'), '2026-08');
});
