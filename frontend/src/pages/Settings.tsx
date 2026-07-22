import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive, ArrowDownUp, ArrowLeft, ArrowRight, Coins, Save, Plus, RefreshCw, RotateCcw, Server, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { API_URL, getCurrencyColor } from '../types';
import type { CashFlowSettings, LocalAISettings, LocalAIStatus, Snapshot } from '../types';
import { isValidCountryCode } from '../lib/countries';
import {
  UNSAVED_NAVIGATION_REQUEST_EVENT,
  type UnsavedNavigationRequestDetail
} from '../lib/unsavedNavigation';
import { SETTINGS_UPDATED_EVENT, useSettings } from '../hooks/useSettings';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { ConfirmLeaveModal } from './components/ConfirmLeaveModal';
import { ArchiveOrganizationModal } from './components/ArchiveOrganizationModal';
import { CountrySelect } from './components/CountrySelect';
import { HelpTooltip } from './components/HelpTooltip';
import { PageLoader, Spinner } from './components/PageLoader';
import { SettingsValidationModal } from './components/SettingsValidationModal';
import type { SettingsValidationIssue } from './components/SettingsValidationModal';
import { ScrollForMore } from './components/ScrollForMore';

type SettingsListKey = 'currencies' | 'tags';
type FlowSettingsListKey = 'sources' | 'categories';
type ScrollableSettingsListKey = SettingsListKey | FlowSettingsListKey | 'organizations';

type ArchiveImpact = {
  index: number;
  loading: boolean;
  error: string;
  snapshotCount: number;
  latestNonZeroBalances: string[];
};

type DuplicateValues = ReturnType<typeof findDuplicateValues>;

const listGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' };
const SETTINGS_ROW_HEIGHT = 36;
const SETTINGS_ROW_GAP = 6;
const SETTINGS_LIST_VISIBLE_ROWS = 5;
const ORGANIZATION_LIST_VISIBLE_ROWS = 6;
const settingsListHeight = (visibleRows: number) => visibleRows * SETTINGS_ROW_HEIGHT + (visibleRows - 1) * SETTINGS_ROW_GAP;
const listBodyStyle = { display: 'flex', flexDirection: 'column' as const, gap: `${SETTINGS_ROW_GAP}px`, maxHeight: `${settingsListHeight(SETTINGS_LIST_VISIBLE_ROWS)}px`, overflowY: 'auto' as const, paddingRight: '4px' };
const organizationListBodyStyle = { display: 'flex', flexDirection: 'column' as const, gap: `${SETTINGS_ROW_GAP}px`, maxHeight: `${settingsListHeight(ORGANIZATION_LIST_VISIBLE_ROWS)}px`, overflowY: 'auto' as const, paddingRight: '4px', scrollBehavior: 'smooth' as const };
const compactButtonStyle = { padding: '6px 12px', fontSize: '13px' };
const iconButtonStyle = { padding: '8px' };
const inputRowStyle = { height: '36px' };
const autoFetchStyle = { background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0 10px', height: '36px', userSelect: 'none' as const };
const enabledCheckboxStyle = { width: '17px', height: '17px', accentColor: 'var(--accent)' };
const DEFAULT_CASH_FLOW: CashFlowSettings = { enabled: false, sources: [], taxRates: {}, categories: [] };
const DEFAULT_LOCAL_AI: LocalAISettings = { enabled: false, provider: 'lmstudio', baseUrl: 'http://127.0.0.1:1234/v1', model: '' };
const normalizeListValue = (value: string) => value.trim().toLocaleLowerCase();
const normalizeCurrencyCode = (value: string) => value.trim().toUpperCase();
const sanitizeCurrencyCodeInput = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
const isValidCurrencyCode = (value: string) => /^[A-Z0-9]{2,10}$/.test(normalizeCurrencyCode(value));
const replaceAt = <T,>(values: T[], index: number, value: T) => values.map((item, itemIndex) => itemIndex === index ? value : item);
const removeAt = <T,>(values: T[], index: number) => values.filter((_, itemIndex) => itemIndex !== index);

const findDuplicateValues = (values: string[]) => {
  const entries = new Map<string, { count: number; display: string }>();
  values.forEach(value => {
    const normalized = normalizeListValue(value);
    if (!normalized) return;
    const current = entries.get(normalized);
    entries.set(normalized, {
      count: (current?.count || 0) + 1,
      display: current?.display || value.trim()
    });
  });
  const items = Array.from(entries.entries())
    .filter(([, entry]) => entry.count > 1)
    .map(([normalized, entry]) => ({ normalized, display: entry.display }));
  return { items, names: new Set(items.map(item => item.normalized)) };
};

const duplicateIssues = (duplicates: DuplicateValues, section: string, message: string): SettingsValidationIssue[] => (
  duplicates.items.map(item => ({ section, value: item.display, message }))
);

type SettingsPanelProps = {
  children: ReactNode; description: string; enabled: boolean; icon: ReactNode; intro: string; onEnabledChange: (enabled: boolean) => void; title: string;
};

const SettingsPanel = ({ children, description, enabled, icon, intro, onEnabledChange, title }: SettingsPanelProps) => (
  <details className="glass-panel" open={enabled} style={{ marginTop: '16px', padding: 0 }}>
    <summary style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px', cursor: 'pointer', color: 'var(--text-secondary)', userSelect: 'none' }}>
      {icon}
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{title}</span>
      <span style={{ fontSize: '12px' }}>{description}</span>
    </summary>
    <div className="cash-flow-settings-body">
      <div className="cash-flow-settings-status">
        <span>{intro}</span>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={event => onEnabledChange(event.target.checked)} style={enabledCheckboxStyle} />
          Enabled
        </label>
      </div>
      {children}
    </div>
  </details>
);

type CurrencyFieldProps = {
  allowNone?: boolean; currencies: string[]; description: string; label: string; onChange: (value: string) => void; role: 'base' | 'secondary'; value: string;
};

const CurrencyField = ({ allowNone, currencies, description, label, onChange, role, value }: CurrencyFieldProps) => (
  <div className={`currency-framework-field is-${role}`}>
    <div className="currency-framework-field-heading">
      <span>{role === 'base' ? '1' : '2'}</span>
      <div>
        <strong>{label}</strong>
        <small>{role === 'base' ? 'Portfolio standard' : 'Optional comparison'}</small>
      </div>
    </div>
    <div className="currency-framework-select">
      <i style={{ background: value ? getCurrencyColor(value) : 'var(--text-secondary)' }} />
      <select className="input" value={value} onChange={event => onChange(event.target.value)}>
        {allowNone && <option value="">— None —</option>}
        {currencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}
      </select>
    </div>
    <span className="currency-framework-field-description">{description}</span>
  </div>
);

export default function Settings() {
  const { settings, setSettings, loading } = useSettings();
  const navigate = useNavigate();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<SettingsValidationIssue[]>([]);
  const [validatedCurrencyIndexes, setValidatedCurrencyIndexes] = useState<Set<number>>(() => new Set());
  const [archiveImpact, setArchiveImpact] = useState<ArchiveImpact | null>(null);
  const [aiStatus, setAIStatus] = useState<LocalAIStatus | null>(null);
  const [aiProbing, setAIProbing] = useState(false);
  const initialSettingsHash = useRef('');
  const scrollBodyRefs = useRef<Record<ScrollableSettingsListKey, HTMLDivElement | null>>({
    currencies: null,
    tags: null,
    organizations: null,
    sources: null,
    categories: null
  });
  const pendingScroll = useRef<ScrollableSettingsListKey | null>(null);
  const currentSettingsHash = useMemo(() => JSON.stringify(settings), [settings]);
  const isDirty = !!initialSettingsHash.current && initialSettingsHash.current !== currentSettingsHash;
  const duplicateOrganizations = useMemo(() => findDuplicateValues(settings.organizations.map(organization => organization.name)), [settings.organizations]);
  const duplicateCurrencies = useMemo(() => findDuplicateValues(settings.currencies), [settings.currencies]);
  const duplicateTags = useMemo(() => findDuplicateValues(settings.tags || []), [settings.tags]);
  const duplicateFlowSources = useMemo(() => findDuplicateValues(settings.cashFlow?.sources || []), [settings.cashFlow?.sources]);
  const duplicateFlowCategories = useMemo(() => findDuplicateValues(settings.cashFlow?.categories || []), [settings.cashFlow?.categories]);
  const activeOrganizations = useMemo(() => (
    settings.organizations.map((organization, index) => ({ organization, index })).filter(({ organization }) => !organization.archivedAt)
  ), [settings.organizations]);
  const archivedOrganizations = useMemo(() => (
    settings.organizations.map((organization, index) => ({ organization, index })).filter(({ organization }) => !!organization.archivedAt)
  ), [settings.organizations]);

  useEffect(() => {
    if (!loading && !initialSettingsHash.current) {
      initialSettingsHash.current = currentSettingsHash;
    }
  }, [currentSettingsHash, loading]);

  useEffect(() => {
    const list = pendingScroll.current;
    if (!list) return;
    pendingScroll.current = null;

    const container = scrollBodyRefs.current[list];
    if (!container || container.scrollTop + container.clientHeight >= container.scrollHeight - 1) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [settings.cashFlow?.categories.length, settings.cashFlow?.sources.length, settings.currencies.length, settings.organizations.length, settings.tags?.length]);

  const probeLocalAI = async (localAI = settings.localAI) => {
    if (!localAI) return;
    setAIProbing(true);
    try {
      const response = await fetch(`${API_URL}/ai/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localAI)
      });
      const payload = await response.json() as LocalAIStatus & { error?: string };
      setAIStatus(payload);
    } catch (error) {
      setAIStatus({
        enabled: localAI.enabled,
        connected: false,
        baseUrl: localAI.baseUrl,
        selectedModel: localAI.model,
        models: [],
        snapshotCount: 0,
        contextBytes: 0,
        dataFingerprint: '',
        availableMonths: [],
        error: error instanceof Error ? error.message : 'Connection check failed'
      });
    } finally {
      setAIProbing(false);
    }
  };

  useEscapeToDashboard({
    blocked: showLeaveConfirm || validationIssues.length > 0 || archiveImpact !== null,
    confirmWhen: isDirty,
    confirmMessage: 'Settings have unsaved changes. Leave without saving?',
    onConfirmRequired: () => setShowLeaveConfirm(true)
  });

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleInternalLinkClick = (event: MouseEvent) => {
      if (!isDirty || showLeaveConfirm || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank') return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !url.hash.startsWith('#/')) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(url.hash.slice(1));
      setShowLeaveConfirm(true);
    };

    document.addEventListener('click', handleInternalLinkClick, true);
    return () => document.removeEventListener('click', handleInternalLinkClick, true);
  }, [isDirty, showLeaveConfirm]);

  useEffect(() => {
    const handleNavigationRequest = (event: Event) => {
      const route = (event as CustomEvent<UnsavedNavigationRequestDetail>).detail?.route;
      if (!route) return;
      setPendingNavigation(route);
      setShowLeaveConfirm(true);
    };

    window.addEventListener(UNSAVED_NAVIGATION_REQUEST_EVENT, handleNavigationRequest);
    return () => window.removeEventListener(UNSAVED_NAVIGATION_REQUEST_EVENT, handleNavigationRequest);
  }, []);

  const handleSave = () => {
    const issues: SettingsValidationIssue[] = [
      ...duplicateIssues(duplicateOrganizations, 'Organization', 'This organization is listed more than once.'),
      ...duplicateIssues(duplicateCurrencies, 'Currency', 'This currency is listed more than once.'),
      ...duplicateIssues(duplicateTags, 'Balance tag', 'This balance tag is listed more than once.'),
      ...duplicateIssues(duplicateFlowCategories, 'Cash Flow category', 'This Cash Flow category is listed more than once.'),
      ...duplicateIssues(duplicateFlowSources, 'Cash Flow source', 'This Cash Flow source is listed more than once.'),
      ...settings.currencies
        .filter(currency => !isValidCurrencyCode(currency))
        .map(currency => ({
          section: 'Currency',
          value: currency.trim() || 'empty',
          message: 'Use 2–10 Latin letters or digits. Fiat ISO codes usually contain 3 letters; crypto tickers may be longer.'
        })),
      ...settings.organizations
        .filter(organization => !isValidCountryCode(organization.country))
        .map(organization => ({
          section: 'Country',
          value: `${organization.name.trim() || 'Unnamed organization'} · ${organization.country?.trim() || 'empty'}`,
          message: 'Choose a valid ISO alpha-3 country code.'
        }))
    ];
    if (issues.length > 0) {
      setValidatedCurrencyIndexes(new Set(
        settings.currencies.flatMap((currency, index) => isValidCurrencyCode(currency) ? [] : [index])
      ));
      setValidationIssues(issues);
      return;
    }
    const normalizedCurrencies = settings.currencies.map(normalizeCurrencyCode);
    const baseCurrency = normalizeCurrencyCode(settings.baseCurrency || 'RUB');
    const secondaryCurrency = normalizeCurrencyCode(settings.secondaryCurrency || '');
    const normalizedSettings = {
      ...settings,
      currencies: normalizedCurrencies,
      baseCurrency,
      secondaryCurrency: secondaryCurrency === baseCurrency ? '' : secondaryCurrency,
      autoFetchCurrencies: Array.from(new Set(
        (settings.autoFetchCurrencies || [])
          .map(normalizeCurrencyCode)
          .filter(currency => currency && currency !== baseCurrency)
      )),
      organizations: settings.organizations.map(organization => ({
        ...organization,
        country: organization.country?.trim().toUpperCase() || undefined
      })),
      cashFlow: {
        enabled: settings.cashFlow?.enabled ?? false,
        sources: (settings.cashFlow?.sources || []).map(source => source.trim()).filter(Boolean),
        taxRates: Object.fromEntries((settings.cashFlow?.sources || []).flatMap(source => {
          const normalizedSource = source.trim();
          if (!normalizedSource) return [];
          const rate = Number(settings.cashFlow?.taxRates?.[source] ?? 0);
          return [[normalizedSource, Number.isFinite(rate) ? Math.max(0, Math.min(100, rate)) : 0]];
        })),
        categories: (settings.cashFlow?.categories || []).map(category => category.trim()).filter(Boolean)
      }
    };
    fetch(`${API_URL}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(normalizedSettings) })
    })
    .then(res => {
      if (res.ok) {
        setSettings(normalizedSettings);
        initialSettingsHash.current = JSON.stringify(normalizedSettings);
        window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: normalizedSettings }));
        alert('Settings saved!');
      }
      else alert('Failed to save');
    });
  };

  const updateList = (list: SettingsListKey, index: number, val: string) => {
    const values = settings[list] || [];
    const previousValue = values[index];
    const nextValue = list === 'currencies' ? sanitizeCurrencyCodeInput(val) : val;
    const newList = replaceAt(values, index, nextValue);
    if (list === 'currencies') {
      const autoFetchCurrencies = [...(settings.autoFetchCurrencies || [])];
      const autoFetchIndex = autoFetchCurrencies.indexOf(previousValue);
      if (autoFetchIndex >= 0) autoFetchCurrencies[autoFetchIndex] = nextValue;
      setSettings({
        ...settings,
        currencies: newList,
        baseCurrency: settings.baseCurrency === previousValue ? nextValue : settings.baseCurrency,
        secondaryCurrency: settings.secondaryCurrency === previousValue ? nextValue : settings.secondaryCurrency,
        autoFetchCurrencies
      });
      return;
    }
    setSettings({ ...settings, [list]: newList });
  };

  const addToList = (list: SettingsListKey) => {
    pendingScroll.current = list;
    if (list === 'currencies') {
      setSettings({
        ...settings,
        currencies: [...settings.currencies, ''],
        autoFetchCurrencies: [...(settings.autoFetchCurrencies || []), '']
      });
      return;
    }
    setSettings({ ...settings, [list]: [...(settings[list] || []), ''] });
  };

  const removeFromList = (list: SettingsListKey, index: number) => {
    const values = settings[list] || [];
    const removedValue = values[index];
    const newList = removeAt(values, index);
    if (list === 'currencies') {
      setValidatedCurrencyIndexes(new Set());
      const autoFetchCurrencies = [...(settings.autoFetchCurrencies || [])];
      const autoFetchIndex = autoFetchCurrencies.indexOf(removedValue);
      if (autoFetchIndex >= 0) autoFetchCurrencies.splice(autoFetchIndex, 1);
      setSettings({ ...settings, currencies: newList, autoFetchCurrencies });
      return;
    }
    setSettings({ ...settings, [list]: newList });
  };

  const updateOrganization = (index: number, field: 'name' | 'country', value: string) => {
    setSettings({ ...settings, organizations: replaceAt(settings.organizations, index, { ...settings.organizations[index], [field]: value }) });
  };

  const addOrganization = () => {
    pendingScroll.current = 'organizations';
    setSettings({ ...settings, organizations: [...settings.organizations, { name: '' }] });
  };

  const requestArchiveOrganization = (index: number) => {
    const organization = settings.organizations[index];
    setArchiveImpact({ index, loading: true, error: '', snapshotCount: 0, latestNonZeroBalances: [] });

    fetch(`${API_URL}/snapshots`)
      .then(response => {
        if (!response.ok) throw new Error('Could not check the latest snapshot. Nothing was archived.');
        return response.json() as Promise<Snapshot[]>;
      })
      .then(snapshots => {
        const normalizedName = normalizeListValue(organization.name);
        const parsed = (snapshots || []).map(snapshot => ({ ...snapshot, parsedData: JSON.parse(snapshot.data) }));
        const snapshotCount = parsed.filter(snapshot => (
          snapshot.parsedData.organizations?.some((item: { name?: string }) => normalizeListValue(item.name || '') === normalizedName)
        )).length;
        const latestSnapshot = parsed.reduce((latest, snapshot) => !latest || snapshot.month > latest.month ? snapshot : latest, parsed[0]);
        const latestOrganization = latestSnapshot?.parsedData.organizations?.find((item: { name?: string }) => (
          normalizeListValue(item.name || '') === normalizedName
        ));
        const latestNonZeroBalances = (latestOrganization?.balances || [])
          .filter((balance: { amount?: number | string }) => Number(balance.amount || 0) !== 0)
          .map((balance: { amount?: number | string; currency?: string }) => `${balance.currency || ''} ${Number(balance.amount).toLocaleString('en-US')}`.trim());
        setArchiveImpact({ index, loading: false, error: '', snapshotCount, latestNonZeroBalances });
      })
      .catch(error => setArchiveImpact({
        index,
        loading: false,
        error: error instanceof Error ? error.message : 'Could not check organization history. Nothing was archived.',
        snapshotCount: 0,
        latestNonZeroBalances: []
      }));
  };

  const archiveOrganization = () => {
    if (!archiveImpact) return;
    const organization = { ...settings.organizations[archiveImpact.index], archivedAt: new Date().toISOString() };
    setSettings({ ...settings, organizations: replaceAt(settings.organizations, archiveImpact.index, organization) });
    setArchiveImpact(null);
  };

  const restoreOrganization = (index: number) => {
    const { archivedAt: _archivedAt, ...organization } = settings.organizations[index];
    setSettings({ ...settings, organizations: replaceAt(settings.organizations, index, organization) });
  };

  const toggleAutoFetch = (curr: string) => {
    if (curr === (settings.baseCurrency || 'RUB')) return;
    const autoFetch = settings.autoFetchCurrencies || [];
    const autoFetchCurrencies = autoFetch.includes(curr) ? autoFetch.filter(currency => currency !== curr) : [...autoFetch, curr];
    setSettings({ ...settings, autoFetchCurrencies });
  };

  const updateBaseCurrency = (baseCurrency: string) => {
    const previousBaseCurrency = settings.baseCurrency || 'RUB';
    const autoFetchCurrencies = (settings.autoFetchCurrencies || [])
      .filter(currency => currency !== baseCurrency);
    if (previousBaseCurrency !== baseCurrency && !autoFetchCurrencies.includes(previousBaseCurrency)) {
      autoFetchCurrencies.push(previousBaseCurrency);
    }
    setSettings({
      ...settings,
      baseCurrency,
      secondaryCurrency: settings.secondaryCurrency === baseCurrency
        ? previousBaseCurrency
        : settings.secondaryCurrency,
      autoFetchCurrencies
    });
  };

  const updateLocalAI = (patch: Partial<LocalAISettings>) => {
    setSettings({ ...settings, localAI: { ...DEFAULT_LOCAL_AI, ...settings.localAI, ...patch } });
  };

  const updateCashFlow = (patch: Partial<NonNullable<typeof settings.cashFlow>>) => {
    setSettings({ ...settings, cashFlow: { ...DEFAULT_CASH_FLOW, ...settings.cashFlow, ...patch } });
  };

  const updateFlowCategory = (index: number, value: string) => {
    updateCashFlow({ categories: replaceAt(settings.cashFlow?.categories || [], index, value) });
  };

  const updateFlowSource = (index: number, value: string) => {
    const currentSources = settings.cashFlow?.sources || [];
    const sources = replaceAt(currentSources, index, value);
    const previousValue = currentSources[index];
    const taxRates = { ...(settings.cashFlow?.taxRates || {}) };
    if (previousValue !== value && Object.hasOwn(taxRates, previousValue)) {
      taxRates[value] = taxRates[previousValue];
      delete taxRates[previousValue];
    }
    updateCashFlow({ sources, taxRates });
  };

  const updateFlowSourceTaxRate = (source: string, value: string) => {
    const parsed = Number(value);
    updateCashFlow({
      taxRates: {
        ...(settings.cashFlow?.taxRates || {}),
        [source]: Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0
      }
    });
  };

  const addFlowValue = (list: FlowSettingsListKey) => {
    pendingScroll.current = list;
    updateCashFlow({ [list]: [...(settings.cashFlow?.[list] || []), ''] });
  };

  const removeFlowCategory = (index: number) => {
    updateCashFlow({ categories: removeAt(settings.cashFlow?.categories || [], index) });
  };

  const removeFlowSource = (index: number) => {
    const currentSources = settings.cashFlow?.sources || [];
    const removedSource = currentSources[index];
    const taxRates = { ...(settings.cashFlow?.taxRates || {}) };
    delete taxRates[removedSource];
    updateCashFlow({ sources: removeAt(currentSources, index), taxRates });
  };

  const chatModels = useMemo(() => (aiStatus?.models || []).filter(model => {
    const value = `${model.id} ${model.type || ''}`.toLowerCase();
    return !value.includes('embed') && !value.includes('rerank') && !value.includes('whisper');
  }), [aiStatus?.models]);

  const renderListSection = (title: string, list: SettingsListKey, placeholder?: string) => (
    <div className="glass-panel" style={{ padding: '18px 20px' }}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{title}</h3>
          {list === 'currencies' && (
            <HelpTooltip
              text="Fiat currencies usually use 3-letter ISO codes. Crypto tickers such as USDT may be longer; Finn accepts 2–10 Latin letters or digits and stores them in uppercase."
              ariaLabel="Currency code format"
              width={310}
            />
          )}
        </div>
        <button className="btn" style={compactButtonStyle} onClick={() => addToList(list)} aria-label={`Add ${title.toLowerCase()}`}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div id={`settings-${list}-scroll`} ref={element => { scrollBodyRefs.current[list] = element; }} style={listBodyStyle}>
        {(settings[list] || []).map((item, i) => {
          const isCurrency = list === 'currencies';
          const isBaseCurrency = isCurrency && item === (settings.baseCurrency || 'RUB');
          const isAuto = isCurrency && !isBaseCurrency && (settings.autoFetchCurrencies || []).includes(item);
          const duplicateNames = isCurrency ? duplicateCurrencies.names : duplicateTags.names;
          const isDuplicate = duplicateNames.has(normalizeListValue(item));
          const isInvalidCurrency = isCurrency && !isValidCurrencyCode(item);
          const showInvalidCurrency = isInvalidCurrency && validatedCurrencyIndexes.has(i);

          return (
            <div key={i} className={`flex gap-2${isCurrency ? ' items-center' : ''}`}>
              {isCurrency && (
                <label className={`flex items-center gap-2${isBaseCurrency ? '' : ' cursor-pointer'}`} title={isBaseCurrency ? 'Base currency rate is always 1' : 'Auto pull rate'} style={{ ...autoFetchStyle, opacity: isBaseCurrency ? 0.55 : 1 }}>
                  <input type="checkbox" checked={isAuto} disabled={isBaseCurrency} onChange={() => toggleAutoFetch(item)} style={{ cursor: isBaseCurrency ? 'not-allowed' : 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent)', margin: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Auto rate</span>
                </label>
              )}
              <input
                className="input"
                aria-label={`${title} item ${i + 1}`}
                value={item}
                placeholder={placeholder}
                onChange={event => {
                  if (isCurrency) {
                    setValidatedCurrencyIndexes(previous => {
                      const next = new Set(previous);
                      next.delete(i);
                      return next;
                    });
                  }
                  updateList(list, i, event.target.value);
                }}
                onBlur={() => {
                  if (!isCurrency) return;
                  setValidatedCurrencyIndexes(previous => new Set(previous).add(i));
                }}
                maxLength={isCurrency ? 10 : undefined}
                autoCapitalize={isCurrency ? 'characters' : undefined}
                spellCheck={isCurrency ? false : undefined}
                aria-invalid={isDuplicate || showInvalidCurrency}
                title={isDuplicate
                  ? `Duplicate ${isCurrency ? 'currency' : 'balance tag'}`
                  : showInvalidCurrency
                    ? 'Use 2–10 Latin letters or digits'
                    : undefined}
                style={{ ...inputRowStyle, borderColor: isDuplicate || showInvalidCurrency ? 'var(--danger)' : undefined }}
              />
              {(isDuplicate || showInvalidCurrency) && (
                <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: 600 }}>{isDuplicate ? 'Duplicate' : 'Invalid code'}</span>
              )}
              <button className="btn btn-danger" style={iconButtonStyle} onClick={() => removeFromList(list, i)}>
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
      <ScrollForMore scrollContainerId={`settings-${list}-scroll`} total={(settings[list] || []).length} visible={SETTINGS_LIST_VISIBLE_ROWS} />
    </div>
  );

  const renderOrganizationsSection = () => (
    <div className="glass-panel" style={{ padding: '18px 20px' }}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Organizations</h3>
          <HelpTooltip text="Country is optional. Finn stores it as an ISO 3166-1 alpha-3 code, for example DEU or USA." ariaLabel="Organization country explanation" width={280} />
        </div>
        <button className="btn" style={compactButtonStyle} onClick={addOrganization} aria-label="Add organization">
          <Plus size={14} /> Add
        </button>
      </div>
      <div id="settings-organizations-scroll" ref={element => { scrollBodyRefs.current.organizations = element; }} style={organizationListBodyStyle}>
        {activeOrganizations.map(({ organization, index }) => {
          const isDuplicate = duplicateOrganizations.names.has(normalizeListValue(organization.name));
          return (
            <div key={index} className="flex gap-2 items-center">
              <input
                className="input"
                value={organization.name}
                placeholder="Organization name"
                onChange={event => updateOrganization(index, 'name', event.target.value)}
                aria-invalid={isDuplicate}
                title={isDuplicate ? 'Duplicate organization name' : undefined}
                style={{ ...inputRowStyle, flex: 1, borderColor: isDuplicate ? 'var(--danger)' : undefined }}
              />
              {isDuplicate && (
                <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: 600 }}>Duplicate</span>
              )}
              <CountrySelect id={`organization-country-${index}`} value={organization.country} onChange={value => updateOrganization(index, 'country', value)} />
              <button className="btn" style={{ ...iconButtonStyle, color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.3)' }} onClick={() => requestArchiveOrganization(index)} title={`Archive ${organization.name || 'organization'}`}>
                <Archive size={16} />
              </button>
            </div>
          );
        })}
        {activeOrganizations.length === 0 && (
          <div style={{ padding: '10px 0', color: 'var(--text-secondary)', fontSize: '12px' }}>No active organizations.</div>
        )}
      </div>
      <ScrollForMore scrollContainerId="settings-organizations-scroll" total={activeOrganizations.length} visible={ORGANIZATION_LIST_VISIBLE_ROWS} />
      {archivedOrganizations.length > 0 && (
        <details style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--glass-border)' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, userSelect: 'none' }}>
            Archived organizations ({archivedOrganizations.length})
          </summary>
          <div id="settings-archived-organizations-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px', maxHeight: `${settingsListHeight(SETTINGS_LIST_VISIBLE_ROWS)}px`, overflowY: 'auto', paddingRight: '4px' }}>
            {archivedOrganizations.map(({ organization, index }) => (
              <div key={index} className="flex items-center gap-2" style={{ minHeight: '36px', padding: '5px 8px 5px 12px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.38)', border: '1px solid var(--glass-border)' }}>
                <span style={{ flex: 1, fontSize: '13px' }}>{organization.name}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em' }}>{organization.country || '—'}</span>
                <button className="btn" style={compactButtonStyle} onClick={() => restoreOrganization(index)} title={`Restore ${organization.name}`}>
                  <RotateCcw size={14} /> Restore
                </button>
              </div>
            ))}
          </div>
          <ScrollForMore scrollContainerId="settings-archived-organizations-scroll" total={archivedOrganizations.length} visible={SETTINGS_LIST_VISIBLE_ROWS} />
        </details>
      )}
    </div>
  );

  if (loading) return <PageLoader label="Loading settings" />;

  return (
    <div className="settings-page" data-unsaved-changes={isDirty ? 'true' : undefined}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <Link title="Back to dashboard" to="/" className="btn"><ArrowLeft size={18} /></Link>
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Settings</h2>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={18} /> Save
        </button>
      </div>
      <div className="glass-panel currency-framework-panel mb-4">
        <div className="currency-framework-header">
          <div className="currency-framework-icon"><Coins size={20} /></div>
          <div>
            <h3>Currency Framework</h3>
            <p>Choose the standard used for portfolio valuation and an optional comparison currency.</p>
          </div>
          <span className="currency-framework-count">{settings.currencies.length} tracked</span>
        </div>

        <div className="currency-framework-flow">
          <CurrencyField
            label="Base Currency" value={settings.baseCurrency || 'RUB'} currencies={settings.currencies}
            onChange={updateBaseCurrency}
            description="All balances, earnings, and allocation values are normalized here."
            role="base"
          />
          <div className="currency-framework-connector" aria-hidden="true">
            <ArrowRight size={17} />
            <span>compare</span>
          </div>
          <CurrencyField
            label="Secondary Currency"
            value={settings.secondaryCurrency === (settings.baseCurrency || 'RUB') ? '' : (settings.secondaryCurrency ?? 'USD')}
            currencies={settings.currencies.filter(currency => currency !== (settings.baseCurrency || 'RUB'))}
            onChange={secondaryCurrency => setSettings({ ...settings, secondaryCurrency })}
            description="Shown alongside the base currency where a second perspective is useful."
            role="secondary" allowNone
          />
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        {renderOrganizationsSection()}
      </div>

      <div style={listGridStyle}>
        {renderListSection('Currencies', 'currencies')}
        {renderListSection('Balance Tags', 'tags', 'e.g. Safety Cushion, Crypto')}
      </div>

      <SettingsPanel
        title="Cash Flow" description="External incoming and outgoing money movements"
        intro="Reusable suggestions for the period editor." icon={<ArrowDownUp size={17} />}
        enabled={settings.cashFlow?.enabled ?? false}
        onEnabledChange={enabled => updateCashFlow({ enabled })}
      >
          <div className="cash-flow-settings-grid" style={{ opacity: settings.cashFlow?.enabled ? 1 : 0.55 }}>
            <section className="cash-flow-settings-section">
              <div className="cash-flow-settings-section-header">
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>Sources & recipients</div>
                  <div className="cash-flow-settings-section-description">From/To suggestions with an optional default tax.</div>
                </div>
                <button className="btn" style={compactButtonStyle} onClick={() => addFlowValue('sources')} disabled={!settings.cashFlow?.enabled}>
                  <Plus size={14} /> Add
                </button>
              </div>
              <div className="cash-flow-source-setting-labels" aria-hidden="true">
                <span>Name</span>
                <span>Default tax</span>
              </div>
              <div id="settings-sources-scroll" ref={element => { scrollBodyRefs.current.sources = element; }} className="cash-flow-settings-list" style={{ maxHeight: `${settingsListHeight(SETTINGS_LIST_VISIBLE_ROWS)}px` }}>
                {(settings.cashFlow?.sources || []).map((source, index) => {
                  const isDuplicate = duplicateFlowSources.names.has(normalizeListValue(source));
                  return (
                    <div key={index} className="cash-flow-source-setting-row">
                      <input
                        className="input" value={source} disabled={!settings.cashFlow?.enabled}
                        onChange={event => updateFlowSource(index, event.target.value)}
                        placeholder="e.g. Employer or landlord"
                        style={isDuplicate ? { borderColor: 'var(--danger)' } : undefined}
                      />
                      <div className="cash-flow-tax-rate-setting">
                        <input
                          className="input" type="number" min="0" max="100" step="0.01"
                          aria-label={`${source || `Source ${index + 1}`} default tax rate`}
                          value={settings.cashFlow?.taxRates?.[source] ?? 0}
                          onChange={event => updateFlowSourceTaxRate(source, event.target.value)}
                          disabled={!settings.cashFlow?.enabled}
                        />
                        <span>%</span>
                      </div>
                      <button className="btn btn-danger" style={iconButtonStyle} onClick={() => removeFlowSource(index)} disabled={!settings.cashFlow?.enabled} title="Remove source">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
                {(settings.cashFlow?.sources || []).length === 0 && (
                  <div className="cash-flow-settings-empty">No sources configured yet.</div>
                )}
              </div>
              <ScrollForMore scrollContainerId="settings-sources-scroll" total={(settings.cashFlow?.sources || []).length} visible={SETTINGS_LIST_VISIBLE_ROWS} />
            </section>

            <section className="cash-flow-settings-section">
              <div className="cash-flow-settings-section-header">
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>Categories</div>
                  <div className="cash-flow-settings-section-description">Labels used to group incoming and outgoing movements.</div>
                </div>
                <button className="btn" style={compactButtonStyle} onClick={() => addFlowValue('categories')} disabled={!settings.cashFlow?.enabled}>
                  <Plus size={14} /> Add
                </button>
              </div>
              <div className="cash-flow-category-setting-labels" aria-hidden="true">
                <span>Name</span>
              </div>
              <div id="settings-categories-scroll" ref={element => { scrollBodyRefs.current.categories = element; }} className="cash-flow-settings-list" style={{ maxHeight: `${settingsListHeight(SETTINGS_LIST_VISIBLE_ROWS)}px` }}>
                {(settings.cashFlow?.categories || []).map((category, index) => {
                  const isDuplicate = duplicateFlowCategories.names.has(normalizeListValue(category));
                  return (
                    <div key={index} className="cash-flow-simple-setting-row">
                      <input
                        className="input" value={category} disabled={!settings.cashFlow?.enabled}
                        onChange={event => updateFlowCategory(index, event.target.value)}
                        placeholder="e.g. Debt repayment"
                        style={isDuplicate ? { borderColor: 'var(--danger)' } : undefined}
                      />
                      <button className="btn btn-danger" style={iconButtonStyle} onClick={() => removeFlowCategory(index)} disabled={!settings.cashFlow?.enabled} title="Remove category">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
                {(settings.cashFlow?.categories || []).length === 0 && (
                  <div className="cash-flow-settings-empty">No categories configured yet.</div>
                )}
              </div>
              <ScrollForMore scrollContainerId="settings-categories-scroll" total={(settings.cashFlow?.categories || []).length} visible={SETTINGS_LIST_VISIBLE_ROWS} />
            </section>
          </div>
      </SettingsPanel>

      <SettingsPanel
        title="Local AI" description="Connection settings and model selection"
        intro="Connect Finn to an OpenAI-compatible model server running on this computer."
        icon={<Server size={17} />} enabled={settings.localAI?.enabled ?? false}
        onEnabledChange={enabled => updateLocalAI({ enabled })}
      >
          <div className="local-ai-settings-content" style={{ opacity: settings.localAI?.enabled ? 1 : 0.55 }}>
            <div className="local-ai-settings-grid">
              <div className="cash-flow-field">
                <label>Provider</label>
                <select
                  className="input" value={settings.localAI?.provider || 'lmstudio'} disabled={!settings.localAI?.enabled}
                  onChange={event => updateLocalAI({ provider: event.target.value as LocalAISettings['provider'] })}
                >
                  <option value="lmstudio">LM Studio</option>
                  <option value="openai-compatible">OpenAI compatible</option>
                </select>
              </div>
              <div className="cash-flow-field">
                <label>Server URL</label>
                <input
                  className="input" value={settings.localAI?.baseUrl || 'http://127.0.0.1:1234/v1'} disabled={!settings.localAI?.enabled}
                  onChange={event => updateLocalAI({ baseUrl: event.target.value })}
                  placeholder="http://127.0.0.1:1234/v1"
                />
              </div>
              <div className="cash-flow-field">
                <label>Chat model</label>
                <select
                  className="input" value={settings.localAI?.model || ''} disabled={!settings.localAI?.enabled}
                  onChange={event => updateLocalAI({ model: event.target.value })}
                >
                  <option value="">Auto-select first chat model</option>
                  {chatModels.map(model => <option key={model.id} value={model.id}>{model.id}</option>)}
                  {!!settings.localAI?.model && !chatModels.some(model => model.id === settings.localAI?.model) && (
                    <option value={settings.localAI.model}>{settings.localAI.model}</option>
                  )}
                </select>
              </div>
              <button
                className="btn" onClick={() => void probeLocalAI()}
                disabled={aiProbing || !settings.localAI?.enabled}
              >
                {aiProbing ? <Spinner label="Checking local AI server" size={15} /> : <RefreshCw size={15} />} Test
              </button>
            </div>

            {settings.localAI?.enabled && (
              <div className="local-ai-settings-status" style={{ color: aiStatus?.connected ? 'var(--success)' : aiStatus ? 'var(--danger)' : 'var(--text-secondary)' }}>
                {aiProbing
                  ? <Spinner label="Checking local AI server" size={14} />
                  : aiStatus?.connected
                    ? `Connected · ${aiStatus.selectedModel || 'model auto-selected'} · ${chatModels.length} chat model${chatModels.length === 1 ? '' : 's'} available`
                    : aiStatus?.error || 'Save settings, start LM Studio Server, then test the connection.'}
              </div>
            )}
            <div className="local-ai-settings-privacy">
              For privacy, Finn accepts loopback addresses only. The financial dataset is sent directly from the Go backend to the local server.
            </div>
          </div>
      </SettingsPanel>

      {showLeaveConfirm && (
        <ConfirmLeaveModal
          message="Settings have unsaved changes. Leave without saving?"
          onCancel={() => { setShowLeaveConfirm(false); setPendingNavigation(null); }}
          onConfirm={() => navigate(pendingNavigation || '/')}
        />
      )}
      {validationIssues.length > 0 && (
        <SettingsValidationModal issues={validationIssues} onClose={() => setValidationIssues([])} />
      )}
      {archiveImpact && (
        <ArchiveOrganizationModal
          name={settings.organizations[archiveImpact.index]?.name || ''} country={settings.organizations[archiveImpact.index]?.country}
          loading={archiveImpact.loading} error={archiveImpact.error} snapshotCount={archiveImpact.snapshotCount}
          latestNonZeroBalances={archiveImpact.latestNonZeroBalances}
          onCancel={() => setArchiveImpact(null)} onConfirm={archiveOrganization}
        />
      )}
    </div>
  );
}
