import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Settings as SettingsIcon, MessageSquare, BarChart3, Bot, Keyboard, Power, ArrowDownUp } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import { HotkeysHelpModal } from './pages/components/HotkeysHelpModal';
import { getNavigationHotkey, isTextInputTarget } from './lib/hotkeys';
import { AppFooter } from './pages/components/AppFooter';
import { PageLoader } from './pages/components/PageLoader';
import { API_URL } from './types';
import { useSettings } from './hooks/useSettings';

const loadDeferredRoutes = () => import('./pages/routeChunks/DeferredRoutes');
const SnapshotEdit = lazy(() => loadDeferredRoutes().then(module => ({ default: module.SnapshotEdit })));
const CommentFeed = lazy(() => loadDeferredRoutes().then(module => ({ default: module.CommentFeed })));
const GraphsPage = lazy(() => loadDeferredRoutes().then(module => ({ default: module.GraphsPage })));
const Settings = lazy(() => loadDeferredRoutes().then(module => ({ default: module.Settings })));
const CashFlow = lazy(() => loadDeferredRoutes().then(module => ({ default: module.CashFlow })));
const AIChat = lazy(() => loadDeferredRoutes().then(module => ({ default: module.AIChat })));

type BackupTargetResult = {
  name: string;
  path: string;
  status: 'current' | 'created' | 'created_with_warning' | 'failed';
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
    case 'partial': return 'Backup files were created, but some targets need attention.';
    case 'skipped': return 'The database has not changed. Existing backups are up to date.';
    case 'disabled': return 'Backups are disabled in the configuration.';
    case 'bypassed': return 'Finn was stopped without completing a backup.';
    default: return 'Backup status is unavailable.';
  }
};

function App() {
  const { settings } = useSettings();
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
        const hotkey = getNavigationHotkey(event);
        if (hotkey && hotkey.route !== location.pathname) {
          event.preventDefault();
          if (document.querySelector('[data-unsaved-changes="true"]') && !window.confirm('Leave this page and discard unsaved changes?')) return;
          navigate(hotkey.route);
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
            {shutdownBackup.targets.map(target => {
              const presentation = target.status === 'created'
                ? { color: 'var(--success)', border: 'rgba(34, 197, 94, 0.45)', label: 'Backup created' }
                : target.status === 'current'
                  ? { color: 'var(--accent)', border: 'rgba(59, 130, 246, 0.45)', label: 'Already up to date' }
                  : target.status === 'created_with_warning'
                    ? { color: 'var(--warning)', border: 'rgba(245, 158, 11, 0.5)', label: 'Backup created with warnings' }
                    : { color: 'var(--danger)', border: 'rgba(239, 68, 68, 0.45)', label: 'Failed' };
              return (
                <div
                  key={`${target.name}-${target.path}`}
                  className="glass-panel"
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    borderColor: presentation.border
                  }}
                >
                  <strong style={{ color: 'var(--text-primary)' }}>{target.name}</strong>
                  <span style={{ float: 'right', color: presentation.color }}>
                    <span aria-hidden="true" style={{ marginRight: '7px' }}>●</span>
                    {presentation.label}
                  </span>
                  {target.error && (
                    <div style={{ marginTop: '8px', paddingRight: '8px', color: presentation.color, fontSize: '12px', lineHeight: 1.45 }}>
                      {target.error}
                    </div>
                  )}
                </div>
              );
            })}
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
          <Link to="/assistant" className="btn" style={{ color: 'var(--text-secondary)' }}>
            <Bot size={18} /> Assistant
          </Link>
          {settings.cashFlow?.enabled && (
            <Link to="/flow" className="btn" style={{ color: 'var(--text-secondary)' }}>
              <ArrowDownUp size={18} /> Cash Flow
            </Link>
          )}
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
        <Suspense fallback={<PageLoader label="Loading page" />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/snapshot" element={<SnapshotEdit />} />
            <Route path="/snapshot/new" element={<SnapshotEdit />} />
            <Route path="/snapshot/copy/:sourceMonth" element={<SnapshotEdit />} />
            <Route path="/snapshot/:month" element={<SnapshotEdit />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/feed" element={<CommentFeed />} />
            <Route path="/graphs" element={<GraphsPage />} />
            <Route path="/flow" element={<CashFlow />} />
            <Route path="/assistant" element={<AIChat />} />
          </Routes>
        </Suspense>
      </main>
      <AppFooter />
      {showHotkeysHelp && (
        <HotkeysHelpModal onClose={() => setShowHotkeysHelp(false)} />
      )}
    </div>
  );
}

export default App;
