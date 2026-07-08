import { Routes, Route, Link } from 'react-router-dom';
import { Wallet, Settings as SettingsIcon, MessageSquare, BarChart3 } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import SnapshotEdit from './pages/SnapshotEdit';
import CommentFeed from './pages/CommentFeed';
import GraphsPage from './pages/GraphsPage';
import Settings from './pages/Settings';

function App() {
  return (
    <div className="container">
      <header className="app-header">
        <Link to="/" className="flex items-center gap-2">
          <Wallet size={32} color="var(--accent)" />
          <h1 className="app-title">Finn Tracker</h1>
        </Link>
        <div className="flex items-center gap-4">
          {/* Кнопка перехода на страницу графиков */}
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
          <Route path="/graphs" element={<GraphsPage />} /> {/* Новый роут */}
        </Routes>
      </main>
    </div>
  );
}

export default App;
