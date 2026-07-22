import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listSnapshotDrafts,
  readSnapshotDraft,
  removeSnapshotDraft,
  SNAPSHOT_DRAFT_TTL_DAYS,
  writeSnapshotDraft,
  type DraftStorage
} from '../src/lib/snapshotDraftStorage.ts';

class MemoryStorage implements DraftStorage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }

  key(index: number) { return [...this.values.keys()][index] ?? null; }

  getItem(key: string) { return this.values.get(key) ?? null; }

  setItem(key: string, value: string) { this.values.set(key, value); }

  removeItem(key: string) { this.values.delete(key); }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-22T10:00:00Z').getTime();
const data = { rates: { RUB: 1 }, organizations: [] };

test('keeps snapshot drafts for 90 days and removes older drafts', () => {
  const storage = new MemoryStorage();
  const activeKey = 'finn_draft_2026-07';
  const expiredKey = 'finn_draft_2026-06';

  writeSnapshotDraft(activeKey, { data, currentMonth: '2026-07', durationSeconds: 10, timestamp: NOW - SNAPSHOT_DRAFT_TTL_DAYS * DAY_MS }, storage);
  writeSnapshotDraft(expiredKey, { data, currentMonth: '2026-06', durationSeconds: 20, timestamp: NOW - (SNAPSHOT_DRAFT_TTL_DAYS * DAY_MS + 1) }, storage);

  assert.ok(readSnapshotDraft(activeKey, storage, NOW));
  assert.equal(readSnapshotDraft(expiredKey, storage, NOW), null);
  assert.equal(storage.getItem(expiredKey), null);
});

test('lists valid legacy drafts newest first and builds routes', () => {
  const storage = new MemoryStorage();
  storage.setItem('finn_draft_new', JSON.stringify({ data, currentMonth: '2026-08', durationSeconds: 1, timestamp: NOW - 100 }));
  storage.setItem('finn_draft_copy_2026-06', JSON.stringify({ data, currentMonth: '2026-07', durationSeconds: 2, timestamp: NOW }));

  const drafts = listSnapshotDrafts(storage, NOW);

  assert.deepEqual(drafts.map(draft => draft.route), ['/snapshot/copy/2026-06', '/snapshot/new']);
  assert.ok(drafts.every(draft => draft.version === 1));
});

test('removes malformed snapshot drafts without affecting unrelated local storage', () => {
  const storage = new MemoryStorage();
  storage.setItem('finn_draft_2026-07', JSON.stringify({ timestamp: NOW }));
  storage.setItem('other-feature', 'keep me');

  assert.deepEqual(listSnapshotDrafts(storage, NOW), []);
  assert.equal(storage.getItem('finn_draft_2026-07'), null);
  assert.equal(storage.getItem('other-feature'), 'keep me');
});

test('removes only the selected snapshot draft', () => {
  const storage = new MemoryStorage();
  const removedKey = 'finn_draft_2026-07';
  const keptKey = 'finn_draft_2026-06';
  writeSnapshotDraft(removedKey, { data, currentMonth: '2026-07', durationSeconds: 10, timestamp: NOW }, storage);
  writeSnapshotDraft(keptKey, { data, currentMonth: '2026-06', durationSeconds: 20, timestamp: NOW }, storage);

  removeSnapshotDraft(removedKey, storage);

  assert.equal(storage.getItem(removedKey), null);
  assert.ok(storage.getItem(keptKey));
});

test('preserves a valid compact change summary', () => {
  const storage = new MemoryStorage();
  const key = 'finn_draft_2026-07';
  const changeSummary = {
    organizationsAdded: 1,
    organizationsRemoved: 0,
    organizationsUpdated: 0,
    balancesAdded: 0,
    balancesRemoved: 0,
    balancesUpdated: 2,
    ratesChanged: 1,
    notesChanged: 0,
    monthChanged: false
  };

  writeSnapshotDraft(key, { data, currentMonth: '2026-07', durationSeconds: 10, timestamp: NOW, changeSummary }, storage);

  assert.deepEqual(readSnapshotDraft(key, storage, NOW)?.changeSummary, changeSummary);
});
