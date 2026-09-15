import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Inbox, Trash2, X } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { useAsyncResource } from '../hooks/useAsyncResource';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { StickyPageHeader } from './components/StickyPageHeader';
import { PageLoader } from './components/PageLoader';
import { DsSourcesPanel } from './components/DsSourcesPanel';
import { DsInboxItemRow } from './components/DsInboxItemRow';
import { DsConfirmPluginModal } from './components/DsConfirmPluginModal';
import { SegmentedControl } from './components/SegmentedControl';
import {
  DsApiError,
  acceptDsInboxItems,
  clearDsInbox,
  confirmDatasource,
  fetchDatasources,
  fetchDsInbox,
  rejectDsInboxItems,
  reopenDsInboxItems,
  runDatasourceFetch,
  saveDsInboxDraft
} from '../lib/dsApi';
import { UNKNOWN_MONTH, acceptableItemIds, describeAcceptOutcome, groupDsInboxByMonth } from '../lib/dsInbox';
import { formatMonth } from '../lib/format';
import type {
  DatasourceSource,
  DatasourceSources,
  DsFetchSummary,
  DsInboxItem,
  DsInboxStatus,
  FlowEntryDraft
} from '../types';

type InboxFilter = DsInboxStatus;

const FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: 'pending', label: 'Waiting' },
  { value: 'invalid', label: 'Needs fixing' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'detached', label: 'Movement deleted' }
];

const emptyMessage = (filter: InboxFilter) => {
  switch (filter) {
    case 'invalid': return 'Nothing needs fixing.';
    case 'accepted': return 'Nothing has been accepted yet.';
    case 'rejected': return 'Nothing has been rejected.';
    case 'detached': return 'Every accepted item still has its movement.';
    default: return 'Nothing is waiting. Run a datasource to bring something in.';
  }
};

export default function DsInbox() {
  useEscapeToDashboard();
  const { settings } = useSettings();

  const [filter, setFilter] = useState<InboxFilter>('pending');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [runningSource, setRunningSource] = useState('');
  const [summaries, setSummaries] = useState<Record<string, DsFetchSummary>>({});
  const [pendingConfirm, setPendingConfirm] = useState<DatasourceSource | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [savingId, setSavingId] = useState(0);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');

  const sourcesResource = useAsyncResource<DatasourceSources>(
    { enabled: false, demo: false, sources: [], pending: 0 },
    fetchDatasources,
    `ds-sources-${reloadToken}`,
    { fallbackError: 'Datasources could not be loaded.' }
  );
  const inboxResource = useAsyncResource<DsInboxItem[]>(
    [],
    () => fetchDsInbox(filter),
    `ds-inbox-${filter}-${reloadToken}`,
    { fallbackError: 'The Inbox could not be loaded.' }
  );

  const reload = useCallback(() => {
    setSelectedIds([]);
    setReloadToken(token => token + 1);
  }, []);

  const items = inboxResource.data;
  const groups = useMemo(() => groupDsInboxByMonth(items), [items]);
  const acceptableIds = useMemo(() => new Set(acceptableItemIds(items)), [items]);
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const accounts = useMemo(
    () => settings.organizations.filter(organization => !organization.archivedAt).map(organization => organization.name),
    [settings.organizations]
  );

  const report = (error: unknown) => {
    setFailure(error instanceof Error ? error.message : String(error));
    setNotice('');
  };

  const announce = (message: string) => {
    setNotice(message);
    setFailure('');
  };

  const applySummary = (summary: DsFetchSummary) => {
    setSummaries(current => ({ ...current, [summary.source]: summary }));
    if (summary.status === 'ok') {
      announce(`${summary.source}: ${summary.itemsNew} new item(s), ${summary.itemsSkipped} already known.`);
    } else {
      setFailure(`${summary.source}: ${summary.error}`);
    }
    reload();
  };

  const runFetch = async (source: DatasourceSource) => {
    setRunningSource(source.name);
    try {
      applySummary(await runDatasourceFetch(source.name));
    } catch (error) {
      // The first run of a binary is a question, not a failure: the server
      // refuses until the exact path and hash have been confirmed.
      if (error instanceof DsApiError && error.code === 'confirmation_required') {
        setPendingConfirm(source);
      } else {
        report(error);
      }
    } finally {
      setRunningSource('');
    }
  };

  const confirmAndRun = async () => {
    if (!pendingConfirm) return;
    setConfirming(true);
    setRunningSource(pendingConfirm.name);
    try {
      await confirmDatasource(pendingConfirm.name);
      setPendingConfirm(null);
      applySummary(await runDatasourceFetch(pendingConfirm.name));
    } catch (error) {
      report(error);
    } finally {
      setConfirming(false);
      setRunningSource('');
    }
  };

  const saveDraft = async (id: number, draft: FlowEntryDraft) => {
    setSavingId(id);
    try {
      const saved = await saveDsInboxDraft(id, draft);
      inboxResource.setData(current => current.map(item => (item.id === id ? saved : item)));
      announce(saved.status === 'invalid' ? `Saved, but it still needs fixing: ${saved.note}` : 'Saved.');
      return true;
    } catch (error) {
      report(error);
      return false;
    } finally {
      setSavingId(0);
    }
  };

  const accept = async (ids: number[], allowDuplicates: boolean) => {
    if (ids.length === 0) return;
    try {
      const result = await acceptDsInboxItems(ids, allowDuplicates);
      const problems = result.results
        .filter(outcome => outcome.status !== 'accepted')
        .map(outcome => `#${outcome.id}: ${describeAcceptOutcome(outcome.status)}`);

      if (problems.length > 0) {
        setFailure(`${result.accepted} added to Cash Flow. ${problems.join('; ')}`);
        setNotice('');
      } else {
        announce(`${result.accepted} movement(s) added to Cash Flow.`);
      }
      reload();
    } catch (error) {
      report(error);
    }
  };

  const reject = async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      const rejected = await rejectDsInboxItems(ids);
      announce(`${rejected} item(s) rejected. They stay here so the source cannot propose them again.`);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const reopen = async (ids: number[]) => {
    try {
      const reopened = await reopenDsInboxItems(ids);
      announce(`${reopened} item(s) back in the queue.`);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const clear = async () => {
    const label = FILTERS.find(option => option.value === filter)?.label.toLowerCase() ?? 'listed';
    const confirmed = window.confirm(
      `Delete every ${label} item from the Inbox?\n\n`
      + 'Deduplication lives in these rows, so whatever is deleted can be proposed again by the next fetch — '
      + 'including anything you rejected.'
    );
    if (!confirmed) return;

    try {
      const removed = await clearDsInbox(filter);
      announce(`${removed} item(s) removed.`);
      reload();
    } catch (error) {
      report(error);
    }
  };

  const toggleSelection = (id: number, isSelected: boolean) => {
    setSelectedIds(current => (isSelected ? [...current, id] : current.filter(value => value !== id)));
  };

  const selectAllValid = () => setSelectedIds(Array.from(acceptableIds));

  if (!sourcesResource.loaded) {
    return <PageLoader label="Loading Inbox" />;
  }

  const view = sourcesResource.data;
  if (!view.enabled) {
    return (
      <div className="ds-inbox">
        <StickyPageHeader>
          <h2 className="flex items-center gap-2"><Inbox size={20} /> Inbox</h2>
          <Link to="/" className="btn"><ArrowLeft size={16} /> Dashboard</Link>
        </StickyPageHeader>
        <div className="glass-panel ds-empty">
          <h3>Datasources are off</h3>
          <p>
            {view.demo
              ? 'Demo mode never runs external programs, so a sample database stays safe to hand around.'
              : 'Set datasources.enabled and register a plugin in config.yml. The registry lives in that file only — neither this page nor the API can add one.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-inbox">
      <StickyPageHeader>
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2"><Inbox size={20} /> Inbox</h2>
          {view.pending > 0 && <span className="ds-chip is-accent">{view.pending} waiting</span>}
        </div>
        <div className="flex items-center gap-2">
          <Link to="/flow" className="btn">Cash Flow</Link>
          <Link to="/" className="btn"><ArrowLeft size={16} /> Dashboard</Link>
        </div>
      </StickyPageHeader>

      <DsSourcesPanel
        sources={view.sources}
        runningSource={runningSource}
        summaries={summaries}
        onFetch={source => void runFetch(source)}
      />

      {notice && <p className="ds-banner is-ok">{notice}</p>}
      {failure && <p className="ds-banner is-error"><AlertTriangle size={15} /> {failure}</p>}
      {sourcesResource.error && <p className="ds-banner is-error">{sourcesResource.error.message}</p>}

      <div className="ds-toolbar">
        <SegmentedControl
          value={filter}
          options={FILTERS}
          onChange={value => {
            setSelectedIds([]);
            setFilter(value);
          }}
        />
        <div className="ds-toolbar-actions">
          {filter === 'pending' && acceptableIds.size > 0 && (
            <button className="btn" onClick={selectAllValid}>Select all valid ({acceptableIds.size})</button>
          )}
          <button className="btn btn-danger" onClick={() => void clear()} disabled={items.length === 0}>
            <Trash2 size={15} /> Clear
          </button>
        </div>
      </div>

      {inboxResource.loading && !inboxResource.loaded && <PageLoader label="Loading Inbox" />}

      {inboxResource.loaded && items.length === 0 && (
        <div className="glass-panel ds-empty"><p>{emptyMessage(filter)}</p></div>
      )}

      {groups.map(group => (
        <section key={group.month} className="ds-month">
          <h3 className="ds-month-title">
            {group.month === UNKNOWN_MONTH ? 'No month yet' : formatMonth(group.month)}
            <small>{group.items.length}</small>
          </h3>
          {group.items.map(item => (
            <DsInboxItemRow
              key={item.id}
              item={item}
              selected={selectedIds.includes(item.id)}
              selectable={item.status === 'pending' || item.status === 'invalid' || item.status === 'detached'}
              saving={savingId === item.id}
              currencies={settings.currencies}
              accounts={accounts}
              tags={settings.tags || []}
              categories={settings.cashFlow?.categories || []}
              onSelect={toggleSelection}
              onSave={saveDraft}
              onAccept={(id, allowDuplicates) => void accept([id], allowDuplicates)}
              onReject={id => void reject([id])}
              onReopen={id => void reopen([id])}
            />
          ))}
        </section>
      ))}

      {selectedIds.length > 0 && (
        <div className="ds-bulk-bar glass-panel">
          <span>{selectedIds.length} selected</span>
          <div className="ds-bulk-actions">
            <button className="btn" onClick={() => setSelectedIds([])}>Clear selection</button>
            {filter === 'detached' ? (
              <button className="btn btn-primary" onClick={() => void reopen(selectedIds)}>Reopen</button>
            ) : (
              <>
                <button className="btn btn-danger" onClick={() => void reject(selectedIds)}><X size={15} /> Reject</button>
                <button className="btn btn-primary" onClick={() => void accept(selectedIds, false)}>
                  <Check size={15} /> Accept
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {pendingConfirm && (
        <DsConfirmPluginModal
          source={pendingConfirm}
          confirming={confirming}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void confirmAndRun()}
        />
      )}

      <p className="ds-footnote">
        Items are proposals: nothing reaches Cash Flow until you accept it here. The month defaults to{' '}
        {formatMonth(currentMonth)} for anything that arrived without one.
      </p>
    </div>
  );
}
