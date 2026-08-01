import assert from 'node:assert/strict';
import test from 'node:test';
import { moveActiveOrganization } from '../src/lib/settingsOrganizationOrder.ts';

const organizations = [
  { name: 'Alpha' },
  { name: 'Archived', archivedAt: '2026-01-01T00:00:00.000Z' },
  { name: 'Beta' },
  { name: 'Gamma' },
];

test('moves active organizations while leaving archived slots untouched', () => {
  assert.deepEqual(
    moveActiveOrganization(organizations, 0, 3).map(organization => organization.name),
    ['Beta', 'Archived', 'Gamma', 'Alpha'],
  );
  assert.deepEqual(
    moveActiveOrganization(organizations, 3, 0).map(organization => organization.name),
    ['Gamma', 'Archived', 'Alpha', 'Beta'],
  );
});

test('ignores invalid moves involving archived organizations', () => {
  assert.deepEqual(moveActiveOrganization(organizations, 0, 0), organizations);
  assert.deepEqual(moveActiveOrganization(organizations, 0, 1), organizations);
  assert.deepEqual(moveActiveOrganization(organizations, 1, 2), organizations);
});
