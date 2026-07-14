import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FileUp, X } from 'lucide-react';
import type { FlowCsvPreview } from '../../lib/flowCsv';
import { Spinner } from './PageLoader';

type FlowCsvImportModalProps = {
  preview: FlowCsvPreview;
  importing: boolean;
  error: string;
  onClose: () => void;
  onImport: () => void;
};

const formatAmount = (amount: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(amount);

export function FlowCsvImportModal({ preview, importing, error, onClose, onImport }: FlowCsvImportModalProps) {
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

  return createPortal(
    <div className="cash-flow-modal-backdrop" role="presentation">
      <section className="glass-panel cash-flow-import-modal" role="dialog" aria-modal="true" aria-labelledby="cash-flow-import-title">
        <header className="cash-flow-period-header">
          <div>
            <h3 id="cash-flow-import-title">Import Cash Flow CSV</h3>
            <p>{preview.fileName}</p>
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
                <span><strong>{preview.entries.length}</strong> entries</span>
                <span><strong>{months}</strong> month{months === 1 ? '' : 's'}</span>
                <span>Existing entries stay intact; exact duplicates are skipped.</span>
              </div>
              <div className="cash-flow-import-preview">
                <table className="table">
                  <thead><tr><th>Month</th><th>Direction</th><th>Counterparty</th><th>Gross amount</th><th>Tax</th><th>Category</th><th>Comment</th></tr></thead>
                  <tbody>
                    {shownEntries.map((entry, index) => (
                      <tr key={`${entry.month}-${entry.counterparty}-${index}`}>
                        <td>{entry.month}</td>
                        <td className={entry.direction === 'in' ? 'text-success' : 'text-danger'}>{entry.direction}</td>
                        <td>{entry.counterparty}</td>
                        <td>{formatAmount(entry.amount)} {entry.currency}</td>
                        <td>{entry.taxRate ? `${formatAmount(entry.taxRate)}%` : '—'}</td>
                        <td>{entry.category || '—'}</td>
                        <td className="cash-flow-import-comment">{entry.comment || '—'}</td>
                      </tr>
                    ))}
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
          <button className="btn btn-primary" onClick={onImport} disabled={importing || preview.errors.length > 0 || preview.entries.length === 0}>
            {importing ? <Spinner size={15} /> : <FileUp size={15} />}
            {importing ? 'Importing...' : `Import ${preview.entries.length} entries`}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
