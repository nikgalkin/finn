import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Save, Plus, RefreshCw, Server, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { API_URL } from '../types';
import type { LocalAISettings, LocalAIStatus } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';
import { ConfirmLeaveModal } from './components/ConfirmLeaveModal';

type SettingsListKey = 'organizations' | 'currencies' | 'tags';

const listGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' };
const listBodyStyle = { display: 'flex', flexDirection: 'column' as const, gap: '8px', maxHeight: '320px', overflowY: 'auto' as const, paddingRight: '4px' };
const compactButtonStyle = { padding: '6px 12px', fontSize: '13px' };
const iconButtonStyle = { padding: '8px' };
const inputRowStyle = { height: '36px' };
const autoFetchStyle = { background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0 10px', height: '36px', userSelect: 'none' as const };

export default function Settings() {
  const { settings, setSettings, loading } = useSettings();
  const navigate = useNavigate();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [aiStatus, setAIStatus] = useState<LocalAIStatus | null>(null);
  const [aiProbing, setAIProbing] = useState(false);
  const initialSettingsHash = useRef('');
  const initialAIProbeDone = useRef(false);
  const currentSettingsHash = useMemo(() => JSON.stringify(settings), [settings]);
  const isDirty = !!initialSettingsHash.current && initialSettingsHash.current !== currentSettingsHash;

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

  useEffect(() => {
    if (loading || initialAIProbeDone.current) return;
    initialAIProbeDone.current = true;
    void probeLocalAI(settings.localAI);
  }, [loading, settings.localAI]);

  useEscapeToDashboard({
    blocked: showLeaveConfirm,
    confirmWhen: isDirty,
    confirmMessage: 'Settings have unsaved changes. Leave without saving?',
    onConfirmRequired: () => setShowLeaveConfirm(true)
  });

  const handleSave = () => {
    fetch(`${API_URL}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(settings) })
    })
    .then(res => {
      if (res.ok) {
        initialSettingsHash.current = currentSettingsHash;
        alert('Settings saved!');
      }
      else alert('Failed to save');
    });
  };

  const updateList = (list: SettingsListKey, index: number, val: string) => {
    const newList = [...(settings[list] || [])];
    newList[index] = val;
    setSettings({ ...settings, [list]: newList });
  };

  const addToList = (list: SettingsListKey) => {
    setSettings({ ...settings, [list]: [...(settings[list] || []), ''] });
  };

  const removeFromList = (list: SettingsListKey, index: number) => {
    const newList = [...(settings[list] || [])];
    newList.splice(index, 1);
    setSettings({ ...settings, [list]: newList });
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
        enabled: true,
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
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div className="flex justify-between items-center mb-4">
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{title}</h3>
        <button className="btn" style={compactButtonStyle} onClick={() => addToList(list)}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div style={listBodyStyle}>
        {(settings[list] || []).map((item, i) => {
          const isCurrency = list === 'currencies';
          const isAuto = isCurrency && (settings.autoFetchCurrencies || []).includes(item);

          return (
            <div key={i} className={`flex gap-2${isCurrency ? ' items-center' : ''}`}>
              {isCurrency && (
                <label className="flex items-center gap-2 cursor-pointer" title="Auto pull rate" style={autoFetchStyle}>
                  <input type="checkbox" checked={isAuto} onChange={() => toggleAutoFetch(item)} style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent)', margin: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Auto rate</span>
                </label>
              )}
              <input className="input" value={item} placeholder={placeholder} onChange={event => updateList(list, i, event.target.value)} style={inputRowStyle} />
              <button className="btn btn-danger" style={iconButtonStyle} onClick={() => removeFromList(list, i)}>
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <Link title="Back to dashboard" to="/" className="btn"><ArrowLeft size={18} /></Link>
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Settings</h2>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={18} /> Save
        </button>
      </div>

      <div className="glass-panel mb-8" style={{ padding: '24px 32px' }}>
        <div className="flex justify-between items-center" style={{ gap: '20px', marginBottom: '20px' }}>
          <div>
            <div className="flex items-center gap-2">
              <Server size={18} color="var(--accent)" />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Local AI</h3>
            </div>
            <p style={{ margin: '7px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
              Connect Finn to an OpenAI-compatible model server running on this computer.
            </p>
          </div>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={settings.localAI?.enabled ?? true}
              onChange={event => updateLocalAI({ enabled: event.target.checked })}
              style={{ width: '17px', height: '17px', accentColor: 'var(--accent)' }}
            />
            Enabled
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 0.65fr) minmax(250px, 1.15fr) minmax(220px, 1fr) auto', gap: '14px', alignItems: 'end' }}>
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
            <RefreshCw size={15} className={aiProbing ? 'ai-spin' : ''} /> Test
          </button>
        </div>

        {settings.localAI?.enabled && (
          <div style={{ marginTop: '13px', fontSize: '12px', color: aiStatus?.connected ? 'var(--success)' : aiStatus ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {aiProbing
              ? 'Checking local server…'
              : aiStatus?.connected
                ? `Connected · ${aiStatus.selectedModel || 'model auto-selected'} · ${chatModels.length} chat model${chatModels.length === 1 ? '' : 's'} available`
                : aiStatus?.error || 'Save settings, start LM Studio Server, then test the connection.'}
          </div>
        )}
        <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '11px' }}>
          For privacy, Finn accepts loopback addresses only. The financial dataset is sent directly from the Go backend to the local server.
        </div>
      </div>

      <div className="glass-panel mb-8" style={{ padding: '24px 32px' }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600 }}>Currency Framework</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Base Currency</label>
            <select 
              className="input" 
              value={settings.baseCurrency || 'RUB'} 
              onChange={e => setSettings({ ...settings, baseCurrency: e.target.value })}
              style={{ width: '100%', height: '38px' }}
            >
              {settings.currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', marginTop: '2px' }}>
              The primary asset standard for your total net worth metrics.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Secondary Currency</label>
            <select 
              className="input" 
              value={settings.secondaryCurrency || 'USD'} 
              onChange={e => setSettings({ ...settings, secondaryCurrency: e.target.value })}
              style={{ width: '100%', height: '38px' }}
            >
              <option value="">— None —</option>
              {settings.currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', marginTop: '2px' }}>
              Displayed concurrently alongside base units inside grids and trends.
            </span>
          </div>
        </div>
      </div>

      <div style={listGridStyle}>
        {renderListSection('Organizations', 'organizations')}
        {renderListSection('Currencies', 'currencies')}
        {renderListSection('Balance Tags', 'tags', 'e.g. Safety Cushion, Crypto')}
      </div>

      {showLeaveConfirm && (
        <ConfirmLeaveModal
          message="Settings have unsaved changes. Leave without saving?"
          onCancel={() => setShowLeaveConfirm(false)}
          onConfirm={() => navigate('/')}
        />
      )}
    </div>
  );
}
