import { useEffect, useState } from 'react';
import { API_URL } from '../types';
import type { AppSettings, ConfiguredOrganization } from '../types';

export const SETTINGS_UPDATED_EVENT = 'finn-settings-updated';

const defaultSettings: AppSettings = {
  organizations: [],
  currencies: [],
  tags: [],
  baseCurrency: 'RUB',
  secondaryCurrency: 'USD',
  cashFlow: {
    enabled: false,
    sources: [],
    taxRates: {},
    categories: []
  },
  localAI: {
    enabled: false,
    provider: 'lmstudio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: ''
  }
};

type StoredSettings = Omit<Partial<AppSettings>, 'organizations'> & { organizations?: unknown };

const normalizeOrganizations = (organizations: unknown): ConfiguredOrganization[] => {
  if (!Array.isArray(organizations)) return [];
  return organizations.flatMap(item => {
    if (typeof item === 'string') return [{ name: item }];
    if (!item || typeof item !== 'object') return [];
    const value = item as { name?: unknown; country?: unknown; archivedAt?: unknown };
    if (typeof value.name !== 'string') return [];
    return [{
      name: value.name,
      country: typeof value.country === 'string' ? value.country.trim().toUpperCase() : undefined,
      archivedAt: typeof value.archivedAt === 'string' && value.archivedAt ? value.archivedAt : undefined
    }];
  });
};

const normalizeSettings = (settings: StoredSettings): AppSettings => ({
  ...defaultSettings,
  ...settings,
  organizations: normalizeOrganizations(settings.organizations),
  currencies: settings.currencies ?? [],
  autoFetchCurrencies: settings.autoFetchCurrencies || [],
  tags: settings.tags ?? [],
  cashFlow: {
    ...defaultSettings.cashFlow!,
    ...(settings.cashFlow || {}),
    sources: settings.cashFlow?.sources || [],
    taxRates: settings.cashFlow?.taxRates || {},
    categories: settings.cashFlow?.categories ?? []
  },
  localAI: {
    ...defaultSettings.localAI!,
    ...(settings.localAI || {})
  }
});

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const handleSettingsUpdated = (event: Event) => {
      const updatedSettings = (event as CustomEvent<StoredSettings>).detail;
      if (updatedSettings) setSettings(normalizeSettings(updatedSettings));
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);

    fetch(`${API_URL}/settings`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setSettings(normalizeSettings(JSON.parse(data.value)));
      })
      .catch(err => {
        if (cancelled) return;
        console.error(err);
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated);
    };
  }, []);

  return { settings, setSettings, loading, error };
}
