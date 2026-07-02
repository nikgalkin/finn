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
  rates: Record<string, number | string>; // Currency to RUB rate
  organizations: Organization[];
};

export type Snapshot = {
  id: number;
  month: string;
  data: string; // JSON string from DB
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
