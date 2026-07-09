import { useEffect, useState } from 'react';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_URL } from '../types';
import type { AppSettings } from '../types';

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>({ organizations: [], currencies: [], tags: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/settings`)
      .then(res => res.json())
      .then(data => {
        const parsed = JSON.parse(data.value);
        // Защита на случай, если в базе еще нет массива tags
        if (!parsed.tags) parsed.tags = [];
        setSettings(parsed);
        setLoading(false);
      });
  }, []);

  const handleSave = () => {
    fetch(`${API_URL}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(settings) })
    })
    .then(res => {
      if (res.ok) alert('Settings saved!');
      else alert('Failed to save');
    });
  };

  const updateList = (list: 'organizations' | 'currencies' | 'tags', index: number, val: string) => {
    const newList = [...(settings[list] || [])];
    newList[index] = val;
    setSettings({ ...settings, [list]: newList });
  };

  const addToList = (list: 'organizations' | 'currencies' | 'tags') => {
    setSettings({ ...settings, [list]: [...(settings[list] || []), ''] });
  };

  const removeFromList = (list: 'organizations' | 'currencies' | 'tags', index: number) => {
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

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {/* Top Header Controls */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="btn">
            <ArrowLeft size={18} />Dashboard
          </Link>
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Settings</h2>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={18} /> Save
        </button>
      </div>

      {/* Currency Configurations Framework Card */}
      <div className="glass-panel mb-8" style={{ padding: '24px 32px' }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600 }}>Currency Framework</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
          {/* Base Currency Configuration */}
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

          {/* Secondary Currency Configuration */}
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

      {/* Lists Segment: Organizations, Currencies & Tags */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
        {/* Managed Financial Organizations Block */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Organizations</h3>
            <button className="btn" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => addToList('organizations')}>
              <Plus size={14} /> Add
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
            {(settings.organizations || []).map((org, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" value={org} onChange={e => updateList('organizations', i, e.target.value)} style={{ height: '36px' }} />
                <button className="btn btn-danger" style={{ padding: '8px' }} onClick={() => removeFromList('organizations', i)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Currency Tokens Registry & Tracking Node */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Currencies</h3>
            <button className="btn" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => addToList('currencies')}>
              <Plus size={14} /> Add
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
            {(settings.currencies || []).map((curr, i) => {
              const isAuto = (settings.autoFetchCurrencies || []).includes(curr);
              return (
                <div key={i} className="flex gap-2 items-center">
                  <label className="flex items-center gap-2 cursor-pointer" title="Auto pull rate" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0 10px', height: '36px', userSelect: 'none' }}>
                    <input 
                      type="checkbox" 
                      checked={isAuto} 
                      onChange={() => toggleAutoFetch(curr)} 
                      style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent)', margin: 0 }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Auto rate</span>
                  </label>
                  <input className="input" value={curr} onChange={e => updateList('currencies', i, e.target.value)} style={{ height: '36px' }} />
                  <button className="btn btn-danger" style={{ padding: '8px' }} onClick={() => removeFromList('currencies', i)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Balance Tags Node */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Balance Tags</h3>
            <button className="btn" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => addToList('tags')}>
              <Plus size={14} /> Add
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
            {(settings.tags || []).map((tag, i) => (
              <div key={i} className="flex gap-2">
                <input 
                  className="input" 
                  value={tag} 
                  placeholder="e.g. Safety Cushion, Crypto"
                  onChange={e => updateList('tags', i, e.target.value)} 
                  style={{ height: '36px' }} 
                />
                <button className="btn btn-danger" style={{ padding: '8px' }} onClick={() => removeFromList('tags', i)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
