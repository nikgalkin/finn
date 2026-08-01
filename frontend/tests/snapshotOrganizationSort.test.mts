import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readSnapshotOrganizationSort,
  reconcileSnapshotOrganizationOrder,
  saveSnapshotOrganizationSort,
  snapshotOrganizationOrderNeedsApply,
  sortSnapshotOrganizations,
  type SnapshotOrganizationSortStorage,
} from '../src/lib/snapshotOrganizationSort.ts';

const organizations = [
  { id: 'gamma', name: 'Gamma', balances: [{}, {}] },
  { id: 'alpha', name: 'alpha', balances: [{}] },
  { id: 'beta', name: 'Beta', balances: [{}, {}] },
  { id: 'delta', name: 'Delta', balances: [] },
];

class MemoryStorage implements SnapshotOrganizationSortStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }

  setItem(key: string, value: string) { this.values.set(key, value); }
}

class BlockedStorage implements SnapshotOrganizationSortStorage {
  getItem(): string | null { throw new Error('storage is blocked'); }

  setItem(): void { throw new Error('storage is blocked'); }
}

test('groups organizations with the same balance count while preserving ties', () => {
  assert.deepEqual(
    sortSnapshotOrganizations(organizations, 'balance-count-desc').map(organization => organization.name),
    ['Gamma', 'Beta', 'alpha', 'Delta'],
  );
  assert.deepEqual(
    sortSnapshotOrganizations(organizations, 'balance-count-asc').map(organization => organization.name),
    ['Delta', 'alpha', 'Gamma', 'Beta'],
  );
});

test('supports alphabetical and saved organization order', () => {
  assert.deepEqual(
    sortSnapshotOrganizations(organizations, 'name').map(organization => organization.name),
    ['alpha', 'Beta', 'Delta', 'Gamma'],
  );
  assert.deepEqual(
    sortSnapshotOrganizations(organizations, 'original').map(organization => organization.name),
    organizations.map(organization => organization.name),
  );
});

test('uses the preferred organization order from settings', () => {
  assert.deepEqual(
    sortSnapshotOrganizations(
      organizations,
      'settings-order',
      ['Delta', 'Beta', 'alpha'],
    ).map(organization => organization.name),
    ['Delta', 'Beta', 'alpha', 'Gamma'],
  );
});

test('keeps existing cards fixed when balances change and only places new organizations', () => {
  const currentOrder = ['gamma', 'beta', 'alpha', 'delta'];
  const editedOrganizations = [
    { ...organizations[0], balances: [] },
    organizations[1],
    organizations[2],
    organizations[3],
  ];

  assert.deepEqual(
    reconcileSnapshotOrganizationOrder(editedOrganizations, currentOrder, 'balance-count-desc'),
    currentOrder,
  );

  assert.deepEqual(
    reconcileSnapshotOrganizationOrder(
      [...editedOrganizations, { id: 'epsilon', name: 'Epsilon', balances: [{}, {}, {}] }],
      currentOrder,
      'balance-count-desc',
    ),
    [...currentOrder, 'epsilon'],
  );
  assert.equal(
    snapshotOrganizationOrderNeedsApply(editedOrganizations, currentOrder, 'balance-count-desc'),
    true,
  );
  assert.equal(
    snapshotOrganizationOrderNeedsApply(organizations, currentOrder, 'balance-count-desc'),
    false,
  );
});

test('reconciles stale and duplicate card ids without duplicating organizations', () => {
  assert.deepEqual(
    reconcileSnapshotOrganizationOrder(
      organizations,
      ['missing', 'beta', 'beta', 'gamma'],
      'name',
    ),
    ['beta', 'gamma', 'alpha', 'delta'],
  );
});

test('remembers a valid sort and safely falls back when storage is unavailable', () => {
  const storage = new MemoryStorage();
  assert.equal(readSnapshotOrganizationSort(storage), 'settings-order');

  saveSnapshotOrganizationSort('name', storage);
  assert.equal(readSnapshotOrganizationSort(storage), 'name');

  storage.setItem('finn:snapshot-organization-sort', 'unknown');
  assert.equal(readSnapshotOrganizationSort(storage), 'settings-order');
  assert.equal(readSnapshotOrganizationSort(new BlockedStorage()), 'settings-order');
  assert.doesNotThrow(() => saveSnapshotOrganizationSort('original', new BlockedStorage()));
});
