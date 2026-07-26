import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { sql, SQLite } from '@codemirror/lang-sql';
import type { SQLNamespace } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  AlertTriangle,
  Braces,
  Check,
  Database,
  Eye,
  History,
  Key,
  Keyboard,
  Lock,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Table2,
  X
} from 'lucide-react';
import { ModalPortal } from '../ModalPortal';
import { CellInspector } from './CellInspector';
import {
  executeSql,
  fetchSqlSchema,
  summarizeWrites,
  SqlConsoleError
} from '../../../lib/sqlConsole';
import type { SqlExecResponse, SqlStatementResult, SqlTable } from '../../../lib/sqlConsole';
import {
  createSqlCellLocator,
  relocateSqlCell
} from '../../../lib/sqlCellLocator';
import type { SqlCellLocator } from '../../../lib/sqlCellLocator';
import { formatCellValue, parseJsonCell } from '../../../lib/sqlJson';
import { primaryModifierLabel } from '../../../lib/hotkeys';
import type { JsonCell } from '../../../lib/sqlJson';

type SelectedCell = {
  /** Snapshot of the statement the cell came from, so the panel survives a run
   *  that no longer returns it. */
  statement: SqlStatementResult;
  rowIndex: number;
  cellIndex: number;
  /** Source column plus the source row's complete primary key. */
  locator: SqlCellLocator;
  /** Alt-click: build the condition on this column rather than on the key. */
  conditionOnColumn: boolean;
  /** The current result no longer contains this cell; values shown are older. */
  stale: boolean;
};

type BackupIndicator = {
  kind: 'success' | 'warning' | 'danger';
  label: string;
  title: string;
};

const backupIndicatorForApply = (
  response: SqlExecResponse,
  skippedBackup: boolean
): BackupIndicator | null => {
  if (!response.statements.some(statement => statement.kind === 'write')) return null;
  if (skippedBackup) {
    return {
      kind: 'danger',
      label: 'Applied without restore point',
      title: 'The last write was committed after restore-point creation was explicitly bypassed.'
    };
  }

  const backup = response.backup;
  if (!backup) return null;
  if (backup.status === 'success') {
    return {
      kind: 'success',
      label: 'Restore point created first',
      title: 'A database restore point was created before the first write was committed.'
    };
  }
  if (backup.status === 'skipped') {
    return {
      kind: 'success',
      label: 'Restore point already current',
      title: 'The existing restore point already matched the database before the write.'
    };
  }
  if (backup.status === 'partial') {
    const created = backup.targets?.some(target => (
      target.status === 'created' || target.status === 'created_with_warning'
    ));
    return {
      kind: 'warning',
      label: created ? 'Restore point created · warnings' : 'Restore point available · warnings',
      title: 'At least one backup target is usable, but another target needs attention.'
    };
  }
  return null;
};

/**
 * Re-locates the open cell in a fresh result by table primary key. When the
 * result does not carry enough identity, it is safer to keep the old values and
 * mark them stale than to silently attach the builder to a reordered row.
 */
const relocateCell = (response: SqlExecResponse, cell: SelectedCell): SelectedCell => {
  const relocated = relocateSqlCell(response, cell.locator);
  return relocated
    ? { ...cell, ...relocated, stale: false }
    : { ...cell, stale: true };
};

const cellKeyOf = (statementIndex: number, rowIndex: number, cellIndex: number) =>
  `${statementIndex}:${rowIndex}:${cellIndex}`;

/** Shortcuts that work inside this window, including the ones CodeMirror provides. */
const shortcutSections = (mod: string) => [
  {
    title: 'Running',
    rows: [
      [`${mod} ↵`, 'Dry run: report what would change, then roll back'],
      [`${mod} ⇧ ↵`, 'Apply: run and commit']
    ]
  },
  {
    title: 'Editing',
    rows: [
      ['Ctrl Space', 'Suggest tables and columns'],
      [`${mod} /`, 'Comment or uncomment the selection'],
      [`${mod} F`, 'Find in the editor'],
      [`${mod} Z`, 'Undo'],
      [`${mod} ⇧ Z`, 'Redo']
    ]
  },
  {
    title: 'Results',
    rows: [
      ['Click', 'Build an UPDATE from a cell'],
      ['Alt Click', 'Same, but condition on that column instead of the key'],
      ['Esc', 'Close the editor']
    ]
  }
];

const DRAFT_STORAGE_KEY = 'finn.sqlConsole.draft';
const HISTORY_STORAGE_KEY = 'finn.sqlConsole.history';
const HISTORY_LIMIT = 20;

const readStoredDraft = () => {
  try {
    return localStorage.getItem(DRAFT_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
};

const readStoredHistory = (): string[] => {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

/** Shapes the backend schema into the namespace CodeMirror completes against. */
const buildCompletionSchema = (tables: SqlTable[]): SQLNamespace => {
  const namespace: Record<string, SQLNamespace> = {};
  for (const table of tables) {
    namespace[table.name] = {
      self: {
        label: table.name,
        type: 'type',
        detail: table.readOnly ? 'read-only' : `${table.rowCount} rows`
      },
      children: table.columns.map(column => ({
        label: column.name,
        type: column.primaryKey ? 'keyword' : 'property',
        detail: [column.type || 'ANY', column.primaryKey ? 'PK' : null].filter(Boolean).join(' · ')
      }))
    };
  }
  return namespace;
};

type SqlEditorModalProps = {
  onClose: () => void;
};

export function SqlEditorModal({ onClose }: SqlEditorModalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const schemaCompartment = useRef(new Compartment());
  const runningRef = useRef(false);
  // Keeps the CodeMirror keymap pointed at the latest handlers without rebuilding the editor.
  const runRef = useRef<(mode: 'dry_run' | 'apply') => void>(() => {});
  const [initialDraft] = useState(readStoredDraft);

  const [tables, setTables] = useState<SqlTable[]>([]);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SqlExecResponse | null>(null);
  const [resultSql, setResultSql] = useState<string | null>(null);
  const [error, setError] = useState<SqlConsoleError | Error | null>(null);
  const [errorSql, setErrorSql] = useState<string | null>(null);
  const [currentSql, setCurrentSql] = useState(initialDraft);
  const [history, setHistory] = useState<string[]>(() => readStoredHistory());
  const [showHistory, setShowHistory] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [backupIndicator, setBackupIndicator] = useState<BackupIndicator | null>(null);
  const modifier = useMemo(primaryModifierLabel, []);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const pendingWrites = useMemo(() => {
    if (!result || result.mode !== 'dry_run') return 0;
    return result.statements.reduce((total, statement) => total + statement.rowsAffected, 0);
  }, [result]);

  // Read-only queries have nothing to report beyond their rows, so the dry-run
  // and applied banners stay out of the way unless something could change.
  const touchesData = result?.statements.some(statement => statement.kind === 'write') ?? false;
  const resultIsCurrent = resultSql !== null && resultSql === currentSql;
  const visibleError = errorSql !== null && errorSql === currentSql ? error : null;

  // Decode every JSON cell once per result rather than on each render.
  const jsonCells = useMemo(() => {
    const decoded = new Map<string, JsonCell>();
    for (const statement of result?.statements ?? []) {
      if (statement.kind !== 'read') continue;
      statement.rows?.forEach((row, rowIndex) => {
        row.forEach((cell, cellIndex) => {
          const parsed = parseJsonCell(cell);
          if (parsed) decoded.set(cellKeyOf(statement.index, rowIndex, cellIndex), parsed);
        });
      });
    }
    return decoded;
  }, [result]);

  const rememberQuery = useCallback((statement: string) => {
    const trimmed = statement.trim();
    if (!trimmed) return;
    setHistory(previous => {
      const next = [trimmed, ...previous.filter(item => item !== trimmed)].slice(0, HISTORY_LIMIT);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // history is a convenience only
      }
      return next;
    });
  }, []);

  const run = useCallback(async (
    mode: 'dry_run' | 'apply',
    skipBackup = false,
    sqlOverride?: string
  ) => {
    // React state does not update synchronously, and the CodeMirror hotkey stays
    // active while a request is running. The ref closes that gap so one key
    // chord can never enqueue the same non-idempotent statement twice.
    if (runningRef.current) return;

    const view = viewRef.current;
    if (!view) return;
    const statement = sqlOverride ?? view.state.doc.toString();
    if (!statement.trim()) return;

    runningRef.current = true;
    setRunning(true);
    setError(null);
    setErrorSql(null);
    try {
      const response = await executeSql(statement, mode, skipBackup);
      setResult(response);
      setResultSql(statement);
      if (mode === 'apply') {
        const indicator = backupIndicatorForApply(response, skipBackup);
        // A successful first-write restore point remains useful for the rest of
        // this app run, whose later responses intentionally omit backup details.
        if (indicator) setBackupIndicator(indicator);
      }
      // The inspector stays open across runs; it only follows the data.
      setSelectedCell(current => (current ? relocateCell(response, current) : null));
      if (mode === 'apply') rememberQuery(statement);
    } catch (caught) {
      setError(caught as Error);
      setErrorSql(statement);
      // Stale results next to a fresh error read as if they still applied.
      setResult(null);
      setResultSql(null);
      setSelectedCell(current => (current ? { ...current, stale: true } : null));
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [rememberQuery]);

  useEffect(() => {
    runRef.current = (mode: 'dry_run' | 'apply') => { void run(mode); };
  }, [run]);

  // Build the editor once; the schema arrives later through a compartment.
  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialDraft,
        extensions: [
          basicSetup,
          oneDark,
          // The editor gets narrow once the JSON panel opens, and horizontal
          // scrolling hides the tail of a statement.
          EditorView.lineWrapping,
          cmPlaceholder('SELECT month, data FROM snapshots ORDER BY month DESC LIMIT 10'),
          schemaCompartment.current.of(sql({ dialect: SQLite, upperCaseKeywords: true })),
          // basicSetup already binds Mod-Enter to insertBlankLine, so these must
          // take precedence to win the chord.
          Prec.highest(keymap.of([
            {
              key: 'Mod-Enter',
              preventDefault: true,
              run: () => { runRef.current('dry_run'); return true; }
            },
            {
              key: 'Mod-Shift-Enter',
              preventDefault: true,
              run: () => { runRef.current('apply'); return true; }
            }
          ])),
          EditorView.updateListener.of(update => {
            if (!update.docChanged) return;
            const document = update.state.doc.toString();
            setCurrentSql(document);
            // Keep the old rows available for reference, but never leave an
            // actionable dry-run or backup-bypass prompt attached to new SQL.
            setResultSql(null);
            setError(null);
            setErrorSql(null);
            try {
              localStorage.setItem(DRAFT_STORAGE_KEY, document);
            } catch {
              // drafts are a convenience only
            }
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
            '&.cm-focused': { outline: 'none' }
          })
        ]
      })
    });

    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [initialDraft]);

  const loadSchema = useCallback(async () => {
    try {
      const loaded = await fetchSqlSchema();
      setTables(loaded);
      setSchemaError(null);
      viewRef.current?.dispatch({
        effects: schemaCompartment.current.reconfigure(
          sql({ dialect: SQLite, schema: buildCompletionSchema(loaded), upperCaseKeywords: true })
        )
      });
    } catch (caught) {
      setSchemaError((caught as Error).message);
    }
  }, []);

  useEffect(() => { void loadSchema(); }, [loadSchema]);

  // Escape closes the modal, but must not steal the key from an open completion popup.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('.cm-tooltip-autocomplete')) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  const insertSnippet = (text: string) => {
    const view = viewRef.current;
    if (!view) return;

    // A whole statement gets its own line; a bare expression goes at the cursor.
    if (text.includes('\n')) {
      const document = view.state.doc.toString();
      const separator = document.trim() === '' ? '' : '\n\n';
      view.dispatch({
        changes: { from: document.length, insert: `${separator}${text}` },
        selection: { anchor: document.length + separator.length + text.length },
        scrollIntoView: true
      });
    } else {
      view.dispatch(view.state.replaceSelection(text));
    }
    view.focus();
  };

  const replaceDocument = (text: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    view.focus();
    setShowHistory(false);
  };

  const consoleError = visibleError instanceof SqlConsoleError ? visibleError : null;

  return (
    <ModalPortal onClose={onClose} className="sql-console-overlay">
      <div className="sql-console glass-panel" onClick={event => event.stopPropagation()}>
        <header className="sql-console-header">
          <div className="sql-console-header-statuses">
            <Database size={18} color="var(--accent)" />
            <strong>SQL editor</strong>
            <span className="sql-console-scope">
              <Lock size={12} /> rows in existing tables only
            </span>
            {backupIndicator && (
              <span
                className={`sql-console-backup-status is-${backupIndicator.kind}`}
                title={backupIndicator.title}
                role="status"
              >
                {backupIndicator.kind === 'success'
                  ? <ShieldCheck size={12} />
                  : backupIndicator.kind === 'warning'
                    ? <ShieldAlert size={12} />
                    : <ShieldX size={12} />}
                {backupIndicator.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn"
              title="Keyboard shortcuts"
              aria-label="Keyboard shortcuts"
              onClick={() => { setShowShortcuts(value => !value); setShowHistory(false); }}
            >
              <Keyboard size={16} />
            </button>
            <button
              className="btn"
              title="Recent applied queries"
              onClick={() => { setShowHistory(value => !value); setShowShortcuts(false); }}
              disabled={history.length === 0}
            >
              <History size={16} /> History
            </button>
            <button className="btn" title="Reload schema" onClick={() => void loadSchema()}>
              <RefreshCw size={16} />
            </button>
            <button className="btn" title="Close" aria-label="Close" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="sql-console-body">
          <aside className="sql-console-schema">
            <div className="sql-console-schema-title">
              <Table2 size={13} /> Tables
            </div>
            {schemaError && <p className="sql-console-hint">{schemaError}</p>}
            {tables.map(table => (
              <details key={table.name} className="sql-console-table">
                <summary>
                  <span className="sql-console-table-name">{table.name}</span>
                  {table.readOnly
                    ? <span className="sql-console-badge is-readonly"><Lock size={10} /> read-only</span>
                    : <span className="sql-console-badge">{table.rowCount}</span>}
                </summary>
                <div className="sql-console-columns">
                  {table.columns.map(column => (
                    <button
                      key={column.name}
                      type="button"
                      className="sql-console-column"
                      title={`Insert ${column.name}`}
                      onClick={() => insertSnippet(column.name)}
                    >
                      {column.primaryKey && <Key size={10} color="var(--warning)" />}
                      <span>{column.name}</span>
                      <small>{column.type || 'ANY'}</small>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="sql-console-select-all"
                  onClick={() => replaceDocument(`SELECT * FROM ${table.name} LIMIT 50;`)}
                >
                  SELECT * FROM {table.name}
                </button>
              </details>
            ))}
          </aside>

          <div className="sql-console-main">
            <div className="sql-console-editor" ref={hostRef} />

            <div className="sql-console-actions">
              <button className="btn" onClick={() => void run('dry_run')} disabled={running}>
                <Eye size={16} /> Dry run
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void run('apply')}
                disabled={running}
                title="Runs and commits the statements"
              >
                <Play size={16} /> Apply
              </button>
              {running && <span className="sql-console-hint">Running…</span>}
              {result && !running && (
                <span className="sql-console-hint">
                  {result.statements.length} statement{result.statements.length === 1 ? '' : 's'} · {result.durationMs} ms
                </span>
              )}
            </div>

            {showShortcuts && (
              <div className="sql-console-shortcuts">
                {shortcutSections(modifier).map(section => (
                  <div key={section.title}>
                    <div className="cell-inspector-label">{section.title}</div>
                    {section.rows.map(([keys, description]) => (
                      <div key={keys} className="sql-console-shortcut-row">
                        <span className="sql-console-shortcut-keys">
                          {keys.split(' ').map((part, index) => <kbd key={index}>{part}</kbd>)}
                        </span>
                        <span>{description}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {showHistory && history.length > 0 && (
              <div className="sql-console-history">
                {history.map((item, index) => (
                  <button key={`${index}-${item.slice(0, 24)}`} type="button" onClick={() => replaceDocument(item)}>
                    {item.length > 140 ? `${item.slice(0, 140)}…` : item}
                  </button>
                ))}
              </div>
            )}

            {visibleError && (
              <div className="sql-console-banner is-error">
                <AlertTriangle size={16} />
                <div>
                  <strong>
                    {consoleError?.backupFailed
                      ? 'Nothing was applied'
                      : consoleError?.statementIndex
                        ? `Statement ${consoleError.statementIndex} failed`
                        : 'Query failed'}
                  </strong>
                  <p>{visibleError.message}</p>
                  {consoleError?.sql && <code>{consoleError.sql}</code>}
                  {consoleError?.backupFailed && (
                    <button
                      className="btn btn-danger"
                      onClick={() => errorSql && void run('apply', true, errorSql)}
                    >
                      Apply without a restore point
                    </button>
                  )}
                </div>
              </div>
            )}

            {result?.mode === 'dry_run' && touchesData && resultIsCurrent && !visibleError && (
              <div className="sql-console-banner is-warning">
                <Eye size={16} />
                <div>
                  <strong>Dry run — nothing was saved</strong>
                  <p>{summarizeWrites(result)} Press Apply to commit.</p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => resultSql && void run('apply', false, resultSql)}
                  disabled={running}
                >
                  {pendingWrites > 0 ? `Apply ${pendingWrites} row${pendingWrites === 1 ? '' : 's'}` : 'Apply anyway'}
                </button>
              </div>
            )}

            {result?.mode === 'apply' && touchesData && resultIsCurrent && !visibleError && (
              <div className="sql-console-banner is-success">
                <Check size={16} />
                <div>
                  <strong>Applied</strong>
                  <p>
                    {result.totalWrites} row{result.totalWrites === 1 ? '' : 's'} changed and committed.
                    {result.backup?.status === 'success' && ' A restore point was created first.'}
                    {result.backup?.status === 'partial' && ' A restore point was created, but some targets need attention.'}
                  </p>
                </div>
              </div>
            )}

            <div className="sql-console-results">
              {result?.statements.map(statement => (
                <div key={statement.index} className="sql-console-result">
                  <div className="sql-console-result-head">
                    <span className={`sql-console-kind is-${statement.kind}`}>{statement.kind}</span>
                    <code>{statement.sql.length > 90 ? `${statement.sql.slice(0, 90)}…` : statement.sql}</code>
                    <span className="sql-console-hint">
                      {statement.kind === 'write'
                        ? `${statement.rowsAffected} row${statement.rowsAffected === 1 ? '' : 's'}`
                        : `${statement.rowCount} row${statement.rowCount === 1 ? '' : 's'}`}
                    </span>
                  </div>

                  {statement.kind === 'read' && !!statement.columns?.length && (
                    <div className="sql-console-table-scroll">
                      <table>
                        <thead>
                          <tr>{statement.columns.map(column => <th key={column}>{column}</th>)}</tr>
                        </thead>
                        <tbody>
                          {(statement.rows ?? []).map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {row.map((cell, cellIndex) => {
                                const json = jsonCells.get(cellKeyOf(statement.index, rowIndex, cellIndex));
                                const open = selectedCell?.statement.index === statement.index
                                  && !selectedCell.stale
                                  && selectedCell.rowIndex === rowIndex
                                  && selectedCell.cellIndex === cellIndex;
                                const select = (event: { altKey: boolean }) => setSelectedCell({
                                  statement,
                                  rowIndex,
                                  cellIndex,
                                  locator: createSqlCellLocator(statement, rowIndex, cellIndex, tables),
                                  conditionOnColumn: event.altKey,
                                  stale: false
                                });

                                if (json) {
                                  return (
                                    <td key={cellIndex} className="is-json">
                                      <button
                                        type="button"
                                        className={`json-chip${open ? ' is-open' : ''}`}
                                        title="Inspect this JSON value"
                                        onClick={event => select(event)}
                                      >
                                        <Braces size={11} />
                                        {json.preview}
                                      </button>
                                    </td>
                                  );
                                }
                                return (
                                  <td
                                    key={cellIndex}
                                    className={[
                                      'is-clickable',
                                      cell === null ? 'is-null' : '',
                                      open ? 'is-open' : ''
                                    ].filter(Boolean).join(' ')}
                                    title="Build an UPDATE from this value · Alt-click to put this column in the condition"
                                    onClick={event => select(event)}
                                  >
                                    {formatCellValue(cell)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {statement.rowCount === 0 && <p className="sql-console-hint">No rows returned.</p>}
                    </div>
                  )}

                  {statement.truncated && (
                    <p className="sql-console-hint">Showing the first {statement.rowCount} rows only.</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedCell && (
            <CellInspector
              statement={selectedCell.statement}
              rowIndex={selectedCell.rowIndex}
              cellIndex={selectedCell.cellIndex}
              conditionOnColumn={selectedCell.conditionOnColumn}
              stale={selectedCell.stale}
              tables={tables}
              onInsert={insertSnippet}
              onClose={() => setSelectedCell(null)}
            />
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
