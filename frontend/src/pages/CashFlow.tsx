import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRightLeft, ArrowUp, Calendar, ChevronsUpDown, Copy, FileUp, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { API_URL } from '../types';
import type { FlowDirection, FlowEntry } from '../types';
import { calculateFlowTax, summarizeFlowEntries } from '../lib/cashFlow';
import { FlowPeriodModal } from './components/FlowPeriodModal';
import type { FlowPeriodDraft, FlowPeriodSeed } from './components/FlowPeriodModal';
import { PageLoader } from './components/PageLoader';
import { QuickHoverTooltip } from './components/QuickHoverTooltip';
import { CommentModal } from './components/SnapshotCommentModal';
import { TimeframeControl } from './components/TimeframeControl';
import { FlowCsvImportModal } from './components/FlowCsvImportModal';
import { FlowNetSummary } from './components/FlowNetSummary';
import { findFlowCsvDuplicates, parseFlowCsv } from '../lib/flowCsv';
import type { FlowCsvPreview } from '../lib/flowCsv';
import { orientExchangeRate } from '../lib/finance';

type FlowMovementFilter = 'all' | FlowDirection | 'transfer';

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const sortEntries = (entries: FlowEntry[]) => [...entries].sort((a, b) => (
  b.month.localeCompare(a.month) || b.id - a.id
));

const matchesDirection = (entry: FlowEntry, direction: FlowMovementFilter) => (
  direction === 'all'
  || (direction === 'transfer' ? entry.entryType === 'transfer' : entry.entryType !== 'transfer' && entry.direction === direction)
);

const matchesCategory = (entry: FlowEntry, category: string) => (
  category === 'all' || (entry.entryType !== 'transfer' && (category === 'none' ? !entry.category : entry.category === category))
);

const matchesCounterparty = (entry: FlowEntry, counterparty: string) => (
  counterparty === 'all' || (entry.entryType !== 'transfer' && entry.counterparty === counterparty)
);

const formatAmount = (amount: number, currency: string) => (
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(amount)} ${currency}`
);

const formatTaxAmount = (amount: number, currency: string) => (
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(amount)} ${currency}`
);

const formatTransferRate = (entry: FlowEntry) => {
  if (entry.currency === entry.toCurrency || entry.amount === 0 || entry.toAmount === 0) return '';
  const directRate = entry.toAmount / entry.amount;
  const formatRate = (rate: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(rate);
  const displayRate = orientExchangeRate(entry.currency, entry.toCurrency, directRate);
  return `1 ${displayRate.fromCurrency} = ${formatRate(displayRate.rate)} ${displayRate.toCurrency}`;
};

const formatMonth = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1));
};

const nextMonth = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return currentMonth();
  const date = new Date(year, monthNumber, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const readError = async (response: Response) => {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || 'Cash Flow request failed.';
  } catch {
    return 'Cash Flow request failed.';
  }
};

const fetchFlowEntries = async () => {
  const response = await fetch(`${API_URL}/flows`);
  if (!response.ok) throw new Error(await readError(response));
  const data = await response.json() as FlowEntry[];
  return sortEntries((data || []).map(entry => ({
    ...entry,
    entryType: entry.entryType || 'external',
    account: entry.account || '',
    taxRate: entry.taxRate || 0,
    toAccount: entry.toAccount || '',
    toCurrency: entry.toCurrency || '',
    toAmount: entry.toAmount || 0
  })));
};

export default function CashFlow() {
  const { settings, loading: settingsLoading } = useSettings();
  const [searchParams] = useSearchParams();
  const [entries, setEntries] = useState<FlowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [commentEditor, setCommentEditor] = useState<{ entry: FlowEntry; text: string } | null>(null);
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [periodEditor, setPeriodEditor] = useState<{ month: string; focusEntryID?: number; appendBlank?: boolean; seedEntries?: FlowPeriodSeed[] } | null>(null);
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [directionFilter, setDirectionFilter] = useState<FlowMovementFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [counterpartyFilter, setCounterpartyFilter] = useState('all');
  const [csvPreview, setCsvPreview] = useState<FlowCsvPreview | null>(null);
  const [csvImportDuplicates, setCsvImportDuplicates] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportError, setCsvImportError] = useState('');
  const [csvImportNotice, setCsvImportNotice] = useState('');
  const linkedMonth = searchParams.get('month');
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => new Set(linkedMonth ? [linkedMonth.slice(0, 4)] : []));
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set(linkedMonth ? [linkedMonth] : []));
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const expansionInitializedRef = useRef(false);

  useEscapeToDashboard({
    blocked: Boolean(periodEditor || commentEditor || csvPreview)
  });

  useEffect(() => {
    if (settingsLoading) return;
    if (!settings.cashFlow?.enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchFlowEntries()
      .then(flowData => {
        if (!cancelled) setEntries(flowData);
      })
      .catch(fetchError => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : 'Could not load Cash Flow.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [settings.cashFlow?.enabled, settingsLoading]);

  const months = useMemo(() => Array.from(new Set(entries.map(entry => entry.month))).sort((a, b) => a.localeCompare(b)), [entries]);
  const allCategorySuggestions = useMemo(() => Array.from(new Set(entries.map(entry => entry.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [entries]);
  const effectiveEndMonth = endMonth && startMonth && endMonth < startMonth ? startMonth : endMonth;

  useEffect(() => {
    if (months.length > 0 && !startMonth && !endMonth) {
      if (!linkedMonth || !months.includes(linkedMonth)) {
        setStartMonth(months[0]);
        setEndMonth(months[months.length - 1]);
      }
    }
  }, [endMonth, linkedMonth, months, startMonth]);

  useEffect(() => {
    if (!linkedMonth || !months.includes(linkedMonth)) return;
    setStartMonth(linkedMonth);
    setEndMonth(linkedMonth);
  }, [linkedMonth, months]);

  useEffect(() => {
    if (!linkedMonth || !months.includes(linkedMonth)) return;
    const linkedYear = linkedMonth.slice(0, 4);
    setExpandedYears(previous => {
      if (previous.has(linkedYear)) return previous;
      return new Set(previous).add(linkedYear);
    });
    setExpandedMonths(previous => {
      if (previous.has(linkedMonth)) return previous;
      return new Set(previous).add(linkedMonth);
    });
  }, [linkedMonth, months]);

  const timeframeEntries = useMemo(() => entries.filter(entry => (
    (!startMonth || entry.month >= startMonth)
    && (!effectiveEndMonth || entry.month <= effectiveEndMonth)
  )), [effectiveEndMonth, entries, startMonth]);

  const timeframeDirections = useMemo(() => new Set(timeframeEntries.map(entry => entry.entryType === 'transfer' ? 'transfer' : entry.direction)), [timeframeEntries]);

  const counterpartyFacetEntries = useMemo(() => timeframeEntries.filter(entry => (
    matchesDirection(entry, directionFilter) && matchesCategory(entry, categoryFilter)
  )), [categoryFilter, directionFilter, timeframeEntries]);
  const counterparties = useMemo(() => Array.from(new Set(
    counterpartyFacetEntries.map(entry => entry.counterparty).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b)), [counterpartyFacetEntries]);

  const categoryFacetEntries = useMemo(() => timeframeEntries.filter(entry => (
    matchesDirection(entry, directionFilter) && matchesCounterparty(entry, counterpartyFilter)
  )), [counterpartyFilter, directionFilter, timeframeEntries]);
  const categories = useMemo(() => Array.from(new Set(
    categoryFacetEntries.map(entry => entry.category).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b)), [categoryFacetEntries]);
  const hasUncategorizedEntries = useMemo(() => categoryFacetEntries.some(entry => entry.entryType !== 'transfer' && !entry.category), [categoryFacetEntries]);

  useEffect(() => {
    if (directionFilter !== 'all' && !timeframeDirections.has(directionFilter)) setDirectionFilter('all');
  }, [directionFilter, timeframeDirections]);

  useEffect(() => {
    if (counterpartyFilter !== 'all' && !counterparties.includes(counterpartyFilter)) setCounterpartyFilter('all');
  }, [counterparties, counterpartyFilter]);

  useEffect(() => {
    const categoryAvailable = categoryFilter === 'none' ? hasUncategorizedEntries : categories.includes(categoryFilter);
    if (categoryFilter !== 'all' && !categoryAvailable) setCategoryFilter('all');
  }, [categories, categoryFilter, hasUncategorizedEntries]);

  const visibleEntries = useMemo(() => timeframeEntries.filter(entry => (
    matchesDirection(entry, directionFilter)
    && matchesCategory(entry, categoryFilter)
    && matchesCounterparty(entry, counterpartyFilter)
  )), [categoryFilter, counterpartyFilter, directionFilter, timeframeEntries]);
  const visiblePeriods = useMemo(() => {
    const grouped = new Map<string, FlowEntry[]>();
    visibleEntries.forEach(entry => grouped.set(entry.month, [...(grouped.get(entry.month) || []), entry]));
    return Array.from(grouped.entries());
  }, [visibleEntries]);
  const visibleYears = useMemo(() => {
    const grouped = new Map<string, Array<[string, FlowEntry[]]>>();
    visiblePeriods.forEach(period => {
      const year = period[0].slice(0, 4);
      grouped.set(year, [...(grouped.get(year) || []), period]);
    });
    return Array.from(grouped.entries());
  }, [visiblePeriods]);
  const currentYear = String(new Date().getFullYear());
  const latestVisibleYear = visibleYears[0]?.[0];

  const totals = useMemo(() => summarizeFlowEntries(visibleEntries), [visibleEntries]);
  const latestVisibleMonth = visiblePeriods[0]?.[0];
  const counterpartyAllLabel = directionFilter === 'in' ? 'All From' : directionFilter === 'out' ? 'All To' : 'All From / To';
  const counterpartyAriaLabel = directionFilter === 'in' ? 'From' : directionFilter === 'out' ? 'To' : 'From or To';

  useEffect(() => {
    if (expansionInitializedRef.current || visibleYears.length === 0) return;
    expansionInitializedRef.current = true;
    setExpandedYears(new Set(
      visibleYears
        .map(([year]) => year)
        .filter(year => year === currentYear || year === latestVisibleYear)
    ));
    setExpandedMonths(new Set(latestVisibleMonth ? [latestVisibleMonth] : []));
  }, [currentYear, latestVisibleMonth, latestVisibleYear, visibleYears]);

  const toggleYearPeriods = (year: string, yearPeriods: Array<[string, FlowEntry[]]>) => {
    const allExpanded = yearPeriods.every(([month]) => expandedMonths.has(month));
    const expand = !allExpanded;
    setExpandedYears(previous => {
      const next = new Set(previous);
      if (expand) next.add(year);
      return next;
    });
    setExpandedMonths(previous => {
      const next = new Set(previous);
      yearPeriods.forEach(([month]) => {
        if (expand) next.add(month);
        else next.delete(month);
      });
      return next;
    });
  };

  const setYearExpanded = (year: string, expanded: boolean) => {
    setExpandedYears(previous => {
      if (previous.has(year) === expanded) return previous;
      const next = new Set(previous);
      if (expanded) next.add(year);
      else next.delete(year);
      return next;
    });
  };

  const setMonthExpanded = (month: string, expanded: boolean) => {
    setExpandedMonths(previous => {
      if (previous.has(month) === expanded) return previous;
      const next = new Set(previous);
      if (expanded) next.add(month);
      else next.delete(month);
      return next;
    });
  };

  const openNewEntry = () => {
    setError('');
    setPeriodEditor({ month: currentMonth(), appendBlank: true });
  };

  const openEditPeriod = (month: string) => {
    setError('');
    setPeriodEditor({ month });
  };

  const openCommentEditor = (entry: FlowEntry) => {
    setCommentError('');
    setCommentEditor({ entry, text: entry.comment });
  };

  const copyPeriod = (month: string) => {
    const seedEntries = entries
      .filter(entry => entry.month === month)
      .map(({ id: _id, month: _month, ...entry }) => ({ ...entry, taxRate: entry.taxRate || 0, comment: '' }));
    setError('');
    setPeriodEditor({ month: nextMonth(month), seedEntries });
  };

  const readCsvFile = async (file: File) => {
    setCsvImportError('');
    setCsvImportNotice('');
    setCsvImportDuplicates(false);
    try {
      const preview = parseFlowCsv(await file.text(), file.name, settings.currencies);
      setCsvPreview({
        ...preview,
        duplicates: findFlowCsvDuplicates(preview.entries, entries)
      });
    } catch (fileError) {
      setCsvPreview({
        fileName: file.name,
        entries: [],
        errors: [fileError instanceof Error ? fileError.message : 'Could not read the CSV file.'],
        duplicates: []
      });
    }
  };

  const importCsv = async () => {
    if (!csvPreview || csvPreview.errors.length > 0 || csvPreview.entries.length === 0 || csvImporting) return;
    setCsvImporting(true);
    setCsvImportError('');
    try {
      const response = await fetch(`${API_URL}/flows/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: csvPreview.entries, allowDuplicates: csvImportDuplicates })
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json() as { imported: number; skipped: number };
      setEntries(await fetchFlowEntries());
      setCsvPreview(null);
      setCsvImportNotice(`Imported ${result.imported} entr${result.imported === 1 ? 'y' : 'ies'}${result.skipped > 0 ? ` · skipped ${result.skipped} exact duplicate${result.skipped === 1 ? '' : 's'}` : ''}.`);
    } catch (importError) {
      setCsvImportError(importError instanceof Error ? importError.message : 'Could not import Cash Flow CSV.');
    } finally {
      setCsvImporting(false);
    }
  };

  const closeEditor = () => {
    if (saving) return;
    setPeriodEditor(null);
    setError('');
  };

  const saveComment = async () => {
    if (!commentEditor || commentSaving) return;
    if (commentEditor.text === commentEditor.entry.comment) {
      setCommentEditor(null);
      return;
    }

    setCommentSaving(true);
    setCommentError('');
    const { entry, text } = commentEditor;
    try {
      const response = await fetch(`${API_URL}/flows/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: entry.month,
          entryType: entry.entryType,
          direction: entry.direction,
          counterparty: entry.counterparty,
          account: entry.account,
          currency: entry.currency,
          amount: entry.amount,
          taxRate: entry.taxRate || 0,
          category: entry.category,
          comment: text,
          toAccount: entry.toAccount,
          toCurrency: entry.toCurrency,
          toAmount: entry.toAmount
        })
      });
      if (!response.ok) throw new Error(await readError(response));
      const saved = await response.json() as FlowEntry;
      setEntries(previous => previous.map(item => item.id === saved.id ? { ...saved, taxRate: saved.taxRate || 0 } : item));
      setCommentEditor(null);
    } catch (saveError) {
      setCommentError(saveError instanceof Error ? saveError.message : 'Could not save the comment.');
    } finally {
      setCommentSaving(false);
    }
  };

  const savePeriod = async (drafts: FlowPeriodDraft[]) => {
    if (!periodEditor) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/flows/months/${periodEditor.month}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: drafts.map(draft => ({
            id: draft.id,
            entryType: draft.entryType,
            direction: draft.direction,
            counterparty: draft.counterparty,
            account: draft.account,
            currency: draft.currency,
            amount: Number(draft.amount),
            taxRate: draft.entryType === 'external' && draft.direction === 'in' ? Number(draft.taxRate) : 0,
            category: draft.category,
            comment: draft.comment,
            toAccount: draft.toAccount,
            toCurrency: draft.toCurrency,
            toAmount: Number(draft.toAmount || 0)
          }))
        })
      });
      if (!response.ok) throw new Error(await readError(response));
      const saved = await response.json() as FlowEntry[];
      setEntries(previous => sortEntries([
        ...previous.filter(entry => entry.month !== periodEditor.month),
        ...saved
      ]));
      setPeriodEditor(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the Cash Flow period.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: FlowEntry) => {
    const description = entry.entryType === 'transfer'
      ? `transfer ${formatAmount(entry.amount, entry.currency)} from ${entry.account} to ${entry.toAccount}`
      : `${entry.direction === 'in' ? 'incoming' : 'outgoing'} ${formatAmount(entry.amount, entry.currency)} ${entry.direction === 'in' ? 'from' : 'to'} ${entry.counterparty}`;
    if (!window.confirm(`Delete ${description}?`)) return;
    setError('');
    try {
      const response = await fetch(`${API_URL}/flows/${entry.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response));
      setEntries(previous => previous.filter(item => item.id !== entry.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the Cash Flow entry.');
    }
  };

  if (settingsLoading || loading) return <PageLoader label="Loading Cash Flow" />;

  if (!settings.cashFlow?.enabled) {
    return (
      <div className="glass-panel" style={{ maxWidth: '680px', margin: '48px auto', textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Cash Flow is disabled</h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Enable the optional Cash Flow section in Settings to track external movements and neutral transfers between your own accounts.
        </p>
        <Link to="/settings" className="btn btn-primary">Open Settings</Link>
      </div>
    );
  }

  return (
    <div>
      {periodEditor && (
        <FlowPeriodModal
          key={`${periodEditor.month}-${periodEditor.focusEntryID || 'new'}`}
          month={periodEditor.month}
          entries={entries.filter(entry => entry.month === periodEditor.month)}
          seedEntries={periodEditor.seedEntries}
          categorySuggestions={allCategorySuggestions}
          settings={settings}
          appendBlank={periodEditor.appendBlank}
          focusEntryID={periodEditor.focusEntryID}
          saving={saving}
          error={error}
          onMonthChange={month => {
            setError('');
            setPeriodEditor({
              month,
              seedEntries: periodEditor.seedEntries,
              appendBlank: !periodEditor.seedEntries?.length
            });
          }}
          onClose={closeEditor}
          onSave={drafts => void savePeriod(drafts)}
        />
      )}
      {commentEditor && (
        <CommentModal
          title={`Comment · ${formatMonth(commentEditor.entry.month)}`}
          description="Enter saves · Shift+Enter adds a new line · Esc closes"
          text={commentEditor.text}
          onChange={text => setCommentEditor({ ...commentEditor, text })}
          onClose={() => {
            if (!commentSaving) setCommentEditor(null);
          }}
          onSave={() => void saveComment()}
          placeholder="Context for this movement"
          saveLabel="Save comment"
          saving={commentSaving}
          error={commentError}
        />
      )}
      {csvPreview && (
        <FlowCsvImportModal
          preview={csvPreview}
          importing={csvImporting}
          error={csvImportError}
          importDuplicates={csvImportDuplicates}
          onImportDuplicatesChange={setCsvImportDuplicates}
          onClose={() => {
            if (!csvImporting) {
              setCsvPreview(null);
              setCsvImportDuplicates(false);
            }
          }}
          onImport={() => void importCsv()}
        />
      )}

      <div className="flex justify-between items-center mb-4" style={{ gap: '16px', flexWrap: 'wrap' }}>
        <div className="flex items-center gap-4">
          <Link title="Back to dashboard" to="/" className="btn"><ArrowLeft size={18} /></Link>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Cash Flow</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>External money movements and neutral transfers between your own accounts.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={csvFileInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void readCsvFile(file);
            }}
          />
          <button className="btn" onClick={() => csvFileInputRef.current?.click()}><FileUp size={17} /> Import CSV</button>
          <button className="btn btn-primary" onClick={openNewEntry}><Plus size={18} /> Add movement</button>
        </div>
      </div>

      {error && !periodEditor && (
        <div className="glass-panel mb-4" style={{ padding: '12px 16px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.35)' }}>{error}</div>
      )}
      {csvImportNotice && (
        <div className="glass-panel mb-4" style={{ padding: '12px 16px', color: 'var(--success)', borderColor: 'rgba(34, 197, 94, 0.3)' }}>{csvImportNotice}</div>
      )}

      <div className="glass-panel mb-4" style={{ padding: '14px 18px' }}>
        <div className="flex justify-between items-center" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <TimeframeControl
              availableMonths={months}
              startMonth={startMonth}
              endMonth={effectiveEndMonth}
              onChange={(start, end) => {
                setStartMonth(start);
                setEndMonth(end);
              }}
            />
            <select className="input" aria-label="Movement type" value={directionFilter} onChange={event => setDirectionFilter(event.target.value as FlowMovementFilter)} style={{ width: 'auto', minWidth: '150px' }}>
              <option value="all">All movements</option>
              <option value="in" disabled={!timeframeDirections.has('in')}>Incoming</option>
              <option value="out" disabled={!timeframeDirections.has('out')}>Outgoing</option>
              <option value="transfer" disabled={!timeframeDirections.has('transfer')}>Transfers</option>
            </select>
            <select className="input" aria-label={counterpartyAriaLabel} value={counterpartyFilter} onChange={event => setCounterpartyFilter(event.target.value)} style={{ width: 'auto', minWidth: '170px' }}>
              <option value="all">{counterpartyAllLabel}</option>
              {counterparties.map(counterparty => <option key={counterparty} value={counterparty}>{counterparty}</option>)}
            </select>
            <select className="input" aria-label="Category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} style={{ width: 'auto', minWidth: '170px' }}>
              <option value="all">All categories</option>
              {hasUncategorizedEntries && <option value="none">No category</option>}
              {categories.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{visibleEntries.length} entr{visibleEntries.length === 1 ? 'y' : 'ies'}</span>
        </div>

        {totals.length > 0 && (
          <div className="cash-flow-overview-summary">
            <FlowNetSummary totals={totals} />
            <span>Hover a value for incoming, outgoing, and tax details.</span>
          </div>
        )}
      </div>

      {visibleEntries.length === 0 ? (
        <div className="glass-panel" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {entries.length === 0 ? 'No Cash Flow entries yet.' : 'No entries match the selected filters.'}
        </div>
      ) : (
        <div className="cash-flow-year-list">
          {visibleYears.map(([year, yearPeriods]) => {
            const yearEntries = yearPeriods.flatMap(([, periodEntries]) => periodEntries);
            const yearTotals = summarizeFlowEntries(yearEntries);
            const allYearPeriodsExpanded = yearPeriods.every(([month]) => expandedMonths.has(month));
            return (
              <details
                key={year}
                open={year === linkedMonth?.slice(0, 4) || expandedYears.has(year)}
                onToggle={event => setYearExpanded(year, year === linkedMonth?.slice(0, 4) || event.currentTarget.open)}
                className="glass-panel cash-flow-year-group"
              >
                <summary className="cash-flow-year-summary">
                  <div className="cash-flow-year-title">
                    <Calendar size={18} />
                    <strong>{year} Year</strong>
                    <span>{yearEntries.length} movement{yearEntries.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="cash-flow-year-summary-actions">
                    <FlowNetSummary totals={yearTotals} compact />
                    <button
                      className="btn cash-flow-year-toggle"
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleYearPeriods(year, yearPeriods);
                      }}
                      title={allYearPeriodsExpanded ? `Collapse all months in ${year}` : `Expand all months in ${year}`}
                    >
                      <ChevronsUpDown size={15} /> {allYearPeriodsExpanded ? 'Collapse all' : 'Expand all'}
                    </button>
                  </div>
                </summary>
                <div className="cash-flow-month-list">
                  {yearPeriods.map(([month, periodEntries]) => {
                    const periodTotals = summarizeFlowEntries(periodEntries);
                    const periodComments = periodEntries
                      .filter(entry => entry.comment.trim())
                      .map(entry => entry.entryType === 'transfer'
                        ? `${entry.account} → ${entry.toAccount}: ${entry.comment.trim()}`
                        : `${entry.direction === 'in' ? 'From' : 'To'} ${entry.counterparty}: ${entry.comment.trim()}`);
                    return (
                      <details
                        key={month}
                        open={month === linkedMonth || expandedMonths.has(month)}
                        onToggle={event => setMonthExpanded(month, month === linkedMonth || event.currentTarget.open)}
                        className="cash-flow-month-group"
                      >
                        <summary className="cash-flow-month-summary">
                          <div className="cash-flow-period-group-title">
                            <strong>{formatMonth(month)}</strong>
                            <span>{periodEntries.length} movement{periodEntries.length === 1 ? '' : 's'}</span>
                          </div>
                          <FlowNetSummary totals={periodTotals} compact />
                          <div className="cash-flow-period-group-actions">
                            {periodComments.length > 0 && (
                              <QuickHoverTooltip text={periodComments.join('\n')}>
                                <button
                                  type="button"
                                  className="btn cash-flow-collapsed-comments"
                                  onClick={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  aria-label={`View ${periodComments.length} movement comment${periodComments.length === 1 ? '' : 's'}`}
                                >
                                  <MessageSquare size={15} />
                                  {periodComments.length > 1 && periodComments.length}
                                </button>
                              </QuickHoverTooltip>
                            )}
                            <button
                              className="btn"
                              onClick={event => {
                                event.preventDefault();
                                event.stopPropagation();
                                copyPeriod(month);
                              }}
                              title={`Copy period to ${formatMonth(nextMonth(month))}`}
                            >
                              <Copy size={15} /> Copy
                            </button>
                            <button
                              className="btn"
                              onClick={event => {
                                event.preventDefault();
                                event.stopPropagation();
                                openEditPeriod(month);
                              }}
                              title={`Edit all movements for ${formatMonth(month)}`}
                            >
                              <Pencil size={15} /> Edit period
                            </button>
                          </div>
                        </summary>
                        <div className="cash-flow-year-body">
                          <table className="table cash-flow-period-table" style={{ minWidth: '850px' }}>
                            <thead>
                              <tr>
                                <th>Movement</th>
                                <th>From / To</th>
                                <th>Category</th>
                                <th>Comment</th>
                                <th className="text-right">Amount</th>
                                <th aria-label="Actions" />
                              </tr>
                            </thead>
                            <tbody>
                              {periodEntries.map(entry => {
                                const tax = calculateFlowTax(entry);
                                const netAmount = entry.direction === 'in' ? entry.amount - tax : -entry.amount;
                                const isTransfer = entry.entryType === 'transfer';
                                return (
                                  <tr key={entry.id}>
                                    <td>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: isTransfer ? '#60a5fa' : entry.direction === 'in' ? 'var(--success)' : 'var(--danger)', fontWeight: 600, fontSize: '13px' }}>
                                        {isTransfer ? <ArrowRightLeft size={15} /> : entry.direction === 'in' ? <ArrowDown size={15} /> : <ArrowUp size={15} />}
                                        {isTransfer ? 'Transfer' : entry.direction === 'in' ? 'Incoming' : 'Outgoing'}
                                      </span>
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{isTransfer ? `${entry.account} → ${entry.toAccount}` : entry.counterparty}</td>
                                    <td style={{ color: entry.category && !isTransfer ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{isTransfer ? '—' : entry.category || '—'}</td>
                                    <td style={{ width: '26%', maxWidth: '300px' }}>
                                      <QuickHoverTooltip text={entry.comment}>
                                        <button
                                          className={`cash-flow-table-comment${entry.comment ? ' has-comment' : ''}`}
                                          onClick={() => openCommentEditor(entry)}
                                          aria-label={entry.comment ? 'Edit movement comment' : 'Add movement comment'}
                                        >
                                          <MessageSquare size={15} />
                                          <span>{entry.comment || '—'}</span>
                                        </button>
                                      </QuickHoverTooltip>
                                    </td>
                                    <td className="text-right" style={{ whiteSpace: 'nowrap', color: isTransfer ? '#60a5fa' : entry.direction === 'in' ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                                      <div>{isTransfer ? `−${formatAmount(entry.amount, entry.currency)} → +${formatAmount(entry.toAmount, entry.toCurrency)}` : `${entry.direction === 'in' ? '+' : '−'}${formatAmount(Math.abs(netAmount), entry.currency)}`}</div>
                                      {isTransfer && formatTransferRate(entry) && <div className="cash-flow-entry-details">Rate: {formatTransferRate(entry)}</div>}
                                      {!isTransfer && entry.account && <div className="cash-flow-entry-details">Account: {entry.account}</div>}
                                      {!isTransfer && tax > 0 && (
                                        <div className="cash-flow-entry-details">
                                          Gross +{formatAmount(entry.amount, entry.currency)}
                                          <span> · Tax −{formatTaxAmount(tax, entry.currency)}</span>
                                        </div>
                                      )}
                                    </td>
                                    <td>
                                      <div className="flex justify-end gap-2">
                                        <button className="btn btn-danger" style={{ padding: '7px' }} onClick={() => void deleteEntry(entry)} title="Delete entry"><Trash2 size={15} /></button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
