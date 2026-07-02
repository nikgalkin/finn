import { useEffect, useState } from 'react';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_URL } from '../types';
import type { AppSettings } from '../types';

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>({ organizations: [], currencies: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/settings`)
      .then(res => res.json())
      .then(data => {
        setSettings(JSON.parse(data.value));
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

  const updateList = (list: 'organizations' | 'currencies', index: number, val: string) => {
    const newList = [...settings[list]];
    newList[index] = val;
    setSettings({ ...settings, [list]: newList });
  };

  const addToList = (list: 'organizations' | 'currencies') => {
    setSettings({ ...settings, [list]: [...settings[list], ''] });
  };

  const removeFromList = (list: 'organizations' | 'currencies', index: number) => {
    const newList = [...settings[list]];
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
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="btn">
            <ArrowLeft size={18} />
          </Link>
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Settings</h2>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={18} /> Save
        </button>
      </div>

      <div className="glass-panel mb-8">
        <h3 style={{ margin: 0, marginBottom: 16 }}>Base Currency</h3>
        <p className="stat-label mb-4">Select the primary currency for your net worth calculations.</p>
        <select 
          className="input" 
          value={settings.baseCurrency || 'RUB'} 
          onChange={e => setSettings({ ...settings, baseCurrency: e.target.value })}
          style={{ maxWidth: 300 }}
        >
          {settings.currencies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="glass-panel">
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ margin: 0 }}>Organizations</h3>
            <button className="btn" onClick={() => addToList('organizations')}>
              <Plus size={16} /> Add
            </button>
          </div>
          {settings.organizations.map((org, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input className="input" value={org} onChange={e => updateList('organizations', i, e.target.value)} />
              <button className="btn btn-danger" onClick={() => removeFromList('organizations', i)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="glass-panel">
          <div className="flex justify-between items-center mb-4">
            <h3 style={{ margin: 0 }}>Currencies</h3>
            <button className="btn" onClick={() => addToList('currencies')}>
              <Plus size={16} /> Add
            </button>
          </div>
          {settings.currencies.map((curr, i) => {
            const isAuto = (settings.autoFetchCurrencies || []).includes(curr);
            return (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <label className="flex items-center gap-2 cursor-pointer" title="Auto pull rate">
                  <input 
                    type="checkbox" 
                    checked={isAuto} 
                    onChange={() => toggleAutoFetch(curr)} 
                    style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Auto pull</span>
                </label>
                <input className="input" value={curr} onChange={e => updateList('currencies', i, e.target.value)} />
                <button className="btn btn-danger" onClick={() => removeFromList('currencies', i)}>
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
