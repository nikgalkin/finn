import { useEffect, useState } from 'react';
import { API_URL } from '../types';
import type { AppSettings, ConfiguredOrganization } from '../types';

const defaultSettings: AppSettings = {
  organizations: [],
  currencies: [],
  tags: [],
  baseCurrency: 'RUB',
  secondaryCurrency: 'USD',
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
    const value = item as { name?: unknown; country?: unknown };
    if (typeof value.name !== 'string') return [];
    return [{
      name: value.name,
      country: typeof value.country === 'string' ? value.country.trim().toUpperCase() : undefined
    }];
  });
};

const normalizeSettings = (settings: StoredSettings): AppSettings => ({
  ...defaultSettings,
  ...settings,
  organizations: normalizeOrganizations(settings.organizations),
  currencies: settings.currencies || [],
  autoFetchCurrencies: settings.autoFetchCurrencies || [],
  tags: settings.tags || [],
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
    };
  }, []);

  return { settings, setSettings, loading, error };
}
