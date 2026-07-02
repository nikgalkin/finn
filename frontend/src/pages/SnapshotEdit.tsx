import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Save, ArrowLeft, Plus, Trash2, RefreshCw, Copy, List } from 'lucide-react';
import { API_URL } from '../types';
import type { SnapshotData, Balance, Snapshot, AppSettings } from '../types';

// Safe math evaluation
const evaluateMath = (expr: string | number): number => {
  if (typeof expr === 'number') return expr;
  try {
    // Keep only digits and basic math operators (commas from formatting will be stripped here!)
    const sanitized = expr.replace(/[^-()\d/*+.]/g, '');
    if (!sanitized) return 0;

    // Safe eval alternative for simple expressions
    const result = new Function(`return ${sanitized}`)();
    return Number.isFinite(result) ? result : 0;
  } catch (e) {
    return 0; // Return 0 on parsing error
  }
};

export default function SnapshotEdit() {
  const { month, sourceMonth } = useParams<{ month?: string; sourceMonth?: string }>();
  const navigate = useNavigate();
  const isNew = !month && !sourceMonth;
  const isCopy = !!sourceMonth;

  const [currentMonth, setCurrentMonth] = useState('');
  const [originalMonth, setOriginalMonth] = useState('');
  const [data, setData] = useState<SnapshotData>({
    rates: { USD: 90, EUR: 100 },
    organizations: []
  });
  const [latestSnapshot, setLatestSnapshot] = useState<SnapshotData | null>(null);
  const [settings, setSettings] = useState<AppSettings>({ organizations: [], currencies: [] });
  const [loading, setLoading] = useState(true);
  const [fetchingRates, setFetchingRates] = useState(false);

  useEffect(() => {
    // Fetch settings first
    fetch(`${API_URL}/settings`)
      .then(res => res.json())
      .then(resData => {
        setSettings(JSON.parse(resData.value));
      });

    if (isNew || isCopy) {
      const now = new Date();
      setCurrentMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      setOriginalMonth('');

      const copyFrom = sourceMonth || null;
      if (copyFrom) {
        fetch(`${API_URL}/snapshots/${copyFrom}`)
          .then(res => res.json())
          .then((s: any) => {
            if (s.data) {
              setData(JSON.parse(s.data));
            }
            setLoading(false);
          })
          .catch(e => {
            console.error(e);
            setLoading(false);
          });
      } else {
        fetch(`${API_URL}/snapshots`)
          .then(res => res.json())
          .then((snaps: Snapshot[]) => {
            if (snaps && snaps.length > 0) {
              setLatestSnapshot(JSON.parse(snaps[0].data));
            }
            setLoading(false);
          })
          .catch(e => {
            console.error(e);
            setLoading(false);
          });
      }
    } else {
      setCurrentMonth(month || '');
      setOriginalMonth(month || '');
      fetch(`${API_URL}/snapshots/${month}`)
        .then(res => res.json())
        .then((s: any) => {
          if (s.data) {
            setData(JSON.parse(s.data));
          }
          setLoading(false);
        })
        .catch(e => {
          console.error(e);
          setLoading(false);
        });
    }
  }, [month, sourceMonth, isNew, isCopy]);

  // Ensure all currencies from settings appear in the rates list
  useEffect(() => {
    if (settings.currencies.length > 0) {
      setData(prev => {
        let changed = false;
        const newRates = { ...prev.rates };
        const base = settings.baseCurrency || 'RUB';
        settings.currencies.forEach(c => {
          if (newRates[c] === undefined) {
            newRates[c] = c === base ? 1 : 0;
            changed = true;
          }
        });
        if (changed) {
          return { ...prev, rates: newRates };
        }
        return prev;
      });
    }
  }, [settings.currencies, settings.baseCurrency]);

  const handleSave = () => {
    const usedCurrencies = new Set<string>();

    // 1. Collect all currencies that have a non-zero balance
    data.organizations.forEach(org => {
      org.balances.forEach(b => {
        if (Number(b.amount) !== 0 && b.currency) {
          usedCurrencies.add(b.currency);
        }
      });
    });

    const baseCur = settings.baseCurrency || 'RUB';
    const missingRates: string[] = [];

    // 2. Check if they have a valid rate
    usedCurrencies.forEach(curr => {
      if (curr !== baseCur) {
        const rate = Number(data.rates[curr]);
        if (isNaN(rate) || rate <= 0) {
          missingRates.push(curr);
        }
      }
    });

    // 3. Block saving if rates are missing
    if (missingRates.length > 0) {
      alert(`⚠️ Save Error!\n\nYou have balances in ${missingRates.join(', ')}, but their exchange rates are missing.\n\nPlease enter a rate > 0 to calculate totals correctly.`);
      return;
    }

    const isEditing = !isNew && !isCopy;

    if (!isEditing) {
      const doSave = () => {
        fetch(`${API_URL}/snapshots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: currentMonth, data: JSON.stringify(data) })
        })
          .then(res => {
            if (res.ok) navigate('/');
            else if (res.status === 409) {
              alert(`A snapshot for "${currentMonth}" already exists. Change the month or use Edit instead.`);
            } else {
              alert('Failed to save');
            }
          });
      };

      fetch(`${API_URL}/snapshots/${currentMonth}`)
        .then(res => {
          if (res.ok) {
            const typed = window.prompt(
              `A snapshot for "${currentMonth}" already exists.\n\nTo overwrite it, type the month name (${currentMonth}):`
            );
            if (typed === currentMonth) doSave();
            else if (typed !== null) alert('Month name did not match. Overwrite cancelled.');
          } else {
            doSave();
          }
        })
        .catch(() => doSave());
      return;
    }

    if (currentMonth !== originalMonth) {
      fetch(`${API_URL}/snapshots/${originalMonth}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentMonth, data: JSON.stringify(data) })
      })
        .then(res => {
          if (res.status === 409) {
            alert(`A snapshot for "${currentMonth}" already exists. Please choose a different month.`);
          } else if (res.ok) {
            navigate('/');
          } else {
            alert('Failed to save');
          }
        });
    } else {
      fetch(`${API_URL}/snapshots/${originalMonth}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentMonth, data: JSON.stringify(data) })
      })
        .then(res => {
          if (res.ok) navigate('/');
          else alert('Failed to save');
        });
    }
  };

  const fetchRates = () => {
    setFetchingRates(true);
    const base = settings.baseCurrency || 'RUB';
    fetch(`https://open.er-api.com/v6/latest/${base}`)
      .then(res => res.json())
      .then(resData => {
        if (resData && resData.rates) {
          const newRates = { ...data.rates };
          const autoFetchList = settings.autoFetchCurrencies || [];

          Object.keys(newRates).forEach(curr => {
            if (autoFetchList.includes(curr)) {
              if (curr === base) {
                newRates[curr] = 1;
              } else if (resData.rates[curr]) {
                newRates[curr] = parseFloat((1 / resData.rates[curr]).toFixed(6));
              } else if (curr === 'USDT' && resData.rates['USD']) {
                newRates[curr] = parseFloat((1 / resData.rates['USD']).toFixed(6));
              }
            }
          });
          setData({ ...data, rates: newRates });
        }
        setFetchingRates(false);
      })
      .catch(e => {
        console.error(e);
        alert('Failed to fetch rates');
        setFetchingRates(false);
      });
  };

  const copyFromPrevious = () => {
    if (latestSnapshot) {
      setData({ ...data, organizations: latestSnapshot.organizations });
    }
  };

  const fillFromSettings = () => {
    setData({
      ...data,
      organizations: settings.organizations.map(name => ({
        id: uuidv4(),
        name,
        balances: [{ currency: settings.baseCurrency || 'RUB', amount: 0 }]
      }))
    });
  };

  const addOrganization = () => {
    setData({
      ...data,
      organizations: [
        ...data.organizations,
        { id: uuidv4(), name: '', balances: [] }
      ]
    });
  };

  const updateOrganization = (id: string, name: string) => {
    setData({
      ...data,
      organizations: data.organizations.map(o => o.id === id ? { ...o, name } : o)
    });
  };

  const removeOrganization = (id: string) => {
    if (confirm('Remove this organization?')) {
      setData({
        ...data,
        organizations: data.organizations.filter(o => o.id !== id)
      });
    }
  };

  const addBalance = (orgId: string) => {
    setData({
      ...data,
      organizations: data.organizations.map(o => {
        if (o.id === orgId) {
          return {
            ...o,
            balances: [...o.balances, { currency: settings.baseCurrency || 'RUB', amount: 0 }]
          };
        }
        return o;
      })
    });
  };

  const updateBalance = (orgId: string, index: number, field: keyof Balance, value: string | number) => {
    setData({
      ...data,
      organizations: data.organizations.map(o => {
        if (o.id === orgId) {
          const newBalances = [...o.balances];
          newBalances[index] = { ...newBalances[index], [field]: value };
          return { ...o, balances: newBalances };
        }
        return o;
      })
    });
  };

  // --- SAFE ROW REMOVAL ---
  const removeBalance = (orgId: string, index: number) => {
    const org = data.organizations.find(o => o.id === orgId);
    if (!org) return;
    
    const balance = org.balances[index];
    
    // Check if the balance is non-zero and not empty
    if (balance && balance.amount !== 0 && balance.amount !== '') {
      if (!confirm('This balance is not empty. Are you sure you want to delete it?')) {
        return;
      }
    }

    setData({
      ...data,
      organizations: data.organizations.map(o => {
        if (o.id === orgId) {
          const newBalances = [...o.balances];
          newBalances.splice(index, 1);
          return { ...o, balances: newBalances };
        }
        return o;
      })
    });
  };

  const updateRate = (currency: string, value: string | number) => {
    setData({
      ...data,
      rates: { ...data.rates, [currency]: value }
    });
  };

  const addRate = () => {
    const curr = prompt('Currency code (e.g. USDT):');
    if (curr) {
      setData({
        ...data,
        rates: { ...data.rates, [curr.toUpperCase()]: 1 }
      });
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
          <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>
            {isNew ? 'New Snapshot' : isCopy ? `New Snapshot (copy of ${sourceMonth})` : `Edit Snapshot ${month}`}
          </h2>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={18} /> Save
        </button>
      </div>

      <div className="glass-panel mb-8">
        <div className="flex gap-4 items-center mb-4">
          <div style={{ flex: 1 }}>
            <label className="stat-label">Month (YYYY-MM)</label>
            <input
              className="input mt-2"
              value={currentMonth}
              onChange={e => setCurrentMonth(e.target.value)}
              placeholder="YYYY-MM"
            />
          </div>
        </div>

        <div className="flex justify-between items-end mb-4 mt-8">
          <h3 style={{ margin: 0 }}>Exchange Rates (to {settings.baseCurrency || 'RUB'})</h3>
          <button className="btn" onClick={fetchRates} disabled={fetchingRates}>
            <RefreshCw size={16} className={fetchingRates ? 'animate-spin' : ''} />
            {fetchingRates ? 'Fetching...' : 'Fetch Rates'}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-4">
          {Object.entries(data.rates).map(([curr, rate]) => (
            <div key={curr}>
              <label className="stat-label">{curr}</label>
              <input
                type="number"
                className="input mt-2"
                value={rate === 0 ? '' : rate}
                placeholder="0"
                onChange={e => {
                  const val = e.target.value;
                  updateRate(curr, val === '' ? 0 : (val.endsWith('.') ? val : parseFloat(val)));
                }}
              />
            </div>
          ))}
          <div className="flex items-end">
            <button className="btn" onClick={addRate}>
              <Plus size={16} /> Add Rate
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h3>Organizations & Accounts</h3>
          {isNew && data.organizations.length === 0 && (
            <div className="flex gap-2 ml-4">
              {latestSnapshot && (
                <button className="btn" onClick={copyFromPrevious}>
                  <Copy size={14} /> Copy from previous
                </button>
              )}
              <button className="btn" onClick={fillFromSettings}>
                <List size={14} /> Fill from Settings
              </button>
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={addOrganization}>
          <Plus size={18} /> Add Organization
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {data.organizations.map((org) => (
          <div key={org.id} className="glass-panel">
            <div className="flex items-center mb-6 relative">
              <div className="flex-1 flex justify-center">
                <select
                  className="input"
                  value={org.name}
                  onChange={e => updateOrganization(org.id, e.target.value)}
                  style={{ fontSize: 20, fontWeight: 'bold', width: 'auto', minWidth: '150px', textAlign: 'center' }}
                >
                  <option value="" disabled>Select Organization</option>
                  {settings.organizations.map(o => <option key={o} value={o}>{o}</option>)}
                  {!settings.organizations.includes(org.name) && org.name && (
                    <option value={org.name}>{org.name}</option>
                  )}
                </select>
              </div>
              <button className="btn btn-danger absolute right-0" onClick={() => removeOrganization(org.id)}>
                <Trash2 size={16} />
              </button>
            </div>

            <table className="table mb-4">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {org.balances.map((b, i) => (
                  <tr key={i}>
                    <td style={{ paddingLeft: 0, paddingRight: 8 }}>
                      <select
                        className="input"
                        value={b.currency}
                        onChange={e => updateBalance(org.id, i, 'currency', e.target.value)}
                      >
                        <option value="" disabled>Select Currency</option>
                        {settings.currencies.map(c => <option key={c} value={c}>{c}</option>)}
                        {!settings.currencies.includes(b.currency) && b.currency && (
                          <option value={b.currency}>{b.currency}</option>
                        )}
                      </select>
                    </td>
                    <td style={{ paddingLeft: 0, paddingRight: 8 }}>
                      <input
                        type="text"
                        className="input"
                        value={b.amount === 0 ? '' : (typeof b.amount === 'number' ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(b.amount) : b.amount)}
                        placeholder="0"
                        onChange={e => {
                          // Save string as is while typing (e.g. "1,000 + 500")
                          updateBalance(org.id, i, 'amount', e.target.value);
                        }}
                        onBlur={e => {
                          // Calculate and format strictly to number on blur
                          const calculated = evaluateMath(e.target.value);
                          updateBalance(org.id, i, 'amount', calculated);
                        }}
                        onKeyDown={e => {
                          // Calculate and format strictly to number on Enter
                          if (e.key === 'Enter') {
                            const calculated = evaluateMath((e.target as HTMLInputElement).value);
                            updateBalance(org.id, i, 'amount', calculated);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        // --- INTERCEPT COPY EVENT TO REMOVE COMMAS ---
                        onCopy={e => {
                          const target = e.target as HTMLInputElement;
                          const selectionStart = target.selectionStart || 0;
                          const selectionEnd = target.selectionEnd || 0;
                          
                          // Get exactly what the user highlighted
                          const selectedText = target.value.substring(selectionStart, selectionEnd);
                          
                          if (selectedText) {
                            // Prevent default copy behavior
                            e.preventDefault();
                            // Strip commas and push to clipboard
                            const cleanText = selectedText.replace(/,/g, '');
                            e.clipboardData.setData('text/plain', cleanText);
                          }
                        }}
                      />
                    </td>
                    <td className="text-right" style={{ paddingLeft: 0, paddingRight: 0 }}>
                      <button className="btn" style={{ padding: '8px' }} onClick={() => removeBalance(org.id, i)}>
                        <Trash2 size={14} className="text-danger" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button className="btn" onClick={() => addBalance(org.id)}>
              <Plus size={16} /> Add Balance
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
