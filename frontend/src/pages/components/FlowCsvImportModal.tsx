import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FileUp, X } from 'lucide-react';
import type { FlowCsvPreview } from '../../lib/flowCsv';
import { Spinner } from './PageLoader';

type FlowCsvImportModalProps = {
  preview: FlowCsvPreview;
  importing: boolean;
  error: string;
  importDuplicates: boolean;
  onImportDuplicatesChange: (value: boolean) => void;
  onClose: () => void;
  onImport: () => void;
};

const formatAmount = (amount: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(amount);

export function FlowCsvImportModal({ preview, importing, error, importDuplicates, onImportDuplicatesChange, onClose, onImport }: FlowCsvImportModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || importing) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [importing, onClose]);

  const months = new Set(preview.entries.map(entry => entry.month)).size;
  const shownEntries = preview.entries.slice(0, 100);
  const duplicatesByIndex = new Map(preview.duplicates.map(duplicate => [duplicate.entryIndex, duplicate]));
  const importCount = importDuplicates ? preview.entries.length : preview.entries.length - preview.duplicates.length;

  return createPortal(
    <div className="cash-flow-modal-backdrop" role="presentation">
      <section className="glass-panel cash-flow-import-modal" role="dialog" aria-modal="true" aria-labelledby="cash-flow-import-title">
        <header className="cash-flow-period-header">
          <div>
            <h3 id="cash-flow-import-title">Import Cash Flow CSV</h3>
            <p>{preview.fileName} · semicolon-separated (;)</p>
          </div>
          <button className="btn cash-flow-icon-button" onClick={onClose} disabled={importing} title="Close" aria-label="Close"><X size={17} /></button>
        </header>

        <div className="cash-flow-import-body">
          {preview.errors.length > 0 ? (
            <div className="cash-flow-import-errors">
              <div className="cash-flow-import-errors-title"><AlertTriangle size={17} /> Fix the CSV before importing</div>
              <ul>
                {preview.errors.slice(0, 20).map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
              </ul>
              {preview.errors.length > 20 && <div>And {preview.errors.length - 20} more errors.</div>}
            </div>
          ) : (
            <>
              <div className="cash-flow-import-summary">
                <span><strong>{preview.entries.length}</strong> rows</span>
                <span><strong>{months}</strong> month{months === 1 ? '' : 's'}</span>
                <span><strong>{importCount}</strong> will be imported</span>
                {preview.duplicates.length > 0 && (
                  <span className="cash-flow-import-duplicate-count">
                    <strong>{preview.duplicates.length}</strong> exact duplicate{preview.duplicates.length === 1 ? '' : 's'} {importDuplicates ? 'will also be imported' : 'will be skipped'}
                  </span>
                )}
              </div>
              {preview.duplicates.length > 0 && (
                <label className="cash-flow-import-duplicates-toggle">
                  <input
                    type="checkbox"
                    checked={importDuplicates}
                    onChange={event => onImportDuplicatesChange(event.target.checked)}
                    disabled={importing}
                  />
                  <span>
                    <strong>Import exact duplicates</strong>
                    <small>Create separate movements for rows already saved or repeated in this file.</small>
                  </span>
                </label>
              )}
              <div className="cash-flow-import-preview">
                <table className="table">
                  <thead><tr><th>Status</th><th>Month</th><th>Direction</th><th>Counterparty</th><th>Gross amount</th><th>Tax</th><th>Category</th><th>Comment</th></tr></thead>
                  <tbody>
                    {shownEntries.map((entry, index) => {
                      const duplicate = duplicatesByIndex.get(index);
                      return (
                        <tr key={`${entry.month}-${entry.counterparty}-${index}`} className={duplicate ? 'is-duplicate' : undefined}>
                          <td>
                            {duplicate ? (
                              <span className="cash-flow-import-status is-duplicate">
                                {duplicate.reason === 'existing' ? 'Already saved' : 'Repeated row'}
                              </span>
                            ) : <span className="cash-flow-import-status">New</span>}
                          </td>
                          <td>{entry.month}</td>
                          <td className={entry.direction === 'in' ? 'text-success' : 'text-danger'}>{entry.direction}</td>
                          <td>{entry.counterparty}</td>
                          <td>{formatAmount(entry.amount)} {entry.currency}</td>
                          <td>{entry.taxRate ? `${formatAmount(entry.taxRate)}%` : '—'}</td>
                          <td>{entry.category || '—'}</td>
                          <td className="cash-flow-import-comment">{entry.comment || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {preview.entries.length > shownEntries.length && <div className="cash-flow-import-more">Previewing the first {shownEntries.length} entries.</div>}
            </>
          )}
          {error && <div className="cash-flow-period-error" style={{ margin: 0 }}>{error}</div>}
        </div>

        <footer className="cash-flow-period-footer">
          <button className="btn" onClick={onClose} disabled={importing}>Cancel</button>
          <button className="btn btn-primary" onClick={onImport} disabled={importing || preview.errors.length > 0 || importCount === 0}>
            {importing ? <Spinner size={15} /> : <FileUp size={15} />}
            {importing ? 'Importing...' : `Import ${importCount} entries`}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
