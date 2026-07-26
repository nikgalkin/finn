import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSqlCellLocator,
  relocateSqlCell
} from '../src/lib/sqlCellLocator.ts';
import type {
  SqlExecResponse,
  SqlStatementResult,
  SqlTable
} from '../src/lib/sqlConsole.ts';

const accountsTable: SqlTable = {
  name: 'accounts',
  readOnly: false,
  rowCount: 2,
  columns: [
    { name: 'id', type: 'INTEGER', notNull: true, primaryKey: true },
    { name: 'name', type: 'TEXT', notNull: true, primaryKey: false }
  ]
};

const statement = (
  rows: unknown[][],
  table = 'accounts',
  columns = ['id', 'name']
): SqlStatementResult => ({
  index: 1,
  sql: `SELECT ${columns.join(', ')} FROM ${table}`,
  kind: 'read',
  columns,
  columnSources: columns.map(column => ({ table, column })),
  rows,
  rowCount: rows.length,
  rowsAffected: 0,
  truncated: false,
  durationMs: 1
});

const response = (result: SqlStatementResult): SqlExecResponse => ({
  mode: 'dry_run',
  committed: false,
  statements: [result],
  totalWrites: 0,
  durationMs: 1
});

test('relocates a selected cell by primary key after rows are reordered', () => {
  const original = statement([[1, 'Alpha'], [2, 'Beta']]);
  const locator = createSqlCellLocator(original, 0, 1, [accountsTable]);
  const reordered = statement([[2, 'Beta'], [1, 'Alpha']]);

  const relocated = relocateSqlCell(response(reordered), locator);
  assert.ok(relocated);
  assert.equal(relocated.rowIndex, 1);
  assert.equal(relocated.cellIndex, 1);
  assert.equal(relocated.statement.rows?.[relocated.rowIndex]?.[relocated.cellIndex], 'Alpha');
});

test('does not attach a selected cell to a different table with matching coordinates', () => {
  const original = statement([[1, 'Alpha']]);
  const locator = createSqlCellLocator(original, 0, 1, [accountsTable]);
  const otherTable = statement([[1, 'Wrong row']], 'archived_accounts');

  assert.equal(relocateSqlCell(response(otherTable), locator), null);
});

test('refuses to guess when the result does not carry the primary key', () => {
  const withoutId = statement([['Alpha'], ['Beta']], 'accounts', ['name']);
  const locator = createSqlCellLocator(withoutId, 0, 0, [accountsTable]);
  const reordered = statement([['Beta'], ['Alpha']], 'accounts', ['name']);

  assert.equal(locator.rowKey, null);
  assert.equal(relocateSqlCell(response(reordered), locator), null);
});
