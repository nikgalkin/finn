export const SETTINGS_CACHE_KEY = 'finn:settings-cache';

export type SettingsCacheStorage = Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage = (): SettingsCacheStorage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export function readCachedSettings<T>(
  storage: SettingsCacheStorage | null = browserStorage()
): T | null {
  try {
    const raw = storage?.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function writeCachedSettings(
  settings: unknown,
  storage: SettingsCacheStorage | null = browserStorage()
): void {
  try {
    storage?.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}
