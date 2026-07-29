import type {
  SqlColumnSource,
  SqlExecResponse,
  SqlStatementResult,
  SqlTable
} from './sqlConsole';

type SqlRowKeyPart = {
  column: string;
  value: unknown;
};

/**
 * Stable identity for a selected result cell. Coordinates are retained only for
 * display; a later result is matched by source column and the complete primary
 * key of the source table.
 */
export type SqlCellLocator = {
  statementIndex: number;
  resultColumn: string;
  source: SqlColumnSource;
  rowKey: SqlRowKeyPart[] | null;
};

type RelocatedSqlCell = {
  statement: SqlStatementResult;
  rowIndex: number;
  cellIndex: number;
};

const sourceColumnIndex = (
  statement: SqlStatementResult,
  table: string,
  column: string,
  resultColumn?: string
) => {
  const sources = statement.columnSources ?? [];
  const exact = sources.findIndex((source, index) => (
    source.table === table
    && source.column === column
    && (resultColumn === undefined || statement.columns?.[index] === resultColumn)
  ));
  if (exact >= 0 || resultColumn === undefined) return exact;
  return sources.findIndex(source => source.table === table && source.column === column);
};

export const createSqlCellLocator = (
  statement: SqlStatementResult,
  rowIndex: number,
  cellIndex: number,
  tables: SqlTable[]
): SqlCellLocator => {
  const source = statement.columnSources?.[cellIndex] ?? { table: '', column: '' };
  const locator: SqlCellLocator = {
    statementIndex: statement.index,
    resultColumn: statement.columns?.[cellIndex] ?? '',
    source,
    rowKey: null
  };

  if (!source.table || !source.column) return locator;
  const table = tables.find(candidate => candidate.name === source.table);
  const primaryKeys = table?.columns.filter(column => column.primaryKey) ?? [];
  const row = statement.rows?.[rowIndex];
  if (primaryKeys.length === 0 || !row) return locator;

  const rowKey: SqlRowKeyPart[] = [];
  for (const primaryKey of primaryKeys) {
    const index = sourceColumnIndex(statement, source.table, primaryKey.name);
    if (index < 0 || row[index] === undefined) return locator;
    rowKey.push({ column: primaryKey.name, value: row[index] });
  }
  locator.rowKey = rowKey;
  return locator;
};

/**
 * Finds the same database cell in a fresh response. Without a complete primary
 * key there is no safe way to distinguish a reordered row, so the caller must
 * keep the old selection and mark it stale instead of guessing by coordinates.
 */
export const relocateSqlCell = (
  response: SqlExecResponse,
  locator: SqlCellLocator
): RelocatedSqlCell | null => {
  if (!locator.source.table || !locator.source.column || !locator.rowKey?.length) return null;

  const statement = response.statements.find(item => item.index === locator.statementIndex);
  if (!statement || statement.kind !== 'read') return null;

  const cellIndex = sourceColumnIndex(
    statement,
    locator.source.table,
    locator.source.column,
    locator.resultColumn
  );
  if (cellIndex < 0) return null;

  const keyIndexes = locator.rowKey.map(part => ({
    ...part,
    index: sourceColumnIndex(statement, locator.source.table, part.column)
  }));
  if (keyIndexes.some(part => part.index < 0)) return null;

  const rowIndex = (statement.rows ?? []).findIndex(row => (
    keyIndexes.every(part => Object.is(row[part.index], part.value))
  ));
  if (rowIndex < 0) return null;

  return { statement, rowIndex, cellIndex };
};
