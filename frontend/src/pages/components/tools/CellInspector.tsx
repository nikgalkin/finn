import { useEffect, useMemo, useState } from 'react';
import { Braces, CornerDownLeft, Copy, Table2, X } from 'lucide-react';
import { JsonTree } from './JsonTree';
import { parseJsonCell } from '../../../lib/sqlJson';
import type { SqlStatementResult, SqlTable } from '../../../lib/sqlConsole';
import {
  buildColumnAssignment,
  buildJsonAssignment,
  buildJsonElementMatch,
  buildMatchedElementAssignment,
  buildUpdateStatement,
  defaultWhereColumn,
  isUnaryOperator,
  rangeFromValues,
  splitJsonPathAtFirstIndex,
  toEditableText,
  WHERE_OPERATORS
} from '../../../lib/sqlBuilder';
import type { WhereClause, WhereOperator } from '../../../lib/sqlBuilder';

type CellInspectorProps = {
  statement: SqlStatementResult;
  rowIndex: number;
  cellIndex: number;
  /** True when the cell was Alt-clicked: condition on that column, not the key. */
  conditionOnColumn: boolean;
  /** The panel is showing values from an earlier result. */
  stale: boolean;
  tables: SqlTable[];
  onInsert: (snippet: string) => void;
  onClose: () => void;
};

export function CellInspector({
  statement,
  rowIndex,
  cellIndex,
  conditionOnColumn,
  stale,
  tables,
  onInsert,
  onClose
}: CellInspectorProps) {
  const resultColumn = statement.columns?.[cellIndex] ?? '';
  const source = statement.columnSources?.[cellIndex];
  const cellValue = statement.rows?.[rowIndex]?.[cellIndex];
  const table = tables.find(candidate => candidate.name === source?.table);
  const json = useMemo(() => parseJsonCell(cellValue), [cellValue]);

  /** Values of this row that belong to the same table, keyed by table column. */
  const rowValues = useMemo(() => {
    const values: Record<string, unknown> = {};
    if (!source?.table) return values;
    statement.columnSources?.forEach((candidate, index) => {
      if (candidate.table === source.table && candidate.column) {
        values[candidate.column] = statement.rows?.[rowIndex]?.[index];
      }
    });
    return values;
  }, [statement, rowIndex, source]);

  /** Every value the result shows for a table column, used for range prefill. */
  const columnValues = useMemo(() => {
    const values: Record<string, unknown[]> = {};
    if (!source?.table) return values;
    statement.columnSources?.forEach((candidate, index) => {
      if (candidate.table === source.table && candidate.column) {
        values[candidate.column] = (statement.rows ?? []).map(row => row[index]);
      }
    });
    return values;
  }, [statement, source]);

  /** Fresh condition for the clicked cell, honouring the Alt-click modifier. */
  const initialWhere = (): WhereClause => {
    const column = conditionOnColumn
      ? (source?.column ?? '')
      : defaultWhereColumn(table?.columns ?? [], rowValues, source?.column ?? '');
    return {
      mode: 'column',
      column,
      jsonColumn: source?.column ?? '',
      jsonPath: '',
      anyElement: false,
      operator: '=',
      value: toEditableText(rowValues[column] ?? ''),
      secondValue: ''
    };
  };

  const [jsonPath, setJsonPath] = useState<string | null>(null);
  const [selectedJsonValue, setSelectedJsonValue] = useState<unknown>(undefined);
  const [newValue, setNewValue] = useState(() => toEditableText(cellValue));
  const [where, setWhere] = useState<WhereClause>(initialWhere);
  const [everyMatch, setEveryMatch] = useState(false);
  const [copied, setCopied] = useState(false);

  // Selecting a different cell restarts the builder.
  useEffect(() => {
    setJsonPath(null);
    setSelectedJsonValue(undefined);
    setNewValue(toEditableText(cellValue));
    setWhere(initialWhere());
    setEveryMatch(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statement.index, rowIndex, cellIndex, conditionOnColumn]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  /** Switching operator or column refills the operands with what fits. */
  const updateWhere = (patch: Partial<WhereClause>) => {
    setWhere(current => {
      const next = { ...current, ...patch };
      const columnChanged = patch.column !== undefined && patch.column !== current.column;
      const operatorChanged = patch.operator !== undefined && patch.operator !== current.operator;

      // Only column mode can refill from the result; JSON operands are typed.
      if (next.mode === 'column' && (columnChanged || operatorChanged)) {
        if (next.operator === 'BETWEEN') {
          const range = rangeFromValues(columnValues[next.column] ?? []);
          next.value = range?.from ?? toEditableText(rowValues[next.column] ?? '');
          next.secondValue = range?.to ?? '';
        } else if (isUnaryOperator(next.operator)) {
          next.value = '';
          next.secondValue = '';
        } else if (columnChanged || isUnaryOperator(current.operator) || current.operator === 'BETWEEN') {
          next.value = toEditableText(rowValues[next.column] ?? '');
          next.secondValue = '';
        }
      }
      return next;
    });
  };

  /**
   * Turns the node picked in the tree into the condition. An indexed path
   * defaults to matching any element, which is what "every row whose
   * organizations contain this id" needs.
   */
  const conditionOnJsonNode = (path: string, value: unknown) => {
    setWhere(current => ({
      ...current,
      mode: 'json',
      jsonColumn: source?.column ?? resultColumn,
      jsonPath: path,
      anyElement: splitJsonPathAtFirstIndex(path) !== null,
      operator: '=',
      value: toEditableText(value),
      secondValue: ''
    }));
  };

  const canScanElements = splitJsonPathAtFirstIndex(where.jsonPath) !== null;

  // Rewriting every matching element only makes sense when the value being set
  // and the condition sit in the same array.
  const setSplit = jsonPath ? splitJsonPathAtFirstIndex(jsonPath) : null;
  const matchSplit = where.mode === 'json' && where.anyElement
    ? splitJsonPathAtFirstIndex(where.jsonPath)
    : null;
  const elementMatch = matchSplit ? buildJsonElementMatch(where) : null;
  const canUpdateEveryMatch = Boolean(
    setSplit && matchSplit && elementMatch && setSplit.arrayPath === matchSplit.arrayPath
  );

  const targetColumn = source?.column ?? resultColumn;
  const assignment = everyMatch && canUpdateEveryMatch && setSplit && elementMatch
    ? buildMatchedElementAssignment({
      column: targetColumn,
      arrayPath: setSplit.arrayPath,
      elementPath: setSplit.elementPath,
      text: newValue,
      match: elementMatch
    })
    : json && jsonPath
      ? buildJsonAssignment(targetColumn, jsonPath, newValue)
      : buildColumnAssignment(targetColumn, newValue);

  const preview = source?.table
    ? buildUpdateStatement({ table: source.table, assignment, where })
    : null;

  const copyValue = () => {
    void navigator.clipboard?.writeText(json ? JSON.stringify(json.value, null, 2) : toEditableText(cellValue));
    setCopied(true);
  };

  return (
    <aside className="sql-console-json">
      <header className="sql-console-json-header">
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          {json ? <Braces size={15} color="var(--accent)" /> : <Table2 size={15} color="var(--accent)" />}
          <strong className="cell-inspector-title">
            {source?.table ? `${source.table}.${source.column}` : resultColumn}
          </strong>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={copyValue}>
            <Copy size={13} /> {copied ? 'Copied' : 'Value'}
          </button>
          <button className="btn" aria-label="Close" title="Close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </header>

      {stale && (
        <p className="cell-inspector-stale">
          The last run no longer returns this cell, so these values are from an earlier result.
        </p>
      )}

      <div className="sql-console-json-body">
        {json ? (
          <JsonTree
            value={json.value}
            selectedPath={jsonPath}
            onSelect={(path, picked) => {
              setJsonPath(path);
              setSelectedJsonValue(picked);
              setNewValue(toEditableText(picked));
            }}
          />
        ) : (
          <div className="cell-inspector-plain">
            <span className="cell-inspector-label">Current value</span>
            <code className="cell-inspector-current">{toEditableText(cellValue)}</code>
          </div>
        )}
      </div>

      {!source?.table ? (
        <footer className="sql-console-json-footer">
          <p className="sql-console-hint">
            This column is computed, so it cannot be traced back to a table. Select a column that
            comes straight from a table to build an <code>UPDATE</code>.
          </p>
        </footer>
      ) : (
        <footer className="sql-console-json-footer cell-inspector-builder">
          {json && !jsonPath && (
            <p className="sql-console-hint">Pick a value in the tree to target it.</p>
          )}

          {(!json || jsonPath) && (
            <>
              {json && jsonPath && (
                <div className="cell-inspector-path-row">
                  <code className="json-selected-path">{jsonPath}</code>
                  <button
                    type="button"
                    className="btn"
                    title="Condition on this path instead of editing it"
                    onClick={() => conditionOnJsonNode(jsonPath, selectedJsonValue)}
                  >
                    Use in Where
                  </button>
                </div>
              )}

              <label className="cell-inspector-field">
                <span className="cell-inspector-label">Set to</span>
                <input
                  id="cell-inspector-new-value"
                  name="cell-inspector-new-value"
                  className="input"
                  value={newValue}
                  onChange={event => setNewValue(event.target.value)}
                  spellCheck={false}
                />
              </label>

              {setSplit && (
                <label
                  className={`cell-inspector-check${canUpdateEveryMatch ? '' : ' is-disabled'}`}
                  title={canUpdateEveryMatch
                    ? 'Rewrite the array so every matching element is updated, not just this index'
                    : `Needs a condition scanning ${setSplit.arrayPath} — set Where to JSON path and tick "Match any element"`}
                >
                  <input
                    id="cell-inspector-update-every-match"
                    name="cell-inspector-update-every-match"
                    type="checkbox"
                    checked={everyMatch && canUpdateEveryMatch}
                    disabled={!canUpdateEveryMatch}
                    onChange={event => setEveryMatch(event.target.checked)}
                  />
                  <span>Update every matching element, not just this index</span>
                </label>
              )}

              <div className="cell-inspector-where-head">
                <span className="cell-inspector-label">Where</span>
                {json && (
                  <div className="cell-inspector-modes">
                    <button
                      type="button"
                      className={where.mode === 'column' ? 'is-active' : undefined}
                      onClick={() => updateWhere({ mode: 'column' })}
                    >
                      Column
                    </button>
                    <button
                      type="button"
                      className={where.mode === 'json' ? 'is-active' : undefined}
                      onClick={() => updateWhere({
                        mode: 'json',
                        jsonColumn: source.column,
                        jsonPath: where.jsonPath || jsonPath || ''
                      })}
                    >
                      JSON path
                    </button>
                  </div>
                )}
              </div>

              {where.mode === 'json' ? (
                <>
                  <div className="cell-inspector-where">
                    <input
                      id="cell-inspector-json-path"
                      name="cell-inspector-json-path"
                      className="input"
                      value={where.jsonPath}
                      placeholder="$.organizations[0].id"
                      onChange={event => updateWhere({ jsonPath: event.target.value })}
                      spellCheck={false}
                    />
                    <select
                      id="cell-inspector-json-operator"
                      name="cell-inspector-json-operator"
                      className="input"
                      value={where.operator}
                      onChange={event => updateWhere({ operator: event.target.value as WhereOperator })}
                    >
                      {WHERE_OPERATORS.map(operator => (
                        <option key={operator} value={operator}>{operator}</option>
                      ))}
                    </select>
                  </div>
                  {jsonPath && jsonPath !== where.jsonPath && (
                    <button
                      type="button"
                      className="cell-inspector-use-path"
                      onClick={() => updateWhere({
                        jsonPath,
                        anyElement: splitJsonPathAtFirstIndex(jsonPath) !== null
                      })}
                    >
                      Use the selected path: <code>{jsonPath}</code>
                    </button>
                  )}
                  <label
                    className={`cell-inspector-check${canScanElements ? '' : ' is-disabled'}`}
                    title={canScanElements
                      ? 'Scan every element of the array instead of one index'
                      : 'The path has no array index to scan'}
                  >
                    <input
                      id="cell-inspector-match-any-element"
                      name="cell-inspector-match-any-element"
                      type="checkbox"
                      checked={where.anyElement && canScanElements}
                      disabled={!canScanElements}
                      onChange={event => updateWhere({ anyElement: event.target.checked })}
                    />
                    <span>Match any element of the array</span>
                  </label>
                </>
              ) : (
                <div className="cell-inspector-where">
                  <select
                    id="cell-inspector-column"
                    name="cell-inspector-column"
                    className="input"
                    value={where.column}
                    onChange={event => updateWhere({ column: event.target.value })}
                  >
                    {(table?.columns ?? []).map(column => (
                      <option key={column.name} value={column.name}>
                        {column.name}{column.primaryKey ? ' (pk)' : ''}
                      </option>
                    ))}
                  </select>
                  <select
                    id="cell-inspector-column-operator"
                    name="cell-inspector-column-operator"
                    className="input"
                    value={where.operator}
                    onChange={event => updateWhere({ operator: event.target.value as WhereOperator })}
                  >
                    {WHERE_OPERATORS.map(operator => (
                      <option key={operator} value={operator}>{operator}</option>
                    ))}
                  </select>
                </div>
              )}

              {!isUnaryOperator(where.operator) && (
                <div className="cell-inspector-where">
                  <input
                    id="cell-inspector-where-value"
                    name="cell-inspector-where-value"
                    className="input"
                    value={where.value}
                    placeholder={where.operator === 'IN' ? 'a, b, c' : 'value'}
                    onChange={event => updateWhere({ value: event.target.value })}
                    spellCheck={false}
                  />
                  {where.operator === 'BETWEEN' && (
                    <input
                      id="cell-inspector-where-second-value"
                      name="cell-inspector-where-second-value"
                      className="input"
                      value={where.secondValue}
                      placeholder="upper bound"
                      onChange={event => updateWhere({ secondValue: event.target.value })}
                      spellCheck={false}
                    />
                  )}
                </div>
              )}

              <pre className="cell-inspector-preview">{preview}</pre>

              <div className="sql-console-json-actions">
                <button className="btn btn-primary" onClick={() => preview && onInsert(preview)}>
                  <CornerDownLeft size={13} /> Insert statement
                </button>
                {json && jsonPath && (
                  <button
                    className="btn"
                    onClick={() => onInsert(`json_extract(${source.column}, '${jsonPath}')`)}
                  >
                    json_extract
                  </button>
                )}
              </div>
            </>
          )}
        </footer>
      )}
    </aside>
  );
}
