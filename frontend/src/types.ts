export type Balance = {
  currency: string;
  amount: number | string;
  comment?: string;
  tags?: string[];
};

export type Organization = {
  id: string;
  name: string;
  country?: string;
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

export type ConfiguredOrganization = {
  name: string;
  country?: string;
  archivedAt?: string;
};

export type AppSettings = {
  organizations: ConfiguredOrganization[];
  currencies: string[];
  autoFetchCurrencies?: string[];
  baseCurrency?: string;
  secondaryCurrency?: string;
  tags?: string[]; // Balance analytical tagging infrastructure array
  localAI?: LocalAISettings;
};

export type LocalAISettings = {
  enabled: boolean;
  provider: 'lmstudio' | 'openai-compatible';
  baseUrl: string;
  model: string;
};

export type LocalAIModel = {
  id: string;
  object?: string;
  owned_by?: string;
  type?: string;
};

export type LocalAIStatus = {
  enabled: boolean;
  connected: boolean;
  baseUrl: string;
  selectedModel: string;
  models: LocalAIModel[];
  error?: string;
  snapshotCount: number;
  contextBytes: number;
  dataFingerprint: string;
  availableMonths: string[];
};

export type LocalAIContextFilter = {
  months?: number;
  fromMonth?: string;
  toMonth?: string;
  hideOrganizations?: boolean;
};

export type AIResponseStyle = 'strict' | 'balanced' | 'playful';

export type LocalAIContextPreview = {
  prompt: string;
  bytes: number;
  snapshotCount: number;
  dataFingerprint: string;
  availableMonths: string[];
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

export const getTagColor = (tagName: string) => {
  if (!tagName || tagName === 'untagged') return '#475569';

  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const goldenRatioConjugate = 0.618033988749895;
  const randomSeed = Math.abs(hash) / 1000;
  const hueFraction = (randomSeed * goldenRatioConjugate) % 1;
  
  const hue = (Math.round(hueFraction * 360) + 195) % 360;
  
  return `hsl(${hue}, 38%, 55%)`;
};
