import { useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Settings as SettingsIcon, MessageSquare, BarChart3, Keyboard } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import SnapshotEdit from './pages/SnapshotEdit';
import CommentFeed from './pages/CommentFeed';
import GraphsPage from './pages/GraphsPage';
import Settings from './pages/Settings';
import { HotkeysHelpModal } from './pages/components/HotkeysHelpModal';
import { isTextInputTarget } from './lib/hotkeys';
import { AppFooter } from './pages/components/AppFooter';

function App() {
  const [showHotkeysHelp, setShowHotkeysHelp] = useState(false);
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
