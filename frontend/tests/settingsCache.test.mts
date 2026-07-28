import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SETTINGS_CACHE_KEY,
  readCachedSettings,
  writeCachedSettings,
  type SettingsCacheStorage,
} from '../src/lib/settingsCache.ts';

class MemoryStorage implements SettingsCacheStorage {
  values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }

  setItem(key: string, value: string) { this.values.set(key, value); }
}

class BlockedStorage implements SettingsCacheStorage {
  getItem(): string | null { throw new Error('storage is blocked'); }

  setItem(): void { throw new Error('storage is blocked'); }
}

test('returns nothing when there is no cache to read', () => {
  assert.equal(readCachedSettings(null), null);
  assert.equal(readCachedSettings(new MemoryStorage()), null);
});

test('survives blocked storage in both directions', () => {
  assert.equal(readCachedSettings(new BlockedStorage()), null);
  assert.doesNotThrow(() => writeCachedSettings({ baseCurrency: 'RUB' }, new BlockedStorage()));
  assert.doesNotThrow(() => writeCachedSettings({ baseCurrency: 'RUB' }, null));
});

test('round-trips a settings object', () => {
  const storage = new MemoryStorage();
  writeCachedSettings({ baseCurrency: 'RUB', cashFlow: { enabled: true } }, storage);

  assert.deepEqual(readCachedSettings(storage), {
    baseCurrency: 'RUB',
    cashFlow: { enabled: true },
  });
});

test('ignores cache entries that are not a settings object', () => {
  const storage = new MemoryStorage();

  storage.setItem(SETTINGS_CACHE_KEY, 'not json');
  assert.equal(readCachedSettings(storage), null);

  storage.setItem(SETTINGS_CACHE_KEY, '[1, 2, 3]');
  assert.equal(readCachedSettings(storage), null);

  storage.setItem(SETTINGS_CACHE_KEY, 'null');
  assert.equal(readCachedSettings(storage), null);
});
