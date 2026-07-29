import { API_URL } from '../types';
import type { SqlBackupReport } from './sqlConsole';

export type DataHealthIssue = {
  code: string;
  severity: 'critical' | 'warning';
  category: string;
  title: string;
  description: string;
  count: number;
  examples?: string[];
  inspectionSql?: string;
};

export type DataHealthReport = {
  status: 'healthy' | 'warning' | 'critical';
  checkedAt: string;
  summary: {
    snapshots: number;
    flowEntries: number;
    critical: number;
    warnings: number;
  };
  issues: DataHealthIssue[];
};

type BackupInspectorFile = {
  name: string;
  size: number;
  modifiedAt: string;
  format: 'db' | 'enc';
  version?: string;
  fingerprint?: string;
  current: boolean;
};

type BackupInspectorTarget = {
  name: string;
  path: string;
  retention: number;
  files: BackupInspectorFile[];
  error?: string;
};

export type BackupInspectorData = {
  enabled: boolean;
  demo: boolean;
  encrypted: boolean;
  onlyIfChanged: boolean;
  intervalHours: number;
  databaseFingerprint?: string;
  fingerprintError?: string;
  targets: BackupInspectorTarget[];
};

export type BackupVerification = {
  status: 'verified' | 'warning' | 'failed';
  integrity?: string;
  fingerprint?: string;
  nameFingerprint?: string;
  matchesName: boolean;
  error?: string;
};

export type ExportMetadata = {
  minMonth?: string;
  maxMonth?: string;
  firstSnapshotMonth?: string;
  lastSnapshotMonth?: string;
  months: string[];
  snapshotCount: number;
  flowCount: number;
  settingsCount: number;
};

export type ExportRequest = {
  format: 'json' | 'csv';
  fromMonth: string;
  toMonth: string;
  includeSnapshots: boolean;
  includeSettings: boolean;
  includeCashFlow: boolean;
};

const responseError = async (response: Response, fallback: string) => {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
};

export const fetchDataHealth = async (): Promise<DataHealthReport> => {
  const response = await fetch(`${API_URL}/tools/health`);
  if (!response.ok) {
    throw new Error(await responseError(response, `Health check failed (${response.status}).`));
  }
  return response.json() as Promise<DataHealthReport>;
};

export const fetchBackupInspector = async (): Promise<BackupInspectorData> => {
  const response = await fetch(`${API_URL}/tools/backups`);
  if (!response.ok) {
    throw new Error(await responseError(response, `Backups could not be loaded (${response.status}).`));
  }
  return response.json() as Promise<BackupInspectorData>;
};

export const runBackupNow = async (): Promise<SqlBackupReport> => {
  const response = await fetch(`${API_URL}/tools/backups/run`, { method: 'POST' });
  const payload = await response.json() as SqlBackupReport;
  if (!response.ok) {
    throw new Error(payload.error || `Backup failed (${response.status}).`);
  }
  return payload;
};

export const verifyBackup = async (
  target: string,
  file: string
): Promise<BackupVerification> => {
  const response = await fetch(`${API_URL}/tools/backups/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, file })
  });
  const payload = await response.json() as BackupVerification;
  if (!response.ok && payload.status !== 'failed') {
    throw new Error(payload.error || `Backup verification failed (${response.status}).`);
  }
  return payload;
};

export const fetchExportMetadata = async (): Promise<ExportMetadata> => {
  const response = await fetch(`${API_URL}/tools/export`);
  if (!response.ok) {
    throw new Error(await responseError(response, `Export metadata could not be loaded (${response.status}).`));
  }
  return response.json() as Promise<ExportMetadata>;
};

const exportFilename = (header: string | null, fallback: string) => {
  const match = header?.match(/filename="?([^";]+)"?/i);
  const value = match?.[1]?.trim();
  return value && !value.includes('/') && !value.includes('\\') ? value : fallback;
};

export const downloadExport = async (request: ExportRequest): Promise<string> => {
  const response = await fetch(`${API_URL}/tools/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(await responseError(response, `Export failed (${response.status}).`));
  }

  const extension = request.format === 'json' ? 'json' : 'zip';
  const filename = exportFilename(
    response.headers.get('Content-Disposition'),
    `finn_export.${extension}`
  );
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return filename;
};
