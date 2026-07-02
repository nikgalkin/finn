import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { Save, ArrowLeft, Plus, Trash2, RefreshCw, Copy, List, MessageSquare, X } from 'lucide-react';
import { API_URL } from '../types';
import type { SnapshotData, Balance, Snapshot, AppSettings } from '../types';

// Safe math evaluation
const evaluateMath = (expr: string | number): number => {
  if (typeof expr === 'number') return expr;
  try {
    const sanitized = expr.replace(/[^-()\d/*+.]/g, '');
    if (!sanitized) return 0;
    const result = new Function(`return ${sanitized}`)();
    return Number.isFinite(result) ? result : 0;
  } catch (e) {
    return 0; 
  }
};

// Helper to strip comments from snapshot data when copying
const stripCommentsFromSnapshot = (snapshotData: SnapshotData): SnapshotData => {
  return {
    ...snapshotData,
    comment: '',
    organizations: snapshotData.organizations.map(org => ({
      ...org,
      comment: '',
      balances: org.balances.map(b => ({
        ...b,
        comment: ''
      }))
    }))
  };
};

export default function SnapshotEdit() {
  const { month, sourceMonth } = useParams<{ month?: string; sourceMonth?: string }>();
  const navigate = useNavigate();
  const isNew = !month && !sourceMonth;
  const isCopy = !!sourceMonth;

  const [currentMonth, setCurrentMonth] = useState('');
  const [originalMonth, setOriginalMonth] = useState('');
  const [data, setData] = useState<SnapshotData>({
    comment: '',
    rates: { USD: 90, EUR: 100 },
    organizations: []
  });
  
  // State for the comment modal
  const [activeComment, setActiveComment] = useState<{
    type: 'month' | 'org' | 'balance';
    orgId?: string;
    index?: number;
    text: string;
    initialText: string;
    title: string;
  } | null>(null);

  const [latestSnapshot, setLatestSnapshot] = useState<SnapshotData | null>(null);
  const [settings, setSettings] = useState<AppSettings>({ organizations: [], currencies: [] });
  const [loading, setLoading] = useState(true);
  const [fetchingRates, setFetchingRates] = useState(false);

  // Единый стиль для всех кнопок комментариев (светло-белый, если пусто)
  const getIconStyle = (hasComment: boolean) => ({
    padding: '8px',
    color: hasComment ? '#3b82f6' : 'rgba(255, 255, 255, 0.6)',
    transition: 'color 0.2s'
  });

  useEffect(() => {
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
              const rawData = JSON.parse(s.data);
              // Стираем комментарии при создании копии через экшен в таблице
              setData(stripCommentsFromSnapshot(rawData));
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

    data.organizations.forEach(org => {
      org.balances.forEach(b => {
        if (Number(b.amount) !== 0 && b.currency) {
          usedCurrencies.add(b.currency);
        }
      });
    });

    const baseCur = settings.baseCurrency || 'RUB';
    const missingRates: string[] = [];

    usedCurrencies.forEach(curr => {
      if (curr !== baseCur) {
        const rate = Number(data.rates[curr]);
        if (isNaN(rate) || rate <= 0) {
          missingRates.push(curr);
        }
      }
    });

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
      // Стираем комментарии при копировании структуры из формы
      const cleanData = stripCommentsFromSnapshot(latestSnapshot);
      setData({ ...data, organizations: cleanData.organizations });
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

  const updateOrganizationField = (id: string, field: 'name' | 'comment', value: string) => {
    setData({
      ...data,
      organizations: data.organizations.map(o => o.id === id ? { ...o, [field]: value } : o)
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
            balances: [...o.balances, { currency: settings.baseCurrency || 'RUB', amount: 0, comment: '' }]
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

  const removeBalance = (orgId: string, index: number) => {
    const org = data.organizations.find(o => o.id === orgId);
    if (!org) return;
    
    const balance = org.balances[index];
    
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

  const saveComment = () => {
    if (!activeComment) return;
    const { type, text, orgId, index } = activeComment;
    
    if (type === 'month') {
      setData(prev => ({ ...prev, comment: text }));
    } else if (type === 'org' && orgId) {
      updateOrganizationField(orgId, 'comment', text);
    } else if (type === 'balance' && orgId && index !== undefined) {
      updateBalance(orgId, index, 'comment', text);
    }
    setActiveComment(null);
  };

  const handleCloseComment = () => {
    if (activeComment && activeComment.text !== activeComment.initialText) {
      if (confirm('You have unsaved changes. Do you want to save them?')) {
        saveComment();
        return;
      }
    }
    setActiveComment(null);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <style>{`
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>

      {/* HEADER SECTION */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="btn" style={{ padding: '8px 12px' }}>
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
            <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0, lineHeight: 1 }}>
              {isNew ? 'New Snapshot' : isCopy ? `New Snapshot (copy of ${sourceMonth})` : `Edit Snapshot ${month}`}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="btn" 
            style={{ ...getIconStyle(!!data.comment), padding: '6px' }}
            title="Add monthly note"
            onClick={() => setActiveComment({ type: 'month', text: data.comment || '', initialText: data.comment || '', title: 'Monthly Note' })}
          >
            <MessageSquare size={18} />
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={18} className="mr-2" /> Save
          </button>
        </div>
      </div>

      {/* OVERVIEW SECTION */}
      <div className="glass-panel mb-8 p-6" style={{ display: 'flex', gap: '32px', alignItems: 'stretch' }}>
        <div style={{ flex: '0 0 180px', display: 'flex', flexDirection: 'column' }}>
          <div className="flex items-center justify-center mb-4" style={{ height: '40px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Period</h3>
          </div>
          <div style={{ flex: 0.5, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <div className="text-xs text-[var(--text-secondary)] mb-2 font-medium text-center">Month (YYYY-MM)</div>
            <input
              className="input w-full text-center"
              value={currentMonth}
              onChange={e => setCurrentMonth(e.target.value)}
              placeholder="YYYY-MM"
              style={{ textAlign: 'center' }}
            />
          </div>
        </div>

        <div style={{ width: '1px', background: 'rgba(255,255,255,0.05)' }}></div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="flex justify-between items-center mb-4" style={{ height: '40px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>
              Exchange Rates (to {settings.baseCurrency || 'RUB'})
            </h3>
            <button className="btn" onClick={fetchRates} disabled={fetchingRates}>
              <RefreshCw size={16} className={`mr-2 ${fetchingRates ? 'animate-spin' : ''}`} />
              {fetchingRates ? 'Fetching...' : 'Fetch Rates'}
            </button>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', flex: 1, alignContent: 'flex-start' }}>
            {Object.entries(data.rates).map(([curr, rate]) => (
              <div key={curr} style={{ flex: '1 1 100px', minWidth: '100px', maxWidth: '150px' }}>
                <div className="text-xs text-[var(--text-secondary)] mb-1 font-medium">{curr}</div>
                <input
                  type="number"
                  className="input w-full"
                  value={rate === 0 ? '' : rate}
                  placeholder="0"
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  onChange={e => {
                    const val = e.target.value;
                    updateRate(curr, val === '' ? 0 : (val.endsWith('.') ? val : parseFloat(val)));
                  }}
                />
              </div>
            ))}
            
            <div style={{ flex: '1 1 100px', minWidth: '100px', maxWidth: '150px' }}>
               <div className="text-xs mb-1 font-medium opacity-0"></div>
               <button className="btn w-full justify-center" style={{ height: '42px' }} onClick={addRate}>
                 <Plus size={16} className="mr-1" /> Add
               </button>
            </div>
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
                  <Copy size={14} className="mr-1" /> Copy from previous
                </button>
              )}
              <button className="btn" onClick={fillFromSettings}>
                <List size={14} className="mr-1" /> Fill from Settings
              </button>
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={addOrganization}>
          <Plus size={18} className="mr-1" /> Add Organization
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
                  onChange={e => updateOrganizationField(org.id, 'name', e.target.value)}
                  style={{ fontSize: 20, fontWeight: 'bold', width: 'auto', minWidth: '150px', textAlign: 'center' }}
                >
                  <option value="" disabled>Select Organization</option>
                  {settings.organizations.map(o => <option key={o} value={o}>{o}</option>)}
                  {!settings.organizations.includes(org.name) && org.name && (
                    <option value={org.name}>{org.name}</option>
                  )}
                </select>
              </div>
              <div className="absolute right-0 flex gap-2">
                <button
                  className="btn"
                  style={getIconStyle(!!org.comment)}
                  title="Organization Note"
                  onClick={() => setActiveComment({ type: 'org', orgId: org.id, text: org.comment || '', initialText: org.comment || '', title: `${org.name || 'Organization'} Note` })}
                >
                  <MessageSquare size={16} />
                </button>
                <button className="btn btn-danger" onClick={() => removeOrganization(org.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <table className="table mb-4">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Currency</th>
                  <th style={{ width: '45%' }}>Amount</th>
                  <th style={{ width: '25%' }}></th>
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
                        <option value="" disabled>Select</option>
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
                        onChange={e => updateBalance(org.id, i, 'amount', e.target.value)}
                        onBlur={e => {
                          const calculated = evaluateMath(e.target.value);
                          updateBalance(org.id, i, 'amount', calculated);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const calculated = evaluateMath((e.target as HTMLInputElement).value);
                            updateBalance(org.id, i, 'amount', calculated);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        onCopy={e => {
                          const target = e.target as HTMLInputElement;
                          const selectedText = target.value.substring(target.selectionStart || 0, target.selectionEnd || 0);
                          if (selectedText) {
                            e.preventDefault();
                            e.clipboardData.setData('text/plain', selectedText.replace(/,/g, ''));
                          }
                        }}
                      />
                    </td>
                    <td className="text-right" style={{ paddingLeft: 0, paddingRight: 0 }}>
                      <div className="flex justify-end gap-2">
                        <button 
                          className="btn" 
                          style={getIconStyle(!!b.comment)} 
                          title="Balance Note"
                          onClick={() => setActiveComment({ type: 'balance', orgId: org.id, index: i, text: b.comment || '', initialText: b.comment || '', title: `${b.currency || 'Balance'} Note` })}
                        >
                          <MessageSquare size={14} />
                        </button>
                        <button className="btn" style={{ padding: '8px' }} onClick={() => removeBalance(org.id, i)}>
                          <Trash2 size={14} className="text-danger" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button className="btn" onClick={() => addBalance(org.id)}>
              <Plus size={16} className="mr-1" /> Add Balance
            </button>
          </div>
        ))}
      </div>

      {/* --- TELEPORTED MODAL --- */}
      {activeComment && createPortal(
        <div 
          className="fixed z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <div 
            className="glass-panel flex flex-col" 
            style={{ 
              width: '600px',
              minWidth: '300px',
              minHeight: '300px',
              resize: 'both', 
              overflow: 'hidden', 
              padding: '24px', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              position: 'relative'
            }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 style={{ margin: 0, fontSize: '18px' }}>{activeComment.title}</h3>
              <button className="btn" style={{ padding: '4px' }} onClick={handleCloseComment}>
                <X size={20} />
              </button>
            </div>
            
            <textarea
              className="input w-full flex-1"
              style={{ resize: 'none', paddingTop: '12px', minHeight: '150px' }}
              placeholder="Type your notes here... (Enter to save, Shift+Enter for new line)"
              value={activeComment.text}
              onChange={e => setActiveComment({ ...activeComment, text: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCloseComment();
                } else if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveComment();
                }
              }}
              autoFocus
            />
            
            <div className="flex justify-end gap-2 mt-6">
              <button className="btn mt-2" onClick={handleCloseComment}>
                Cancel
              </button>
              <button className="btn btn-primary mt-2" onClick={saveComment}>
                Save Note
              </button>
            </div>

            <div style={{ position: 'absolute', bottom: '4px', right: '4px', pointerEvents: 'none', opacity: 0.4 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="21" y1="15" x2="15" y2="21"></line>
                <line x1="21" y1="10" x2="10" y2="21"></line>
              </svg>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
