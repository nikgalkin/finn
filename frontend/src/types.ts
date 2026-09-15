export type Balance = {
  currency: string;
  amount: number;
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

export type BalanceDraft = Omit<Balance, 'amount'> & { amount: number | string };

export type OrganizationDraft = Omit<Organization, 'balances'> & { balances: BalanceDraft[] };

export type SnapshotDraftData = Omit<SnapshotData, 'organizations'> & { organizations: OrganizationDraft[] };

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
  nonYieldingTags?: string[];
  cashFlow?: CashFlowSettings;
  localAI?: LocalAISettings;
};

export type CashFlowSettings = {
  enabled: boolean;
  sources: string[];
  taxRates: Record<string, number>;
  categories: string[];
};

export type FlowDirection = 'in' | 'out';
export type FlowEntryType = 'external' | 'transfer';

export type FlowEntry = {
  id: number;
  month: string;
  entryType: FlowEntryType;
  direction: FlowDirection;
  counterparty: string;
  account: string;
  tag: string;
  currency: string;
  amount: number;
  taxRate: number;
  category: string;
  comment: string;
  toAccount: string;
  toTag: string;
  toCurrency: string;
  toAmount: number;
};

/** A movement as a datasource proposed it, before anybody accepted it. */
export type FlowEntryDraft = Omit<FlowEntry, 'id'>;

export type DatasourceManifest = {
  name: string;
  version: string;
  kinds: string[];
  usesCursor: boolean;
  configKeys?: Array<{
    key: string;
    required?: boolean;
    secret?: boolean;
    env?: string;
    note?: string;
  }>;
};

export type DatasourceSource = {
  name: string;
  path: string;
  sha256?: string;
  pinned: boolean;
  confirmed: boolean;
  orphaned: boolean;
  disabled: boolean;
  runnable: boolean;
  timeoutSeconds: number;
  configError?: string;
  binaryError?: string;
  manifestError?: string;
  manifest?: DatasourceManifest;
  cursor?: string;
  lastRunAt?: string;
  lastStatus?: string;
  lastError?: string;
  pendingCount: number;
};

export type DatasourceSources = {
  enabled: boolean;
  demo: boolean;
  sources: DatasourceSource[];
  pending: number;
};

export type DatasourceSummary = {
  available: boolean;
  pending: number;
};

/**
 * `detached` is not stored anywhere: it is what an accepted item computes to
 * once the movement it created is gone.
 */
export type DsInboxStatus = 'pending' | 'accepted' | 'rejected' | 'invalid' | 'detached';

export type DsInboxKind = 'flow' | 'balance' | 'raw';

export type DsInboxItem = {
  id: number;
  source: string;
  externalId: string;
  kind: DsInboxKind;
  status: DsInboxStatus;
  month?: string;
  occurredAt?: string;
  receivedAt: string;
  raw?: string;
  draft?: FlowEntryDraft;
  note?: string;
  flowEntryId?: number;
  runId?: number;
  duplicate?: boolean;
};

export type DsFetchSummary = {
  runId: number;
  source: string;
  status: 'ok' | 'error';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number;
  stdoutBytes: number;
  itemsTotal: number;
  itemsNew: number;
  itemsSkipped: number;
  cursor?: string;
  warnings?: string[];
  error?: string;
  stderrTail?: string;
};

export type DsAcceptOutcome = {
  id: number;
  status: 'accepted' | 'duplicate' | 'invalid' | 'skipped' | 'missing';
  flowEntryId?: number;
  error?: string;
};

export type DsAcceptResult = {
  accepted: number;
  skipped: number;
  failed: number;
  results: DsAcceptOutcome[];
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
