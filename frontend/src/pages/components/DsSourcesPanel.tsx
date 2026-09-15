import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Download, Plug, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { Spinner } from './PageLoader';
import type { DatasourceSource, DsFetchSummary } from '../../types';

type DsSourcesPanelProps = {
  sources: DatasourceSource[];
  runningSource: string;
  summaries: Record<string, DsFetchSummary>;
  onFetch: (source: DatasourceSource) => void;
};

const relativeTime = (timestamp?: string) => {
  if (!timestamp) return 'never run';
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return timestamp;

  const minutes = Math.round((Date.now() - parsed) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(parsed).toLocaleDateString();
};

const sourceProblem = (source: DatasourceSource) => (
  source.configError || source.binaryError || source.manifestError || ''
);

export function DsSourcesPanel({ sources, runningSource, summaries, onFetch }: DsSourcesPanelProps) {
  const [expanded, setExpanded] = useState<string>('');

  return (
    <div className="ds-sources">
      {sources.map(source => {
        const summary = summaries[source.name];
        const problem = sourceProblem(source);
        const diagnostics = summary?.stderrTail || summary?.error || source.lastError || '';
        const isOpen = expanded === source.name;
        const running = runningSource === source.name;

        return (
          <article key={source.name} className={`glass-panel ds-source${problem ? ' has-problem' : ''}`}>
            <header className="ds-source-head">
              <div className="ds-source-identity">
                <Plug size={16} aria-hidden="true" />
                <div>
                  <strong>{source.name}</strong>
                  <small>
                    {source.orphaned
                      ? 'No longer in config.yml — its items are still here'
                      : source.manifest
                        ? `${source.manifest.name} ${source.manifest.version}`
                        : source.path}
                  </small>
                </div>
              </div>

              <div className="ds-source-state">
                {source.pendingCount > 0 && <span className="ds-chip is-accent">{source.pendingCount} waiting</span>}
                {!source.orphaned && (
                  source.pinned
                    ? <span className="ds-chip is-ok" title={source.sha256}><ShieldCheck size={12} /> pinned</span>
                    : <span className="ds-chip is-warn" title={source.sha256}><ShieldQuestion size={12} /> unpinned</span>
                )}
                {source.disabled && <span className="ds-chip">disabled</span>}
                {source.orphaned && <span className="ds-chip is-warn">orphaned</span>}
                <span className="ds-source-last-run">{relativeTime(source.lastRunAt)}</span>
                {!source.orphaned && (
                  <button
                    className="btn btn-primary ds-source-fetch"
                    onClick={() => onFetch(source)}
                    disabled={!source.runnable || running}
                    title={problem || 'Run this datasource now'}
                  >
                    {running ? <Spinner size={15} label="Running" /> : <Download size={15} />}
                    <span>{running ? 'Running…' : 'Fetch'}</span>
                  </button>
                )}
              </div>
            </header>

            {problem && (
              <p className="ds-source-problem"><AlertTriangle size={14} /> {problem}</p>
            )}

            {summary && (
              <p className={`ds-source-summary${summary.status === 'ok' ? '' : ' is-error'}`}>
                {summary.status === 'ok'
                  ? `${summary.itemsNew} new, ${summary.itemsSkipped} already known, ${summary.durationMs} ms`
                  : summary.error}
                {!!summary.warnings?.length && <span className="ds-source-warnings">{summary.warnings.join(' · ')}</span>}
              </p>
            )}

            {diagnostics && (
              <div className="ds-source-diagnostics">
                <button
                  className="ds-source-diagnostics-toggle"
                  onClick={() => setExpanded(isOpen ? '' : source.name)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Plugin diagnostics
                </button>
                {isOpen && <pre>{diagnostics}</pre>}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
