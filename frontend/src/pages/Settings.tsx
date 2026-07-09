import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { API_URL } from '../types';
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
  const initialSettingsHash = useRef('');
  const currentSettingsHash = useMemo(() => JSON.stringify(settings), [settings]);
  const isDirty = !!initialSettingsHash.current && initialSettingsHash.current !== currentSettingsHash;

  useEffect(() => {
    if (!loading && !initialSettingsHash.current) {
      initialSettingsHash.current = currentSettingsHash;
    }
  }, [currentSettingsHash, loading]);

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
