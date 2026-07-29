import assert from 'node:assert/strict';
import test from 'node:test';
import { monthAfterLatestSnapshot, nextCalendarMonth } from '../src/lib/snapshotMonth.ts';

test('advances a snapshot month across year boundaries', () => {
  assert.equal(nextCalendarMonth('2026-07'), '2026-08');
  assert.equal(nextCalendarMonth('2026-12'), '2027-01');
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
