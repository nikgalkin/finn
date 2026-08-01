import assert from 'node:assert/strict';
import test from 'node:test';
import { adjacentFieldIndex } from '../src/lib/fieldNavigation.ts';

test('moves between adjacent fields in either direction', () => {
  assert.equal(adjacentFieldIndex(1, 4, 1), 2);
  assert.equal(adjacentFieldIndex(2, 4, -1), 1);
});

test('stops at the first and last field instead of wrapping', () => {
  assert.equal(adjacentFieldIndex(0, 4, -1), null);
  assert.equal(adjacentFieldIndex(3, 4, 1), null);
  assert.equal(adjacentFieldIndex(-1, 4, 1), null);
});
