import { API_URL } from '../types';
import type {
  DatasourceSource,
  DatasourceSummary,
  DatasourceSources,
  DsAcceptResult,
  DsFetchSummary,
  DsInboxItem,
  DsInboxStatus,
  FlowEntryDraft
} from '../types';

/** A refusal the UI acts on rather than just shows. */
export class DsApiError extends Error {
  code: string;

  constructor(message: string, code = '') {
    super(message);
    this.name = 'DsApiError';
    this.code = code;
  }
}

const failure = async (response: Response, fallback: string) => {
  try {
    const payload = await response.json() as { error?: string; code?: string };
    return new DsApiError(payload.error || fallback, payload.code || '');
  } catch {
    return new DsApiError(fallback);
  }
};

const readJSON = async <T>(response: Response, fallback: string): Promise<T> => {
  if (!response.ok) throw await failure(response, fallback);
  return response.json() as Promise<T>;
};

const postJSON = (path: string, body?: unknown) => fetch(`${API_URL}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});

export const fetchDatasources = async (): Promise<DatasourceSources> => (
  readJSON(await fetch(`${API_URL}/ds/sources`), 'Datasources could not be loaded.')
);

export const fetchDatasourceSummary = async (): Promise<DatasourceSummary> => (
  readJSON(await fetch(`${API_URL}/ds/summary`), 'The datasource Inbox status could not be loaded.')
);

export const confirmDatasource = async (name: string): Promise<DatasourceSource> => (
  readJSON(await postJSON(`/ds/sources/${encodeURIComponent(name)}/confirm`), 'The plugin could not be confirmed.')
);

/**
 * Runs the plugin and files what it returned. A plugin that failed still answers
 * with a summary carrying the exit code and the stderr tail, so only a refusal
 * to run at all throws.
 */
export const runDatasourceFetch = async (name: string): Promise<DsFetchSummary> => (
  readJSON(await postJSON(`/ds/sources/${encodeURIComponent(name)}/fetch`), 'The datasource could not be run.')
);

export const fetchDsInbox = async (status: DsInboxStatus | 'all' | '', source = ''): Promise<DsInboxItem[]> => {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (source) query.set('source', source);
  const suffix = query.toString() ? `?${query}` : '';
  return readJSON(await fetch(`${API_URL}/ds/inbox${suffix}`), 'The Inbox could not be loaded.');
};

export const saveDsInboxDraft = async (id: number, draft: FlowEntryDraft): Promise<DsInboxItem> => (
  readJSON(
    await fetch(`${API_URL}/ds/inbox/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    }),
    'The item could not be saved.'
  )
);

export const acceptDsInboxItems = async (ids: number[], allowDuplicates = false): Promise<DsAcceptResult> => (
  readJSON(await postJSON('/ds/inbox/accept', { ids, allowDuplicates }), 'The items could not be accepted.')
);

export const rejectDsInboxItems = async (ids: number[]): Promise<number> => {
  const payload = await readJSON<{ rejected: number }>(await postJSON('/ds/inbox/reject', { ids }), 'The items could not be rejected.');
  return payload.rejected;
};

export const reopenDsInboxItems = async (ids: number[]): Promise<number> => {
  const payload = await readJSON<{ reopened: number }>(await postJSON('/ds/inbox/reopen', { ids }), 'The items could not be reopened.');
  return payload.reopened;
};

/**
 * Deletes rows for good. Whatever this removes can be proposed again by the next
 * fetch, because deduplication lives in the rows themselves.
 */
export const clearDsInbox = async (status: DsInboxStatus | 'all', source = ''): Promise<number> => {
  const query = new URLSearchParams({ status });
  if (source) query.set('source', source);
  const payload = await readJSON<{ removed: number }>(
    await fetch(`${API_URL}/ds/inbox?${query}`, { method: 'DELETE' }),
    'The Inbox could not be cleared.'
  );
  return payload.removed;
};
