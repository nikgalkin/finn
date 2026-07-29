import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Download,
  FileJson,
  FileSpreadsheet,
  PackageOpen,
  RefreshCw,
  TableProperties
} from 'lucide-react';
import {
  downloadExport,
  fetchExportMetadata
} from '../../../lib/toolsApi';
import type { ExportMetadata, ExportRequest } from '../../../lib/toolsApi';
import { ToolModal } from './ToolModal';

type ExportCenterModalProps = {
  onClose: () => void;
};

export function ExportCenterModal({ onClose }: ExportCenterModalProps) {
  const [metadata, setMetadata] = useState<ExportMetadata | null>(null);
  const [request, setRequest] = useState<ExportRequest>({
    format: 'json',
    fromMonth: '',
    toMonth: '',
    includeSnapshots: true,
    includeSettings: true,
    includeCashFlow: true
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await fetchExportMetadata();
      setMetadata(loaded);
      setRequest(current => ({
        ...current,
        fromMonth: current.fromMonth || loaded.firstSnapshotMonth || loaded.minMonth || '',
        toMonth: current.toMonth || loaded.lastSnapshotMonth || loaded.maxMonth || ''
      }));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const change = <Key extends keyof ExportRequest>(key: Key, value: ExportRequest[Key]) => {
    setRequest(current => ({ ...current, [key]: value }));
    setDownloaded(null);
  };

  const runExport = async () => {
    setExporting(true);
    setError(null);
    setDownloaded(null);
    try {
      setDownloaded(await downloadExport(request));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const hasSelection = request.includeSnapshots || request.includeSettings || request.includeCashFlow;
  const rangeInvalid = Boolean(
    request.fromMonth && request.toMonth && request.fromMonth > request.toMonth
  );

  return (
    <ToolModal
      title="Export Center"
      subtitle="Portable JSON or analysis-ready CSV files for a selected period"
      icon={PackageOpen}
      accent="#60a5fa"
      onClose={onClose}
      footer={(
        <>
          <div className="export-footer-copy">
            {request.format === 'json'
              ? 'One portable document with typed snapshot, settings, and Cash Flow data.'
              : 'A ZIP bundle with separate CSV files for snapshots, organizations, balances, rates, and Cash Flow.'}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runExport()}
            disabled={loading || exporting || !hasSelection || rangeInvalid}
          >
            <Download size={15} />
            {exporting ? 'Preparing…' : `Download ${request.format === 'json' ? 'JSON' : 'CSV bundle'}`}
          </button>
        </>
      )}
    >
      {loading && !metadata && (
        <div className="tool-loading">
          <RefreshCw size={18} className="is-spinning" />
          Reading the available export range…
        </div>
      )}

      {error && (
        <div className="tool-message is-error">
          <PackageOpen size={16} />
          <div><strong>Export failed</strong><span>{error}</span></div>
        </div>
      )}
      {downloaded && (
        <div className="tool-message is-success">
          <Check size={16} />
          <div><strong>Download ready</strong><span>{downloaded}</span></div>
        </div>
      )}

      {metadata && (
        <div className="export-layout">
          <section className="export-section">
            <div className="export-section-heading">
              <span>1</span>
              <div><strong>Format</strong><small>Choose a portable document or a spreadsheet bundle.</small></div>
            </div>
            <div className="export-format-grid">
              <button
                type="button"
                className={request.format === 'json' ? 'is-selected' : undefined}
                onClick={() => change('format', 'json')}
              >
                <FileJson size={22} />
                <strong>Portable JSON</strong>
                <span>Preserves nested data and value types. Best for migration and scripts.</span>
              </button>
              <button
                type="button"
                className={request.format === 'csv' ? 'is-selected' : undefined}
                onClick={() => change('format', 'csv')}
              >
                <FileSpreadsheet size={22} />
                <strong>CSV bundle</strong>
                <span>Separate tables inside a ZIP. Best for Excel and data analysis.</span>
              </button>
            </div>
          </section>

          <section className="export-section">
            <div className="export-section-heading">
              <span>2</span>
              <div><strong>Period</strong><small>The date range applies to snapshots and Cash Flow.</small></div>
            </div>
            <div className="export-range">
              <label>
                <span>From</span>
                <input
                  id="export-from-month"
                  name="export-from-month"
                  className="input"
                  type="month"
                  value={request.fromMonth}
                  min={metadata.minMonth}
                  max={metadata.maxMonth}
                  onChange={event => change('fromMonth', event.target.value)}
                />
              </label>
              <span>to</span>
              <label>
                <span>Through</span>
                <input
                  id="export-through-month"
                  name="export-through-month"
                  className="input"
                  type="month"
                  value={request.toMonth}
                  min={metadata.minMonth}
                  max={metadata.maxMonth}
                  onChange={event => change('toMonth', event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => setRequest(current => ({
                  ...current,
                  fromMonth: metadata.firstSnapshotMonth || metadata.minMonth || '',
                  toMonth: metadata.lastSnapshotMonth || metadata.maxMonth || ''
                }))}
              >
                All time
              </button>
            </div>
            {rangeInvalid && <p className="export-error">The start month must not be after the end month.</p>}
          </section>

          <section className="export-section">
            <div className="export-section-heading">
              <span>3</span>
              <div><strong>Contents</strong><small>Select at least one data section.</small></div>
            </div>
            <div className="export-content-grid">
              <label>
                <input
                  id="export-include-snapshots"
                  name="export-include-snapshots"
                  type="checkbox"
                  checked={request.includeSnapshots}
                  onChange={event => change('includeSnapshots', event.target.checked)}
                />
                <TableProperties size={17} />
                <span><strong>Snapshots</strong><small>{metadata.snapshotCount} total</small></span>
              </label>
              <label>
                <input
                  id="export-include-cash-flow"
                  name="export-include-cash-flow"
                  type="checkbox"
                  checked={request.includeCashFlow}
                  onChange={event => change('includeCashFlow', event.target.checked)}
                />
                <FileSpreadsheet size={17} />
                <span><strong>Cash Flow</strong><small>{metadata.flowCount} total rows</small></span>
              </label>
              <label>
                <input
                  id="export-include-settings"
                  name="export-include-settings"
                  type="checkbox"
                  checked={request.includeSettings}
                  onChange={event => change('includeSettings', event.target.checked)}
                />
                <FileJson size={17} />
                <span><strong>Settings</strong><small>{metadata.settingsCount} records</small></span>
              </label>
            </div>
            {!hasSelection && <p className="export-error">Select at least one section to export.</p>}
          </section>
        </div>
      )}
    </ToolModal>
  );
}
