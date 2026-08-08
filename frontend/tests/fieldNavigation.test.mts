import assert from 'node:assert/strict';
import test from 'node:test';
import { adjacentFieldIndex } from '../src/lib/fieldNavigation.ts';

test('moves between adjacent fields in either direction', () => {
  assert.equal(adjacentFieldIndex(1, 4, 1), 2);
  assert.equal(adjacentFieldIndex(2, 4, -1), 1);
});

test('wraps between the first and last field', () => {
  assert.equal(adjacentFieldIndex(0, 4, -1), 3);
  assert.equal(adjacentFieldIndex(3, 4, 1), 0);
});

test('ignores a field outside the navigation group', () => {
  assert.equal(adjacentFieldIndex(-1, 4, 1), null);
  assert.equal(adjacentFieldIndex(4, 4, -1), null);
});

test('stays put when the group holds a single field', () => {
  assert.equal(adjacentFieldIndex(0, 1, 1), null);
  assert.equal(adjacentFieldIndex(0, 1, -1), null);
});
