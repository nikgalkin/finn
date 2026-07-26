import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CircleCheck,
  RefreshCw
} from 'lucide-react';
import { fetchDataHealth } from '../../../lib/toolsApi';
import type { DataHealthIssue, DataHealthReport } from '../../../lib/toolsApi';
import { ToolModal } from './ToolModal';

type DataHealthModalProps = {
  onClose: () => void;
};

const statusCopy = (report: DataHealthReport) => {
  if (report.status === 'critical') {
    return {
      title: 'Data needs attention',
      detail: `${report.summary.critical} critical finding${report.summary.critical === 1 ? '' : 's'}`,
      icon: AlertOctagon
    };
  }
  if (report.status === 'warning') {
    return {
      title: 'Healthy enough, with warnings',
      detail: `${report.summary.warnings} warning${report.summary.warnings === 1 ? '' : 's'}`,
      icon: AlertTriangle
    };
  }
  return {
    title: 'Everything looks healthy',
    detail: 'No structural data problems were found',
    icon: CircleCheck
  };
};

const issueCount = (issue: DataHealthIssue) => (
  `${issue.count} occurrence${issue.count === 1 ? '' : 's'}`
);

export function DataHealthModal({ onClose }: DataHealthModalProps) {
  const [report, setReport] = useState<DataHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchDataHealth());
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void run(); }, [run]);

  const groupedIssues = useMemo(() => {
    const groups = new Map<string, DataHealthIssue[]>();
    for (const issue of report?.issues ?? []) {
      const items = groups.get(issue.category) ?? [];
      items.push(issue);
      groups.set(issue.category, items);
    }
    return Array.from(groups.entries());
  }, [report]);

  const status = report ? statusCopy(report) : null;
  const StatusIcon = status?.icon ?? Activity;

  return (
    <ToolModal
      title="Data Health"
      subtitle="Read-only structural checks across snapshots, settings, and Cash Flow"
      icon={Activity}
      accent="var(--success)"
      onClose={onClose}
      actions={(
        <button type="button" className="btn" onClick={() => void run()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'is-spinning' : undefined} />
          Run again
        </button>
      )}
    >
      {loading && !report && (
        <div className="tool-loading">
          <RefreshCw size={18} className="is-spinning" />
          Checking every snapshot and cash-flow row…
        </div>
      )}

      {error && (
        <div className="tool-message is-error">
          <AlertTriangle size={16} />
          <div><strong>Health check failed</strong><span>{error}</span></div>
        </div>
      )}

      {report && status && (
        <>
          <div className={`health-overview is-${report.status}`}>
            <StatusIcon size={24} />
            <div className="health-overview-copy">
              <strong>{status.title}</strong>
              <span>{status.detail}</span>
            </div>
            <div className="health-overview-stats">
              <span><b>{report.summary.snapshots}</b> snapshots</span>
              <span><b>{report.summary.flowEntries}</b> flow rows</span>
              <span>
                checked {new Date(report.checkedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })}
              </span>
            </div>
          </div>

          {groupedIssues.length === 0 ? (
            <div className="tool-empty">
              <CircleCheck size={28} />
              <strong>No findings</strong>
              <span>JSON shape, rates, identifiers, tags, currencies, and transfers passed the check.</span>
            </div>
          ) : (
            <div className="health-groups">
              {groupedIssues.map(([category, issues]) => (
                <section key={category} className="health-group">
                  <h3>{category}</h3>
                  <div className="health-issue-list">
                    {issues.map(issue => (
                      <article key={issue.code} className={`health-issue is-${issue.severity}`}>
                        {issue.severity === 'critical'
                          ? <AlertOctagon size={16} />
                          : <AlertTriangle size={16} />}
                        <div className="health-issue-copy">
                          <div>
                            <strong>{issue.title}</strong>
                            <span className="health-count">{issueCount(issue)}</span>
                          </div>
                          <p>{issue.description}</p>
                          {!!issue.examples?.length && (
                            <details>
                              <summary>Examples</summary>
                              <ul>
                                {issue.examples.map(example => <li key={example}><code>{example}</code></li>)}
                              </ul>
                            </details>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </ToolModal>
  );
}
