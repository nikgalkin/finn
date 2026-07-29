import { API_URL } from '../types';

type SqlColumn = {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
};

export type SqlTable = {
  name: string;
  readOnly: boolean;
  rowCount: number;
  columns: SqlColumn[];
};

/** Where a result column came from; both fields are empty for computed columns. */
export type SqlColumnSource = {
  table: string;
  column: string;
};

export type SqlStatementResult = {
  index: number;
  sql: string;
  kind: 'read' | 'write';
  columns?: string[];
  columnSources?: SqlColumnSource[];
  rows?: unknown[][];
  rowCount: number;
  rowsAffected: number;
  truncated: boolean;
  durationMs: number;
};

type SqlBackupTarget = {
  name: string;
  path: string;
  status: 'current' | 'created' | 'created_with_warning' | 'failed';
  error?: string;
};

export type SqlBackupReport = {
  status: 'disabled' | 'skipped' | 'success' | 'partial' | 'failed' | 'bypassed';
  targets?: SqlBackupTarget[];
  error?: string;
};

export type SqlExecResponse = {
  mode: 'dry_run' | 'apply';
  committed: boolean;
  statements: SqlStatementResult[];
  totalWrites: number;
  durationMs: number;
  backup?: SqlBackupReport;
};

type SqlExecError = {
  message: string;
  statementIndex?: number;
  sql?: string;
  backup?: SqlBackupReport;
  backupFailed?: boolean;
};

export class SqlConsoleError extends Error {
  statementIndex?: number;
  sql?: string;
  backup?: SqlBackupReport;
  backupFailed: boolean;

  constructor(details: SqlExecError) {
    super(details.message);
    this.name = 'SqlConsoleError';
    this.statementIndex = details.statementIndex;
    this.sql = details.sql;
    this.backup = details.backup;
    this.backupFailed = details.backupFailed ?? false;
  }
}

export const fetchSqlSchema = async (): Promise<SqlTable[]> => {
  const response = await fetch(`${API_URL}/sql/schema`);
  if (!response.ok) {
    throw new Error(`Failed to load the database schema (${response.status}).`);
  }
  const payload = await response.json() as { tables?: SqlTable[] };
  return payload.tables ?? [];
};

export const executeSql = async (
  sql: string,
  mode: 'dry_run' | 'apply',
  skipBackup = false
): Promise<SqlExecResponse> => {
  const response = await fetch(`${API_URL}/sql/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, mode, skipBackup })
  });

  const payload = await response.json() as Partial<SqlExecResponse> & {
    error?: string;
    statementIndex?: number;
    sql?: string;
    backup?: SqlBackupReport;
  };

  if (!response.ok) {
    throw new SqlConsoleError({
      message: payload.error || `The query failed (${response.status}).`,
      statementIndex: payload.statementIndex,
      sql: payload.sql,
      backup: payload.backup,
      backupFailed: response.status === 503
    });
  }

  return payload as SqlExecResponse;
};

/** Renders a compact one-line summary of what a dry run would change. */
export const summarizeWrites = (result: SqlExecResponse): string => {
  const writes = result.statements.filter(statement => statement.kind === 'write');
  if (writes.length === 0) return 'No rows would change.';

  const parts = writes.map(statement => {
    const verb = statement.sql.trim().split(/\s+/)[0].toUpperCase();
    const rows = statement.rowsAffected === 1 ? '1 row' : `${statement.rowsAffected} rows`;
    return `${verb} ${rows}`;
  });
  return `${parts.join(', ')}.`;
};
