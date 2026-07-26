import { useCallback, useEffect, useState } from 'react';
import {
  ArchiveRestore,
  Check,
  DatabaseBackup,
  FileArchive,
  HardDrive,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX
} from 'lucide-react';
import {
  fetchBackupInspector,
  runBackupNow,
  verifyBackup
} from '../../../lib/toolsApi';
import type {
  BackupInspectorData,
  BackupVerification
} from '../../../lib/toolsApi';
import { ToolModal } from './ToolModal';

type BackupInspectorModalProps = {
  onClose: () => void;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const shortFingerprint = (value?: string) => value ? `${value.slice(0, 12)}…` : 'unknown';

export function BackupInspectorModal({ onClose }: BackupInspectorModalProps) {
  const [data, setData] = useState<BackupInspectorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifications, setVerifications] = useState<Record<string, BackupVerification>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchBackupInspector());
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createBackup = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const report = await runBackupNow();
      setNotice(report.status === 'skipped'
        ? 'The latest restore point already matches the database.'
        : report.status === 'partial'
          ? 'A restore point was created, but some targets reported warnings.'
          : 'Restore point created and verified.');
      await load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const checkFile = async (target: string, file: string) => {
    const key = `${target}:${file}`;
    setVerifying(key);
    try {
      const result = await verifyBackup(target, file);
      setVerifications(current => ({ ...current, [key]: result }));
    } catch (caught) {
      setVerifications(current => ({
        ...current,
        [key]: {
          status: 'failed',
          matchesName: false,
          error: (caught as Error).message
        }
      }));
    } finally {
      setVerifying(null);
    }
  };

  const canRun = Boolean(data?.enabled && data.targets.length > 0);

  return (
    <ToolModal
      title="Backup Inspector"
      subtitle="Configured targets, restore points, fingerprints, and integrity checks"
      icon={ArchiveRestore}
      accent="var(--warning)"
      onClose={onClose}
      actions={(
        <>
          <button type="button" className="btn" onClick={() => void load()} disabled={loading || running}>
            <RefreshCw size={14} className={loading ? 'is-spinning' : undefined} />
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void createBackup()}
            disabled={!canRun || running}
            title={!canRun ? 'Enable backups and configure at least one target first' : undefined}
          >
            <DatabaseBackup size={14} />
            {running ? 'Creating…' : 'Create restore point'}
          </button>
        </>
      )}
    >
      {loading && !data && (
        <div className="tool-loading">
          <RefreshCw size={18} className="is-spinning" />
          Reading configured backup targets…
        </div>
      )}

      {error && (
        <div className="tool-message is-error">
          <ShieldX size={16} />
          <div><strong>Backup operation failed</strong><span>{error}</span></div>
        </div>
      )}
      {notice && (
        <div className="tool-message is-success">
          <Check size={16} />
          <div><strong>Backup complete</strong><span>{notice}</span></div>
        </div>
      )}

      {data && (
        <>
          <div className="backup-config-grid">
            <div>
              <HardDrive size={16} />
              <span>Backup status</span>
              <strong>{data.demo ? 'Disabled in demo' : data.enabled ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <div>
              <LockKeyhole size={16} />
              <span>Storage format</span>
              <strong>{data.encrypted ? 'AES-256 encrypted' : 'Raw SQLite'}</strong>
            </div>
            <div>
              <RefreshCw size={16} />
              <span>Schedule</span>
              <strong>{data.intervalHours > 0 ? `Every ${data.intervalHours}h` : 'Manual only'}</strong>
            </div>
            <div>
              <ShieldCheck size={16} />
              <span>Current fingerprint</span>
              <strong title={data.databaseFingerprint}>
                {shortFingerprint(data.databaseFingerprint)}
              </strong>
            </div>
          </div>

          {!data.enabled && (
            <div className="tool-message is-warning">
              <ShieldAlert size={16} />
              <div>
                <strong>Automatic backups are not active</strong>
                <span>
                  {data.demo
                    ? 'Demo databases deliberately skip backup creation.'
                    : 'Enable backup.enabled and configure targets in config.yaml.'}
                </span>
              </div>
            </div>
          )}

          {data.fingerprintError && (
            <div className="tool-message is-warning">
              <ShieldAlert size={16} />
              <div><strong>Fingerprint unavailable</strong><span>{data.fingerprintError}</span></div>
            </div>
          )}

          {data.targets.length === 0 ? (
            <div className="tool-empty">
              <FileArchive size={28} />
              <strong>No backup targets configured</strong>
              <span>Add backup.targets entries to config.yaml to start creating restore points.</span>
            </div>
          ) : (
            <div className="backup-targets">
              {data.targets.map(target => (
                <section key={target.name} className="backup-target">
                  <header>
                    <div>
                      <strong>{target.name}</strong>
                      <code>{target.path}</code>
                    </div>
                    <span>{target.files.length}/{target.retention} retained</span>
                  </header>

                  {target.error && (
                    <div className="backup-target-error">
                      <ShieldAlert size={14} /> {target.error}
                    </div>
                  )}

                  {target.files.length === 0 ? (
                    <p className="backup-empty-target">No restore points found in this target.</p>
                  ) : (
                    <div className="backup-files">
                      {target.files.map(file => {
                        const key = `${target.name}:${file.name}`;
                        const verification = verifications[key];
                        return (
                          <article key={file.name} className="backup-file">
                            <FileArchive size={17} />
                            <div className="backup-file-main">
                              <div>
                                <strong>{file.name}</strong>
                                {file.current && <span className="backup-current"><Check size={10} /> current</span>}
                              </div>
                              <span>
                                {new Date(file.modifiedAt).toLocaleString()} · {formatBytes(file.size)}
                                {' · '}{file.format.toUpperCase()}
                                {file.version && ` · ${file.version}`}
                              </span>
                              <code title={file.fingerprint}>{shortFingerprint(file.fingerprint)}</code>
                              {verification && (
                                <div className={`backup-verification is-${verification.status}`}>
                                  {verification.status === 'verified'
                                    ? <ShieldCheck size={12} />
                                    : verification.status === 'warning'
                                      ? <ShieldAlert size={12} />
                                      : <ShieldX size={12} />}
                                  <span>
                                    {verification.status === 'verified'
                                      ? 'Integrity and fingerprint verified'
                                      : verification.error || 'Verification failed'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => void checkFile(target.name, file.name)}
                              disabled={verifying === key}
                            >
                              {verifying === key ? 'Checking…' : 'Verify'}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </ToolModal>
  );
}
