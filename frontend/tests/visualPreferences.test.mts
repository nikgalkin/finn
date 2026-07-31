import assert from 'node:assert/strict';
import test from 'node:test';
import { readVisualPreferences, type PreferenceStorage } from '../src/lib/visualPreferences.ts';

class MemoryStorage implements PreferenceStorage {
  private values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }

  setItem(key: string, value: string) { this.values.set(key, value); }
}

class BlockedStorage implements PreferenceStorage {
  getItem(): string | null { throw new Error('storage is blocked'); }

  setItem(): void { throw new Error('storage is blocked'); }
}

const defaults = {
  loader: 'bmo',
  logo: 'plain',
  logoGradient: true,
  netWorthCard: 'split',
  netWorthStrip: 'allocation'
};

test('falls back to defaults when the browser blocks storage access', () => {
  assert.deepEqual(readVisualPreferences(null), defaults);
  assert.deepEqual(readVisualPreferences(new BlockedStorage()), defaults);
});

test('reads stored choices and keeps the gradient on unless it was turned off', () => {
  const storage = new MemoryStorage();
  storage.setItem('finn:loader-choice', 'marceline');
  storage.setItem('finn:logo-choice', 'face');

  assert.deepEqual(readVisualPreferences(storage), {
    loader: 'marceline',
    logo: 'face',
    logoGradient: true,
    netWorthCard: 'split',
    netWorthStrip: 'allocation',
  });

  storage.setItem('finn:logo-gradient', 'false');
  assert.equal(readVisualPreferences(storage).logoGradient, false);
});

test('reads the net worth card choice and ignores unknown layouts', () => {
  const storage = new MemoryStorage();
  storage.setItem('finn:net-worth-card', 'split');
  assert.equal(readVisualPreferences(storage).netWorthCard, 'split');

  storage.setItem('finn:net-worth-card', 'stacked');
  assert.equal(readVisualPreferences(storage).netWorthCard, 'split');
});

test('reads the net worth strip choice and ignores unknown content', () => {
  const storage = new MemoryStorage();
  storage.setItem('finn:net-worth-strip', 'history');
  assert.equal(readVisualPreferences(storage).netWorthStrip, 'history');

  storage.setItem('finn:net-worth-strip', 'sparkline');
  assert.equal(readVisualPreferences(storage).netWorthStrip, 'allocation');
});

test('accepts the standard loader choice', () => {
  const storage = new MemoryStorage();
  storage.setItem('finn:loader-choice', 'standard');

  assert.equal(readVisualPreferences(storage).loader, 'standard');
});

test('ignores choices that no longer exist', () => {
  const storage = new MemoryStorage();
  storage.setItem('finn:logo-choice', 'stacked');
  storage.setItem('finn:loader-choice', 'jake');

  assert.deepEqual(readVisualPreferences(storage), defaults);
});
