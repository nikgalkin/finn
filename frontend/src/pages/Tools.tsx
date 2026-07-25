import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Database } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { PageLoader } from './components/PageLoader';
import { StickyPageHeader } from './components/StickyPageHeader';

// CodeMirror is only pulled in when the editor is actually opened.
const SqlEditorModal = lazy(() => import('./components/tools/SqlEditorModal')
  .then(module => ({ default: module.SqlEditorModal })));

type ToolId = 'sql-editor';

type ToolDefinition = {
  id: ToolId;
  name: string;
  description: string;
  icon: LucideIcon;
  accent: string;
};

const TOOLS: ToolDefinition[] = [
  {
    id: 'sql-editor',
    name: 'SQL editor',
    description: 'Read and fix rows directly, with table hints and a dry run before anything is saved.',
    icon: Database,
    accent: 'var(--accent)'
  }
];

export default function Tools() {
  const [openTool, setOpenTool] = useState<ToolId | null>(null);
  useEscapeToDashboard({ blocked: openTool !== null });

  return (
    <div className="tools-page">
      <StickyPageHeader compactTop>
        <div className="flex items-center gap-4">
          <Link to="/" className="btn" title="Back to dashboard"><ArrowLeft size={18} /></Link>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Tools</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
              {TOOLS.length} {TOOLS.length === 1 ? 'utility' : 'utilities'} · act on your data directly
            </div>
          </div>
        </div>
      </StickyPageHeader>

      <div className="tools-grid">
        {TOOLS.map(tool => {
          const Icon = tool.icon;
          return (
            <button key={tool.id} type="button" className="tools-tile glass-panel" onClick={() => setOpenTool(tool.id)}>
              <span className="tools-tile-icon" style={{ color: tool.accent }}>
                <Icon size={24} />
              </span>
              <strong>{tool.name}</strong>
              <span className="tools-tile-description">{tool.description}</span>
            </button>
          );
        })}
      </div>

      {openTool === 'sql-editor' && (
        <Suspense fallback={<PageLoader label="Loading the SQL editor" />}>
          <SqlEditorModal onClose={() => setOpenTool(null)} />
        </Suspense>
      )}
    </div>
  );
}
