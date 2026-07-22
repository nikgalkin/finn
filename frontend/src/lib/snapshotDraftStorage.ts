import type { SnapshotData } from '../types';
import type { SnapshotDraftChangeSummary } from './snapshotDraftDiff';

export const SNAPSHOT_DRAFT_PREFIX = 'finn_draft_';
export const SNAPSHOT_DRAFT_TTL_DAYS = 90;
export const SNAPSHOT_DRAFTS_CHANGED_EVENT = 'finn:snapshot-drafts-changed';

const SNAPSHOT_DRAFT_TTL_MS = SNAPSHOT_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000;

export type SnapshotDraft = {
  version: 1;
  data: SnapshotData;
  currentMonth: string;
  durationSeconds: number;
  timestamp: number;
  changeSummary?: SnapshotDraftChangeSummary;
};

export type SnapshotDraftSummary = SnapshotDraft & {
  key: string;
  label: string;
  route: string;
};

export type DraftStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

const browserStorage = (): DraftStorage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const summaryNumberFields: Array<keyof Omit<SnapshotDraftChangeSummary, 'monthChanged'>> = [
  'organizationsAdded',
  'organizationsRemoved',
  'organizationsUpdated',
  'balancesAdded',
  'balancesRemoved',
  'balancesUpdated',
  'ratesChanged',
  'notesChanged'
];

const normalizeChangeSummary = (value: unknown): SnapshotDraftChangeSummary | undefined => {
  if (!isRecord(value) || typeof value.monthChanged !== 'boolean') return undefined;
  if (!summaryNumberFields.every(field => {
    const fieldValue = value[field];
    return typeof fieldValue === 'number' && Number.isInteger(fieldValue) && fieldValue >= 0;
  })) return undefined;
  return {
    organizationsAdded: Number(value.organizationsAdded),
    organizationsRemoved: Number(value.organizationsRemoved),
    organizationsUpdated: Number(value.organizationsUpdated),
    balancesAdded: Number(value.balancesAdded),
    balancesRemoved: Number(value.balancesRemoved),
    balancesUpdated: Number(value.balancesUpdated),
    ratesChanged: Number(value.ratesChanged),
    notesChanged: Number(value.notesChanged),
    monthChanged: value.monthChanged
  };
};

const normalizeDraft = (value: unknown): SnapshotDraft | null => {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  if (!isRecord(value.data.rates) || !Array.isArray(value.data.organizations)) return null;
  if (typeof value.currentMonth !== 'string') return null;

  const timestamp = Number(value.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;

  const durationSeconds = Number(value.durationSeconds);
  return {
    version: 1,
    data: value.data as SnapshotData,
    currentMonth: value.currentMonth,
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds : 0,
    timestamp,
    changeSummary: normalizeChangeSummary(value.changeSummary)
  };
};

const safelyRemove = (storage: DraftStorage, key: string) => {
  try {
    storage.removeItem(key);
  } catch {
    // A blocked localStorage should not break the editor.
  }
};

const notifyDraftsChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SNAPSHOT_DRAFTS_CHANGED_EVENT));
  }
};

export const readSnapshotDraft = (
  key: string,
  storage: DraftStorage | null = browserStorage(),
  now = Date.now()
): SnapshotDraft | null => {
  if (!storage) return null;

  try {
    const serialized = storage.getItem(key);
    if (!serialized) return null;

    const draft = normalizeDraft(JSON.parse(serialized));
    if (!draft || now - draft.timestamp > SNAPSHOT_DRAFT_TTL_MS) {
      safelyRemove(storage, key);
      return null;
    }
    return draft;
  } catch {
    safelyRemove(storage, key);
    return null;
  }
};

export const writeSnapshotDraft = (
  key: string,
  draft: Omit<SnapshotDraft, 'version'>,
  storage: DraftStorage | null = browserStorage()
) => {
  if (!storage) return false;

  try {
    storage.setItem(key, JSON.stringify({ ...draft, version: 1 } satisfies SnapshotDraft));
    notifyDraftsChanged();
    return true;
  } catch {
    return false;
  }
};

export const removeSnapshotDraft = (
  key: string,
  storage: DraftStorage | null = browserStorage()
) => {
  if (!storage) return;
  safelyRemove(storage, key);
  notifyDraftsChanged();
};

const draftPresentation = (key: string, draft: SnapshotDraft) => {
  const suffix = key.slice(SNAPSHOT_DRAFT_PREFIX.length);
  if (suffix === 'new') {
    return { label: `New snapshot · ${draft.currentMonth}`, route: '/snapshot/new' };
  }
  if (suffix.startsWith('copy_')) {
    const sourceMonth = suffix.slice('copy_'.length);
    return {
      label: `Copy of ${sourceMonth} · ${draft.currentMonth}`,
      route: `/snapshot/copy/${encodeURIComponent(sourceMonth)}`
    };
  }
  return {
    label: `Snapshot ${draft.currentMonth || suffix}`,
    route: `/snapshot/${encodeURIComponent(suffix)}`
  };
};

export const listSnapshotDrafts = (
  storage: DraftStorage | null = browserStorage(),
  now = Date.now()
): SnapshotDraftSummary[] => {
  if (!storage) return [];

  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith(SNAPSHOT_DRAFT_PREFIX)));

  return keys.flatMap(key => {
    const draft = readSnapshotDraft(key, storage, now);
    if (!draft) return [];
    return [{ key, ...draft, ...draftPresentation(key, draft) }];
  }).sort((left, right) => right.timestamp - left.timestamp);
};

export const pruneExpiredSnapshotDrafts = () => {
  listSnapshotDrafts();
};
