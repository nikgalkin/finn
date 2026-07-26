import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArchiveRestore,
  ArrowLeft,
  ArrowLeftRight,
  Database,
  PackageOpen,
  Percent,
  Scale,
  TrendingUp
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { StickyPageHeader } from './components/StickyPageHeader';
import { ToolModalLoader } from './components/tools/ToolModal';

// CodeMirror is only pulled in when the editor is actually opened.
const SqlEditorModal = lazy(() => import('./components/tools/SqlEditorModal')
  .then(module => ({ default: module.SqlEditorModal })));
const DataHealthModal = lazy(() => import('./components/tools/DataHealthModal')
  .then(module => ({ default: module.DataHealthModal })));
const BackupInspectorModal = lazy(() => import('./components/tools/BackupInspectorModal')
  .then(module => ({ default: module.BackupInspectorModal })));
const ExportCenterModal = lazy(() => import('./components/tools/ExportCenterModal')
  .then(module => ({ default: module.ExportCenterModal })));
const GrowthGoalCalculatorModal = lazy(() => import('./components/tools/FinancialCalculatorModals')
  .then(module => ({ default: module.GrowthGoalCalculatorModal })));
const RebalancerCalculatorModal = lazy(() => import('./components/tools/FinancialCalculatorModals')
  .then(module => ({ default: module.RebalancerCalculatorModal })));
const ReturnCalculatorModal = lazy(() => import('./components/tools/FinancialCalculatorModals')
  .then(module => ({ default: module.ReturnCalculatorModal })));
const FxComparatorCalculatorModal = lazy(() => import('./components/tools/FinancialCalculatorModals')
  .then(module => ({ default: module.FxComparatorCalculatorModal })));

type ToolId =
  | 'sql-editor'
  | 'data-health'
  | 'backup-inspector'
  | 'export-center'
  | 'growth-goal'
  | 'rebalancer'
  | 'return-calculator'
  | 'fx-comparator';

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
  },
  {
    id: 'data-health',
    name: 'Data Health',
    description: 'Scan snapshots, settings, rates, tags, and Cash Flow for structural problems.',
    icon: Activity,
    accent: 'var(--success)'
  },
  {
    id: 'backup-inspector',
    name: 'Backup Inspector',
    description: 'Review restore points, verify integrity, and create a fresh backup on demand.',
    icon: ArchiveRestore,
    accent: 'var(--warning)'
  },
  {
    id: 'export-center',
    name: 'Export Center',
    description: 'Download a selected period as portable JSON or an analysis-ready CSV bundle.',
    icon: PackageOpen,
    accent: '#60a5fa'
  }
];

const CALCULATORS: ToolDefinition[] = [
  {
    id: 'growth-goal',
    name: 'Growth & Goal Planner',
    description: 'Project compound growth or calculate the monthly contribution needed to reach a target.',
    icon: TrendingUp,
    accent: 'var(--success)'
  },
  {
    id: 'rebalancer',
    name: 'Portfolio Rebalancer',
    description: 'Turn target allocations and new cash into specific buy and sell amounts.',
    icon: Scale,
    accent: '#a78bfa'
  },
  {
    id: 'return-calculator',
    name: 'Return Calculator',
    description: 'Calculate money-weighted annual return from dated investments and withdrawals.',
    icon: Percent,
    accent: '#60a5fa'
  },
  {
    id: 'fx-comparator',
    name: 'FX Deal Comparator',
    description: 'Compare two exchange rates and fees to see exactly how much currency each deal buys.',
    icon: ArrowLeftRight,
    accent: '#14b8a6'
  }
];

function ToolTile({ tool, onOpen }: { tool: ToolDefinition; onOpen: (id: ToolId) => void }) {
  const Icon = tool.icon;
  return (
    <button type="button" className="tools-tile glass-panel" onClick={() => onOpen(tool.id)}>
      <span className="tools-tile-icon" style={{ color: tool.accent }}>
        <Icon size={24} />
      </span>
      <strong>{tool.name}</strong>
      <span className="tools-tile-description">{tool.description}</span>
    </button>
  );
}

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
              {TOOLS.length + CALCULATORS.length} utilities · inspect data and explore financial decisions
            </div>
          </div>
        </div>
      </StickyPageHeader>

      <section className="tools-section">
        <div className="tools-section-heading">
          <div>
            <strong>Data tools</strong>
            <span>Inspect, repair, protect, and move your Finn data.</span>
          </div>
          <span>{TOOLS.length} tools</span>
        </div>
        <div className="tools-grid">
          {TOOLS.map(tool => <ToolTile key={tool.id} tool={tool} onOpen={setOpenTool} />)}
        </div>
      </section>

      <section className="tools-section">
        <div className="tools-section-heading">
          <div>
            <strong>Financial calculators</strong>
            <span>Model growth, targets, allocation, returns, and exchange-rate choices.</span>
          </div>
          <span>{CALCULATORS.length} calculators</span>
        </div>
        <div className="tools-grid">
          {CALCULATORS.map(tool => <ToolTile key={tool.id} tool={tool} onOpen={setOpenTool} />)}
        </div>
      </section>

      {openTool === 'sql-editor' && (
        <Suspense fallback={(
          <ToolModalLoader
            label="Loading the SQL editor"
            onClose={() => setOpenTool(null)}
          />
        )}>
          <SqlEditorModal onClose={() => setOpenTool(null)} />
        </Suspense>
      )}
      {openTool === 'data-health' && (
        <Suspense fallback={(
          <ToolModalLoader
            label="Loading Data Health"
            onClose={() => setOpenTool(null)}
          />
        )}>
          <DataHealthModal onClose={() => setOpenTool(null)} />
        </Suspense>
      )}
      {openTool === 'backup-inspector' && (
        <Suspense fallback={(
          <ToolModalLoader
            label="Loading Backup Inspector"
            onClose={() => setOpenTool(null)}
          />
        )}>
          <BackupInspectorModal onClose={() => setOpenTool(null)} />
        </Suspense>
      )}
      {openTool === 'export-center' && (
        <Suspense fallback={(
          <ToolModalLoader
            label="Loading Export Center"
            onClose={() => setOpenTool(null)}
          />
        )}>
          <ExportCenterModal onClose={() => setOpenTool(null)} />
        </Suspense>
      )}
      {openTool === 'growth-goal' && (
        <Suspense fallback={(
          <ToolModalLoader
            label="Loading Growth & Goal Planner"
            onClose={() => setOpenTool(null)}
          />
        )}>
          <GrowthGoalCalculatorModal onClose={() => setOpenTool(null)} />
        </Suspense>
      )}
      {openTool === 'rebalancer' && (
        <Suspense fallback={(
          <ToolModalLoader
            label="Loading Portfolio Rebalancer"
            onClose={() => setOpenTool(null)}
          />
        )}>
          <RebalancerCalculatorModal onClose={() => setOpenTool(null)} />
        </Suspense>
      )}
      {openTool === 'return-calculator' && (
        <Suspense fallback={(
          <ToolModalLoader
            label="Loading Return Calculator"
            onClose={() => setOpenTool(null)}
          />
        )}>
          <ReturnCalculatorModal onClose={() => setOpenTool(null)} />
        </Suspense>
      )}
      {openTool === 'fx-comparator' && (
        <Suspense fallback={(
          <ToolModalLoader
            label="Loading FX Deal Comparator"
            onClose={() => setOpenTool(null)}
          />
        )}>
          <FxComparatorCalculatorModal onClose={() => setOpenTool(null)} />
        </Suspense>
      )}
    </div>
  );
}
