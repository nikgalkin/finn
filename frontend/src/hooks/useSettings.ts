import { useEffect, useState } from 'react';
import { API_URL } from '../types';
import type { AppSettings } from '../types';

const defaultSettings: AppSettings = {
  organizations: [],
  currencies: [],
  tags: [],
  baseCurrency: 'RUB',
  secondaryCurrency: 'USD'
};

const normalizeSettings = (settings: Partial<AppSettings>): AppSettings => ({
  ...defaultSettings,
  ...settings,
  organizations: settings.organizations || [],
  currencies: settings.currencies || [],
  autoFetchCurrencies: settings.autoFetchCurrencies || [],
  tags: settings.tags || []
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
