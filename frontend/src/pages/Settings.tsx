import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowLeft, Save, Plus, RefreshCw, RotateCcw, Server, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { API_URL } from '../types';
import type { LocalAISettings, LocalAIStatus, Snapshot } from '../types';
import { isValidCountryCode } from '../lib/countries';
import { useSettings } from '../hooks/useSettings';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { ConfirmLeaveModal } from './components/ConfirmLeaveModal';
import { ArchiveOrganizationModal } from './components/ArchiveOrganizationModal';
import { CountrySelect } from './components/CountrySelect';
import { HelpTooltip } from './components/HelpTooltip';
import { PageLoader, Spinner } from './components/PageLoader';
import { SettingsValidationModal } from './components/SettingsValidationModal';
import type { SettingsValidationIssue } from './components/SettingsValidationModal';

type SettingsListKey = 'currencies' | 'tags';

type ArchiveImpact = {
  index: number;
  loading: boolean;
  error: string;
  snapshotCount: number;
  latestNonZeroBalances: string[];
};

const listGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' };
const listBodyStyle = { display: 'flex', flexDirection: 'column' as const, gap: '6px', maxHeight: '260px', overflowY: 'auto' as const, paddingRight: '4px' };
const organizationListBodyStyle = { display: 'flex', flexDirection: 'column' as const, gap: '6px' };
const compactButtonStyle = { padding: '6px 12px', fontSize: '13px' };
const iconButtonStyle = { padding: '8px' };
const inputRowStyle = { height: '36px' };
const autoFetchStyle = { background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0 10px', height: '36px', userSelect: 'none' as const };
const normalizeListValue = (value: string) => value.trim().toLocaleLowerCase();

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
  return Array.from(entries.entries())
    .filter(([, entry]) => entry.count > 1)
    .map(([normalized, entry]) => ({ normalized, display: entry.display }));
};

export default function Settings() {
  const { settings, setSettings, loading } = useSettings();
  const navigate = useNavigate();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [validationIssues, setValidationIssues] = useState<SettingsValidationIssue[]>([]);
  const [archiveImpact, setArchiveImpact] = useState<ArchiveImpact | null>(null);
  const [aiStatus, setAIStatus] = useState<LocalAIStatus | null>(null);
  const [aiProbing, setAIProbing] = useState(false);
  const initialSettingsHash = useRef('');
  const currentSettingsHash = useMemo(() => JSON.stringify(settings), [settings]);
  const isDirty = !!initialSettingsHash.current && initialSettingsHash.current !== currentSettingsHash;
  const duplicateOrganizations = useMemo(() => (
    findDuplicateValues(settings.organizations.map(organization => organization.name))
  ), [settings.organizations]);
  const duplicateCurrencies = useMemo(() => findDuplicateValues(settings.currencies), [settings.currencies]);
  const duplicateTags = useMemo(() => findDuplicateValues(settings.tags || []), [settings.tags]);
  const duplicateOrganizationNames = useMemo(() => (
    new Set(duplicateOrganizations.map(item => item.normalized))
  ), [duplicateOrganizations]);
  const duplicateCurrencyNames = useMemo(() => (
    new Set(duplicateCurrencies.map(item => item.normalized))
  ), [duplicateCurrencies]);
  const duplicateTagNames = useMemo(() => (
    new Set(duplicateTags.map(item => item.normalized))
  ), [duplicateTags]);
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

  const handleSave = () => {
    const issues: SettingsValidationIssue[] = [
      ...duplicateOrganizations.map(item => ({
        section: 'Organization',
        value: item.display,
        message: 'This organization is listed more than once.'
      })),
      ...duplicateCurrencies.map(item => ({
        section: 'Currency',
        value: item.display,
        message: 'This currency is listed more than once.'
      })),
      ...duplicateTags.map(item => ({
        section: 'Balance tag',
        value: item.display,
        message: 'This balance tag is listed more than once.'
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
      setValidationIssues(issues);
      return;
    }
    const normalizedSettings = {
      ...settings,
      organizations: settings.organizations.map(organization => ({
        ...organization,
        country: organization.country?.trim().toUpperCase() || undefined
      }))
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
        alert('Settings saved!');
      }
      else alert('Failed to save');
    });
  };

  const updateList = (list: SettingsListKey, index: number, val: string) => {
    const newList = [...(settings[list] || [])];
    const previousValue = newList[index];
    newList[index] = val;
    if (list === 'currencies') {
      const autoFetchCurrencies = [...(settings.autoFetchCurrencies || [])];
      const autoFetchIndex = autoFetchCurrencies.indexOf(previousValue);
      if (autoFetchIndex >= 0) autoFetchCurrencies[autoFetchIndex] = val;
      setSettings({ ...settings, currencies: newList, autoFetchCurrencies });
      return;
    }
    setSettings({ ...settings, [list]: newList });
  };

  const addToList = (list: SettingsListKey) => {
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
    const newList = [...(settings[list] || [])];
    const removedValue = newList[index];
    newList.splice(index, 1);
    if (list === 'currencies') {
      const autoFetchCurrencies = [...(settings.autoFetchCurrencies || [])];
      const autoFetchIndex = autoFetchCurrencies.indexOf(removedValue);
      if (autoFetchIndex >= 0) autoFetchCurrencies.splice(autoFetchIndex, 1);
      setSettings({ ...settings, currencies: newList, autoFetchCurrencies });
      return;
    }
    setSettings({ ...settings, [list]: newList });
  };

  const updateOrganization = (index: number, field: 'name' | 'country', value: string) => {
    const organizations = [...settings.organizations];
    organizations[index] = { ...organizations[index], [field]: value };
    setSettings({ ...settings, organizations });
  };

  const addOrganization = () => {
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
        const matchingSnapshots = parsed.filter(snapshot => (
          snapshot.parsedData.organizations?.some((item: { name?: string }) => normalizeListValue(item.name || '') === normalizedName)
        ));
        const latestSnapshot = [...parsed].sort((a, b) => b.month.localeCompare(a.month))[0];
        const latestOrganization = latestSnapshot?.parsedData.organizations?.find((item: { name?: string }) => (
          normalizeListValue(item.name || '') === normalizedName
        ));
        const latestNonZeroBalances = (latestOrganization?.balances || [])
          .filter((balance: { amount?: number | string }) => Number(balance.amount || 0) !== 0)
          .map((balance: { amount?: number | string; currency?: string }) => `${balance.currency || ''} ${Number(balance.amount).toLocaleString('en-US')}`.trim());
        setArchiveImpact({ index, loading: false, error: '', snapshotCount: matchingSnapshots.length, latestNonZeroBalances });
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
    const organizations = [...settings.organizations];
    organizations[archiveImpact.index] = { ...organizations[archiveImpact.index], archivedAt: new Date().toISOString() };
    setSettings({ ...settings, organizations });
    setArchiveImpact(null);
  };

  const restoreOrganization = (index: number) => {
    const organizations = [...settings.organizations];
    const { archivedAt: _archivedAt, ...organization } = organizations[index];
    organizations[index] = organization;
    setSettings({ ...settings, organizations });
  };

  const toggleAutoFetch = (curr: string) => {
    const autoFetch = settings.autoFetchCurrencies || [];
    if (autoFetch.includes(curr)) {
      setSettings({ ...settings, autoFetchCurrencies: autoFetch.filter(c => c !== curr) });
    } else {
      setSettings({ ...settings, autoFetchCurrencies: [...autoFetch, curr] });
    }
  };

  const updateLocalAI = (patch: Partial<LocalAISettings>) => {
    setSettings({
      ...settings,
      localAI: {
        enabled: false,
        provider: 'lmstudio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        model: '',
        ...(settings.localAI || {}),
        ...patch
      }
    });
  };

  const chatModels = (aiStatus?.models || []).filter(model => {
    const value = `${model.id} ${model.type || ''}`.toLowerCase();
    return !value.includes('embed') && !value.includes('rerank') && !value.includes('whisper');
  });

  const renderListSection = (title: string, list: SettingsListKey, placeholder?: string) => (
    <div className="glass-panel" style={{ padding: '18px 20px' }}>
      <div className="flex justify-between items-center mb-2">
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{title}</h3>
        <button className="btn" style={compactButtonStyle} onClick={() => addToList(list)} aria-label={`Add ${title.toLowerCase()}`}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div style={listBodyStyle}>
        {(settings[list] || []).map((item, i) => {
          const isCurrency = list === 'currencies';
          const isAuto = isCurrency && (settings.autoFetchCurrencies || []).includes(item);
          const duplicateNames = isCurrency ? duplicateCurrencyNames : duplicateTagNames;
          const isDuplicate = duplicateNames.has(normalizeListValue(item));

          return (
            <div key={i} className={`flex gap-2${isCurrency ? ' items-center' : ''}`}>
              {isCurrency && (
                <label className="flex items-center gap-2 cursor-pointer" title="Auto pull rate" style={autoFetchStyle}>
                  <input type="checkbox" checked={isAuto} onChange={() => toggleAutoFetch(item)} style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent)', margin: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Auto rate</span>
                </label>
              )}
              <input
                className="input"
                value={item}
                placeholder={placeholder}
                onChange={event => updateList(list, i, event.target.value)}
                aria-invalid={isDuplicate}
                title={isDuplicate ? `Duplicate ${isCurrency ? 'currency' : 'balance tag'}` : undefined}
                style={{ ...inputRowStyle, borderColor: isDuplicate ? 'var(--danger)' : undefined }}
              />
              {isDuplicate && (
                <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: 600 }}>Duplicate</span>
              )}
              <button className="btn btn-danger" style={iconButtonStyle} onClick={() => removeFromList(list, i)}>
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderOrganizationsSection = () => (
    <div className="glass-panel" style={{ padding: '18px 20px' }}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Organizations</h3>
          <HelpTooltip
            text="Country is optional. Finn stores it as an ISO 3166-1 alpha-3 code, for example DEU or USA."
            ariaLabel="Organization country explanation"
            width={280}
          />
        </div>
        <button className="btn" style={compactButtonStyle} onClick={addOrganization} aria-label="Add organization">
          <Plus size={14} /> Add
        </button>
      </div>
      <div style={organizationListBodyStyle}>
        {activeOrganizations.map(({ organization, index }) => {
          const isDuplicate = duplicateOrganizationNames.has(normalizeListValue(organization.name));
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
              <CountrySelect
                id={`organization-country-${index}`}
                value={organization.country}
                onChange={value => updateOrganization(index, 'country', value)}
              />
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
      {archivedOrganizations.length > 0 && (
        <details style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--glass-border)' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, userSelect: 'none' }}>
            Archived organizations ({archivedOrganizations.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
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
        </details>
      )}
    </div>
  );

  if (loading) return <PageLoader label="Loading settings" />;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <Link title="Back to dashboard" to="/" className="btn"><ArrowLeft size={18} /></Link>
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Settings</h2>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={18} /> Save
        </button>
      </div>
      <div className="glass-panel mb-4" style={{ padding: '18px 24px' }}>
        <h3 style={{ margin: '0 0 14px 0', fontSize: '18px', fontWeight: 600 }}>Currency Framework</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Base Currency</label>
            <select
              className="input"
              value={settings.baseCurrency || 'RUB'}
              onChange={e => setSettings({ ...settings, baseCurrency: e.target.value })}
              style={{ width: '100%', height: '36px' }}
            >
              {settings.currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
              The primary asset standard for your total net worth metrics.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Secondary Currency</label>
            <select
              className="input"
              value={settings.secondaryCurrency || 'USD'}
              onChange={e => setSettings({ ...settings, secondaryCurrency: e.target.value })}
              style={{ width: '100%', height: '36px' }}
            >
              <option value="">— None —</option>
              {settings.currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
              Displayed concurrently alongside base units inside grids and trends.
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        {renderOrganizationsSection()}
      </div>

      <div style={listGridStyle}>
        {renderListSection('Currencies', 'currencies')}
        {renderListSection('Balance Tags', 'tags', 'e.g. Safety Cushion, Crypto')}
      </div>

      <details className="glass-panel" style={{ marginTop: '16px', padding: 0 }}>
        <summary style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px', cursor: 'pointer', color: 'var(--text-secondary)', userSelect: 'none' }}>
          <Server size={17} />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Local AI (optional)</span>
          <span style={{ fontSize: '12px' }}>Connection settings and model selection</span>
        </summary>
        <div style={{ padding: '2px 20px 20px' }}>
        <div className="flex justify-between items-center" style={{ gap: '16px', marginBottom: '14px' }}>
          <div>
            <div className="flex items-center gap-2">
              <Server size={18} color="var(--accent)" />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Local AI</h3>
            </div>
            <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
              Connect Finn to an OpenAI-compatible model server running on this computer.
            </p>
          </div>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={settings.localAI?.enabled ?? false}
              onChange={event => updateLocalAI({ enabled: event.target.checked })}
              style={{ width: '17px', height: '17px', accentColor: 'var(--accent)' }}
            />
            Enabled
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 0.65fr) minmax(250px, 1.15fr) minmax(220px, 1fr) auto', gap: '10px', alignItems: 'end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>Provider</label>
            <select
              className="input"
              value={settings.localAI?.provider || 'lmstudio'}
              onChange={event => updateLocalAI({ provider: event.target.value as LocalAISettings['provider'] })}
              disabled={!settings.localAI?.enabled}
            >
              <option value="lmstudio">LM Studio</option>
              <option value="openai-compatible">OpenAI compatible</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>Server URL</label>
            <input
              className="input"
              value={settings.localAI?.baseUrl || 'http://127.0.0.1:1234/v1'}
              onChange={event => updateLocalAI({ baseUrl: event.target.value })}
              disabled={!settings.localAI?.enabled}
              placeholder="http://127.0.0.1:1234/v1"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500 }}>Chat model</label>
            <select
              className="input"
              value={settings.localAI?.model || ''}
              onChange={event => updateLocalAI({ model: event.target.value })}
              disabled={!settings.localAI?.enabled}
            >
              <option value="">Auto-select first chat model</option>
              {chatModels.map(model => <option key={model.id} value={model.id}>{model.id}</option>)}
              {!!settings.localAI?.model && !chatModels.some(model => model.id === settings.localAI?.model) && (
                <option value={settings.localAI.model}>{settings.localAI.model}</option>
              )}
            </select>
          </div>
          <button
            className="btn"
            onClick={() => void probeLocalAI()}
            disabled={aiProbing || !settings.localAI?.enabled}
            style={{ minHeight: '36px' }}
          >
            {aiProbing ? <Spinner label="Checking local AI server" size={15} /> : <RefreshCw size={15} />} Test
          </button>
        </div>

        {settings.localAI?.enabled && (
          <div style={{ marginTop: '13px', fontSize: '12px', color: aiStatus?.connected ? 'var(--success)' : aiStatus ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {aiProbing
              ? <Spinner label="Checking local AI server" size={14} />
              : aiStatus?.connected
                ? `Connected · ${aiStatus.selectedModel || 'model auto-selected'} · ${chatModels.length} chat model${chatModels.length === 1 ? '' : 's'} available`
                : aiStatus?.error || 'Save settings, start LM Studio Server, then test the connection.'}
          </div>
        )}
        <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '11px' }}>
          For privacy, Finn accepts loopback addresses only. The financial dataset is sent directly from the Go backend to the local server.
        </div>
        </div>
      </details>

      {showLeaveConfirm && (
        <ConfirmLeaveModal
          message="Settings have unsaved changes. Leave without saving?"
          onCancel={() => setShowLeaveConfirm(false)}
          onConfirm={() => navigate('/')}
        />
      )}
      {validationIssues.length > 0 && (
        <SettingsValidationModal
          issues={validationIssues}
          onClose={() => setValidationIssues([])}
        />
      )}
      {archiveImpact && (
        <ArchiveOrganizationModal
          name={settings.organizations[archiveImpact.index]?.name || ''}
          country={settings.organizations[archiveImpact.index]?.country}
          loading={archiveImpact.loading}
          error={archiveImpact.error}
          snapshotCount={archiveImpact.snapshotCount}
          latestNonZeroBalances={archiveImpact.latestNonZeroBalances}
          onCancel={() => setArchiveImpact(null)}
          onConfirm={archiveOrganization}
        />
      )}
    </div>
  );
}
