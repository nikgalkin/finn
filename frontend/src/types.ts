export type Balance = {
  currency: string;
  amount: number | string;
  comment?: string;
};

export type Organization = {
  id: string;
  name: string;
  comment?: string;
  balances: Balance[];
};

export type SnapshotData = {
  comment?: string;
  rates: Record<string, number | string>;
  organizations: Organization[];
};

export type Snapshot = {
  id: number;
  month: string;
  data: string;
  duration_seconds?: number;
};

export type ParsedSnapshot = Omit<Snapshot, 'data'> & {
  data: SnapshotData;
};

export type AppSettings = {
  organizations: string[];
  currencies: string[];
  autoFetchCurrencies?: string[];
  baseCurrency?: string;
};

export const API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:8080/api';

export const getCurrencyColor = (currency: string) => {
  if (!currency) return 'hsl(0, 0%, 50%)';
  
  const cur = currency.toUpperCase().trim();

  const fixedColors: Record<string, string> = {
    'RUB': 'hsl(0, 19%, 52%)',
    'USD': 'hsl(130, 45%, 65%)', 
    'EUR': 'hsl(35, 75%, 70%)',
  };

  if (fixedColors[cur]) {
    return fixedColors[cur];
  }

  let hash = 0;
  for (let i = 0; i < cur.length; i++) {
    hash = cur.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360; 
  return `hsl(${hue}, 65%, 75%)`;
};
