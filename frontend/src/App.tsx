import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Settings as SettingsIcon, MessageSquare, BarChart3, Keyboard, Power } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import SnapshotEdit from './pages/SnapshotEdit';
import CommentFeed from './pages/CommentFeed';
import GraphsPage from './pages/GraphsPage';
import Settings from './pages/Settings';
import { HotkeysHelpModal } from './pages/components/HotkeysHelpModal';
import { isTextInputTarget } from './lib/hotkeys';
import { AppFooter } from './pages/components/AppFooter';
import { API_URL } from './types';

type BackupTargetResult = {
  name: string;
  path: string;
  status: 'current' | 'created' | 'failed';
  error?: string;
};

type BackupReport = {
  status: 'disabled' | 'skipped' | 'success' | 'partial' | 'failed' | 'bypassed';
  targets?: BackupTargetResult[];
  error?: string;
};

const backupSummary = (report: BackupReport | null) => {
  switch (report?.status) {
    case 'success': return 'Backups completed successfully.';
    case 'skipped': return 'The database has not changed. Existing backups are up to date.';
    case 'disabled': return 'Backups are disabled in the configuration.';
    case 'bypassed': return 'Finn was stopped without completing a backup.';
    default: return 'Backup status is unavailable.';
  }
};

function App() {
  const [showHotkeysHelp, setShowHotkeysHelp] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [shutdownComplete, setShutdownComplete] = useState(false);
  const [shutdownBackup, setShutdownBackup] = useState<BackupReport | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTextInputTarget(event.target)) return;

      if (event.key === 'Escape' && showHotkeysHelp) {
        event.preventDefault();
        event.stopPropagation();
        setShowHotkeysHelp(false);
      } else if (event.code === 'KeyH') {
        event.preventDefault();
        setShowHotkeysHelp(true);
      } else if (!showHotkeysHelp && !document.querySelector('[data-hotkeys-guard="true"]')) {
        const routes: Record<string, string> = {
          KeyN: '/snapshot/new',
          KeyG: '/graphs',
          KeyF: '/feed',
          KeyS: '/settings'
        };
        const route = routes[event.code];
        const isSafeNavigationPage = ['/', '/feed', '/graphs'].includes(location.pathname);
        if (route && isSafeNavigationPage) {
          event.preventDefault();
          navigate(route);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [location.pathname, navigate, showHotkeysHelp]);

  const requestShutdown = async (skipBackup = false) => {
    setShuttingDown(true);
    try {
      const suffix = skipBackup ? '?skip_backup=true' : '';
      const response = await fetch(`${API_URL}/shutdown${suffix}`, { method: 'POST' });
      const payload = await response.json() as { status?: string; backup?: BackupReport; error?: string };

      if (!response.ok) {
        setShuttingDown(false);
        const report = payload.backup;
        const failedTargets = report?.targets
          ?.filter(target => target.status === 'failed')
          .map(target => `${target.name}: ${target.error || 'unknown error'}`)
          .join('\n');
        const details = failedTargets || report?.error || payload.error || 'Unknown backup error.';
        const shutDownAnyway = window.confirm(
          `Finn is still running because the backup did not complete:\n\n${details}\n\nShut down anyway without a complete backup?`
        );
        if (shutDownAnyway) await requestShutdown(true);
        return;
      }

      setShutdownBackup(payload.backup || null);
      setShutdownComplete(true);
    } catch (error) {
      console.error(error);
      setShuttingDown(false);
      alert('Failed to shut down the server.');
    }
  };

  const handleShutdown = () => {
    if (!window.confirm('Shut down Finn Tracker? Any unsaved changes will be lost.')) return;
    void requestShutdown();
  };

  if (shutdownComplete) {
    const backupWasBypassed = shutdownBackup?.status === 'bypassed';
    return (
      <div className="shutdown-screen">
        <Power size={36} color={backupWasBypassed ? 'var(--danger)' : undefined} />
        <h2>Finn Tracker stopped</h2>
        <p
          style={backupWasBypassed ? {
            color: 'var(--danger)',
            fontWeight: 600,
            padding: '10px 14px',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.08)'
          } : undefined}
        >
          {backupSummary(shutdownBackup)}
        </p>
        {!!shutdownBackup?.targets?.length && (
          <div style={{ marginTop: '20px', display: 'grid', gap: '8px', width: 'min(560px, 90vw)' }}>
            {shutdownBackup.targets.map(target => (
              <div
                key={`${target.name}-${target.path}`}
                className="glass-panel"
                style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  borderColor: target.status === 'created'
                    ? 'rgba(34, 197, 94, 0.45)'
                    : target.status === 'current'
                      ? 'rgba(59, 130, 246, 0.45)'
                      : 'rgba(239, 68, 68, 0.45)'
                }}
              >
                <strong style={{ color: 'var(--text-primary)' }}>{target.name}</strong>
                <span
                  style={{
                    float: 'right',
                    color: target.status === 'created'
                      ? 'var(--success)'
                      : target.status === 'current'
                        ? 'var(--accent)'
                        : 'var(--danger)'
                  }}
                >
                  <span aria-hidden="true" style={{ marginRight: '7px' }}>●</span>
                  {target.status === 'created' ? 'Backup created' : target.status === 'current' ? 'Already up to date' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}
        <p style={{ marginTop: '16px' }}>You can close this tab.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="app-header">
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <Wallet size={32} color="var(--accent)" />
            <h1 className="app-title">Finn Tracker</h1>
          </Link>
          <div style={{ width: '1px', height: '24px', background: 'var(--glass-border)', margin: '0 4px' }} />
          <button className="btn" title="Keyboard shortcuts (H)" aria-label="Keyboard shortcuts" style={{ padding: '8px' }} onClick={() => setShowHotkeysHelp(true)}>
            <Keyboard size={18} />
          </button>
          <button
            className="btn btn-danger"
            title="Shut down Finn Tracker"
            aria-label="Shut down Finn Tracker"
            onClick={handleShutdown}
            disabled={shuttingDown}
            style={{ padding: '8px' }}
          >
            <Power size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/graphs" className="btn" style={{ color: 'var(--text-secondary)' }}>
            <BarChart3 size={18} /> Graphs
          </Link>
          <Link to="/feed" className="btn" style={{ color: 'var(--text-secondary)' }}>
            <MessageSquare size={18} /> Feed
          </Link>
          <Link to="/settings" className="btn" style={{ color: 'var(--text-secondary)' }}>
            <SettingsIcon size={18} /> Settings
          </Link>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/snapshot" element={<SnapshotEdit />} />
          <Route path="/snapshot/new" element={<SnapshotEdit />} />
          <Route path="/snapshot/copy/:sourceMonth" element={<SnapshotEdit />} />
          <Route path="/snapshot/:month" element={<SnapshotEdit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/feed" element={<CommentFeed />} />
          <Route path="/graphs" element={<GraphsPage />} />
        </Routes>
      </main>
      <AppFooter />
      {showHotkeysHelp && (
        <HotkeysHelpModal onClose={() => setShowHotkeysHelp(false)} />
      )}
    </div>
  );
}

export default App;
