import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTreeDiffData } from '../src/lib/snapshotDiff.ts';
import type { Balance, ParsedSnapshot } from '../src/types.ts';

const snapshot = (month: string, balances: Balance[], orgName = 'T-Bank'): ParsedSnapshot => ({
  id: Number(month.replace('-', '')),
  month,
  data: {
    rates: { RUB: 1, USD: 78 },
    organizations: [{ id: 'account', name: orgName, balances }]
  }
});

const balanceOf = (tree: ReturnType<typeof buildTreeDiffData>, currency: string) => {
  const balance = tree[0].balances.find(item => item.currency === currency);
  assert.ok(balance, `no ${currency} row in the diff`);
  return balance;
};

test('keeps a single balance per currency untouched', () => {
  const tree = buildTreeDiffData(
    snapshot('2026-08', [{ currency: 'USD', amount: 15500, tags: ['checking'] }]),
    snapshot('2026-07', [{ currency: 'USD', amount: 14500, tags: ['checking'] }]),
    false
  );

  const usd = balanceOf(tree, 'USD');
  assert.equal(usd.previousAmt, 14500);
  assert.equal(usd.currentAmt, 15500);
  assert.equal(usd.delta, 1000);
  assert.equal(usd.status, 'up');
  assert.deepEqual(usd.currentTags, ['checking']);
  assert.equal(tree[0].hasChanges, true);
});

test('sums every balance an organization holds in the same currency', () => {
  const tree = buildTreeDiffData(
    snapshot('2026-08', [
      { currency: 'USD', amount: 15000, tags: ['checking'] },
      { currency: 'USD', amount: 500, tags: ['checking'] }
    ]),
    snapshot('2026-07', [
      { currency: 'USD', amount: 14000, tags: ['checking'] },
      { currency: 'USD', amount: 500, tags: ['checking'] }
    ]),
    false
  );

  assert.equal(tree[0].balances.length, 1);
  const usd = balanceOf(tree, 'USD');
  assert.equal(usd.previousAmt, 14500);
  assert.equal(usd.currentAmt, 15500);
  assert.equal(usd.delta, 1000);
});

test('detects a change confined to a later balance of the same currency', () => {
  const tree = buildTreeDiffData(
    snapshot('2026-08', [
      { currency: 'USD', amount: 14000, tags: ['checking'] },
      { currency: 'USD', amount: 1500, tags: ['stocks'] }
    ]),
    snapshot('2026-07', [
      { currency: 'USD', amount: 14000, tags: ['checking'] },
      { currency: 'USD', amount: 500, tags: ['checking'] }
    ]),
    false
  );

  const usd = balanceOf(tree, 'USD');
  assert.equal(usd.delta, 1000);
  assert.equal(usd.status, 'up');
  assert.equal(usd.tagsChanged, true);
  assert.deepEqual(usd.currentTags, ['checking', 'stocks']);
  assert.equal(tree[0].hasChanges, true);
});

test('survives the changes-only filter when only a later balance moved', () => {
  const tree = buildTreeDiffData(
    snapshot('2026-08', [
      { currency: 'USD', amount: 14000, tags: ['checking'] },
      { currency: 'USD', amount: 1500, tags: ['checking'] }
    ]),
    snapshot('2026-07', [
      { currency: 'USD', amount: 14000, tags: ['checking'] },
      { currency: 'USD', amount: 500, tags: ['checking'] }
    ]),
    true
  );

  assert.equal(tree.length, 1);
  assert.equal(balanceOf(tree, 'USD').delta, 1000);
});

test('reports untagged money alongside the tags of its merged siblings', () => {
  const tree = buildTreeDiffData(
    snapshot('2026-08', [
      { currency: 'USD', amount: 100, tags: ['checking'] },
      { currency: 'USD', amount: 50 }
    ]),
    snapshot('2026-07', [
      { currency: 'USD', amount: 100, tags: ['checking'] },
      { currency: 'USD', amount: 50 }
    ]),
    false
  );

  const usd = balanceOf(tree, 'USD');
  assert.deepEqual(usd.currentTags, ['checking', 'untagged']);
  assert.equal(usd.tagsChanged, false);
  assert.equal(tree[0].hasChanges, false);
});

test('joins the comments of merged balances and prefers the current snapshot', () => {
  const tree = buildTreeDiffData(
    snapshot('2026-08', [
      { currency: 'USD', amount: 100, tags: ['checking'], comment: 'main' },
      { currency: 'USD', amount: 50, tags: ['checking'], comment: 'reserve' }
    ]),
    snapshot('2026-07', [{ currency: 'USD', amount: 150, tags: ['checking'], comment: 'old note' }]),
    false
  );

  assert.equal(balanceOf(tree, 'USD').comment, 'main\nreserve');
});

test('still separates different currencies inside one organization', () => {
  const tree = buildTreeDiffData(
    snapshot('2026-08', [
      { currency: 'RUB', amount: 292050, tags: ['checking'] },
      { currency: 'USD', amount: 15500, tags: ['checking'] }
    ]),
    snapshot('2026-07', [
      { currency: 'RUB', amount: 282050, tags: ['checking'] },
      { currency: 'USD', amount: 14500, tags: ['checking'] }
    ]),
    false
  );

  assert.equal(tree[0].balances.length, 2);
  assert.equal(balanceOf(tree, 'RUB').delta, 10000);
  assert.equal(balanceOf(tree, 'USD').delta, 1000);
});

test('marks a currency the organization no longer holds as deleted', () => {
  const tree = buildTreeDiffData(
    snapshot('2026-08', [{ currency: 'RUB', amount: 100, tags: ['checking'] }]),
    snapshot('2026-07', [
      { currency: 'RUB', amount: 100, tags: ['checking'] },
      { currency: 'USD', amount: 10, tags: ['checking'] },
      { currency: 'USD', amount: 5, tags: ['checking'] }
    ]),
    false
  );

  const usd = balanceOf(tree, 'USD');
  assert.equal(usd.status, 'deleted');
  assert.equal(usd.previousAmt, 15);
  assert.equal(usd.currentAmt, 0);
});
