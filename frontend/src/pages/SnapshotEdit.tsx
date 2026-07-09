import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { API_URL } from '../types';
import type { SnapshotData, Balance, Snapshot, AppSettings } from '../types';
import { DraftRestoreBanner } from './components/DraftRestoreBanner';
import { OrganizationsEditor } from './components/OrganizationsEditor';
import { PeriodRatesPanel } from './components/PeriodRatesPanel';
import { SnapshotCommentModal } from './components/SnapshotCommentModal';
import type { ActiveSnapshotComment } from './components/SnapshotCommentModal';
import { SnapshotEditorHeader } from './components/SnapshotEditorHeader';
import { useSnapshotDraft } from './hooks/useSnapshotDraft';

const stripCommentsFromSnapshot = (snapshotData: SnapshotData): SnapshotData => {
  return {
    ...snapshotData,
    comment: '',
    organizations: snapshotData.organizations.map(org => ({
      ...org,
      comment: '',
      balances: org.balances.map(b => ({
        ...b,
        comment: '',
        tags: b.tags || []
      }))
    }))
  };
};

export default function SnapshotEdit() {
  const { month, sourceMonth } = useParams<{ month?: string; sourceMonth?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isNew = !month && !sourceMonth;
  const isCopy = !!sourceMonth;

  const [currentMonth, setCurrentMonth] = useState('');
  const [originalMonth, setOriginalMonth] = useState('');
  const [data, setData] = useState<SnapshotData>({
    comment: '',
    rates: { USD: 90, EUR: 100 },
    organizations: []
  });

  const [durationSeconds, setDurationSeconds] = useState(0);
  const [activeDropdownOrgId, setActiveDropdownOrgId] = useState<string | null>(null);

  const [activeComment, setActiveComment] = useState<ActiveSnapshotComment | null>(null);

  const [latestSnapshot, setLatestSnapshot] = useState<SnapshotData | null>(null);
  const [settings, setSettings] = useState<AppSettings>({ organizations: [], currencies: [], tags: [] });
  const [loading, setLoading] = useState(true);
  const [fetchingRates, setFetchingRates] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const orgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const initialDataHash = useRef<string>('');
  const draftKey = `finn_draft_${month || 'new'}`;

  const isDirty = useMemo(() => {
    if (!initialDataHash.current) return false;
    return initialDataHash.current !== JSON.stringify({ data, currentMonth });
  }, [data, currentMonth]);

  // Hook into draft management system
  const { draftToRestore, setDraftToRestore, discardDraft } = useSnapshotDraft({
    draftKey,
    isDirty,
    data,
    currentMonth,
    durationSeconds,
    isNew
  });

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleRestoreDraft = () => {
    if (draftToRestore) {
      setData(draftToRestore.data);
      setCurrentMonth(draftToRestore.currentMonth);
      setDurationSeconds(draftToRestore.durationSeconds || 0);
      setDraftToRestore(null);
    }
  };

  const handleDiscardDraft = () => {
    if (confirm('Are you sure you want to discard this draft? This cannot be undone.')) {
      discardDraft();
    }
  };

  useEffect(() => {
    if (loading) return;

    const interval = setInterval(() => {
      if (!document.hidden) {
        setDurationSeconds(prev => prev + 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    fetch(`${API_URL}/settings`)
      .then(res => res.json())
      .then(resData => {
        const parsed = JSON.parse(resData.value);
        if (!parsed.tags) parsed.tags = [];
        setSettings(parsed);
        setSettingsLoaded(true);
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
            const parsedData = JSON.parse(s.data);
            if (parsedData.organizations) {
              parsedData.organizations = parsedData.organizations.map((org: any) => ({
                ...org,
                balances: org.balances.map((b: any) => ({
                  ...b,
                  tags: b.tags || []
                }))
              }));
            }
            setData(parsedData);
          }
          if (s.duration_seconds) {
            setDurationSeconds(s.duration_seconds);
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
    if (!loading && settingsLoaded && !initialDataHash.current) {
      const timer = setTimeout(() => {
        initialDataHash.current = JSON.stringify({ data, currentMonth });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [loading, settingsLoaded, data, currentMonth]);

  useEffect(() => {
    if (!loading && data.organizations.length > 0) {
      const params = new URLSearchParams(location.search);
      const focusOrgName = params.get('focusOrg');
      if (focusOrgName) {
        const org = data.organizations.find(o => o.name.toLowerCase() === focusOrgName.toLowerCase());
        if (org && orgRefs.current[org.id]) {
          setTimeout(() => {
            orgRefs.current[org.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const selectEl = orgRefs.current[org.id]?.querySelector('select');
            if (selectEl) selectEl.focus();
          }, 300);
        }
      }
    }
  }, [loading, data.organizations, location.search]);

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

  const completeSave = () => {
    localStorage.removeItem(draftKey);
    navigate('/');
  };

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
          body: JSON.stringify({ month: currentMonth, data: JSON.stringify(data), duration_seconds: durationSeconds })
        })
          .then(res => {
            if (res.ok) completeSave();
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
        body: JSON.stringify({ month: currentMonth, data: JSON.stringify(data), duration_seconds: durationSeconds })
      })
        .then(res => {
          if (res.status === 409) {
            alert(`A snapshot for "${currentMonth}" already exists. Please choose a different month.`);
          } else if (res.ok) {
            completeSave();
          } else {
            alert('Failed to save');
          }
        });
    } else {
      fetch(`${API_URL}/snapshots/${originalMonth}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentMonth, data: JSON.stringify(data), duration_seconds: durationSeconds })
      })
        .then(res => {
          if (res.ok) completeSave();
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
        balances: [{ currency: settings.baseCurrency || 'RUB', amount: 0, comment: '', tags: [] }]
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
            balances: [...o.balances, { currency: settings.baseCurrency || 'RUB', amount: 0, comment: '', tags: [] }]
          };
        }
        return o;
      })
    });
  };

  const updateBalance = (orgId: string, index: number, field: keyof Balance, value: any) => {
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
      {draftToRestore && (
        <DraftRestoreBanner
          draftTimestamp={draftToRestore.timestamp}
          onRestore={handleRestoreDraft}
          onDiscard={handleDiscardDraft}
        />
      )}
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

      <SnapshotEditorHeader
        title={isNew ? 'New Snapshot' : isCopy ? `New Snapshot (copy of ${sourceMonth})` : `Edit Snapshot ${month}`}
        durationSeconds={durationSeconds}
        hasMonthlyComment={!!data.comment}
        onOpenMonthlyComment={() => setActiveComment({ type: 'month', text: data.comment || '', initialText: data.comment || '', title: 'Monthly Note' })}
        onSave={handleSave}
      />

      <PeriodRatesPanel
        currentMonth={currentMonth}
        rates={data.rates}
        settings={settings}
        fetchingRates={fetchingRates}
        onAddRate={addRate}
        onFetchRates={fetchRates}
        onMonthChange={setCurrentMonth}
        onRateChange={updateRate}
      />

      <OrganizationsEditor
        activeDropdownOrgId={activeDropdownOrgId}
        isNew={isNew}
        latestSnapshotAvailable={!!latestSnapshot}
        organizations={data.organizations}
        orgRefs={orgRefs}
        settings={settings}
        onActiveDropdownChange={setActiveDropdownOrgId}
        onAddBalance={addBalance}
        onAddOrganization={addOrganization}
        onCopyFromPrevious={copyFromPrevious}
        onFillFromSettings={fillFromSettings}
        onOpenComment={setActiveComment}
        onRemoveBalance={removeBalance}
        onRemoveOrganization={removeOrganization}
        onUpdateBalance={updateBalance}
        onUpdateOrganizationField={updateOrganizationField}
      />

      {activeComment && (
        <SnapshotCommentModal
          comment={activeComment}
          onChange={setActiveComment}
          onClose={handleCloseComment}
          onSave={saveComment}
        />
      )}
    </div>
  );
}
