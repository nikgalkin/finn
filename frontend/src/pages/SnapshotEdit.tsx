import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { API_URL } from '../types';
import type { Balance } from '../types';
import { DraftRestoreBanner } from './components/DraftRestoreBanner';
import { ConfirmLeaveModal } from './components/ConfirmLeaveModal';
import { OrganizationsEditor } from './components/OrganizationsEditor';
import { PeriodRatesPanel } from './components/PeriodRatesPanel';
import { SnapshotCommentModal } from './components/SnapshotCommentModal';
import type { ActiveSnapshotComment } from './components/SnapshotCommentModal';
import { SnapshotEditorHeader } from './components/SnapshotEditorHeader';
import { useSnapshotDraft } from './hooks/useSnapshotDraft';
import { stripCommentsFromSnapshot, useSnapshotEditorData } from './hooks/useSnapshotEditorData';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';

export default function SnapshotEdit() {
  const { month, sourceMonth } = useParams<{ month?: string; sourceMonth?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isNew = !month && !sourceMonth;
  const isCopy = !!sourceMonth;

  const {
    currentMonth,
    data,
    durationSeconds,
    latestSnapshot,
    loading,
    originalMonth,
    settings,
    settingsLoaded,
    setCurrentMonth,
    setData,
    setDurationSeconds
  } = useSnapshotEditorData({ isCopy, isNew, month, sourceMonth });

  const [activeDropdownOrgId, setActiveDropdownOrgId] = useState<string | null>(null);

  const [activeComment, setActiveComment] = useState<ActiveSnapshotComment | null>(null);

  const [fetchingRates, setFetchingRates] = useState<'latest' | 'periodStart' | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const orgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const initialDataHash = useRef<string>('');
  const draftKey = `finn_draft_${month || 'new'}`;

  const isDirty = useMemo(() => {
    if (!initialDataHash.current) return false;
    return initialDataHash.current !== JSON.stringify({ data, currentMonth });
  }, [data, currentMonth]);

  const { draftToRestore, setDraftToRestore, discardDraft } = useSnapshotDraft({
    draftKey,
    isDirty,
    data,
    currentMonth,
    durationSeconds,
    isNew
  });

  useEscapeToDashboard({
    blocked: !!activeComment || showLeaveConfirm,
    confirmWhen: isDirty,
    confirmMessage: 'This snapshot has unsaved changes. Leave without saving?',
    onConfirmRequired: () => setShowLeaveConfirm(true)
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

    const requestBody = JSON.stringify({ month: currentMonth, data: JSON.stringify(data), duration_seconds: durationSeconds });

    if (!isEditing) {
      const createSnapshot = () => {
        fetch(`${API_URL}/snapshots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody
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

      const overwriteSnapshot = () => {
        fetch(`${API_URL}/snapshots/${currentMonth}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody
        })
          .then(res => {
            if (res.ok) completeSave();
            else alert('Failed to overwrite snapshot');
          });
      };

      fetch(`${API_URL}/snapshots/${currentMonth}`)
        .then(res => {
          if (res.ok) {
            const typed = window.prompt(
              `A snapshot for "${currentMonth}" already exists.\n\nTo overwrite it, type the month name (${currentMonth}):`
            );
            if (typed === currentMonth) overwriteSnapshot();
            else if (typed !== null) alert('Month name did not match. Overwrite cancelled.');
          } else {
            createSnapshot();
          }
        })
        .catch(() => createSnapshot());
      return;
    }

    if (currentMonth !== originalMonth) {
      fetch(`${API_URL}/snapshots/${originalMonth}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
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
        body: requestBody
      })
        .then(res => {
          if (res.ok) completeSave();
          else alert('Failed to save');
        });
    }
  };

  const applyFetchedRates = (fetchedRates: Record<string, number>) => {
    const normalizedRates = Object.fromEntries(
      Object.entries(fetchedRates).map(([currency, rate]) => [currency.toUpperCase(), rate])
    );
    const base = (settings.baseCurrency || 'RUB').toUpperCase();
    const autoFetchList = settings.autoFetchCurrencies || [];

    setData(prev => {
      const newRates = { ...prev.rates };

      Object.keys(newRates).forEach(currency => {
        if (!autoFetchList.includes(currency)) return;

        const sourceCurrency = currency === 'USDT' && !normalizedRates.USDT ? 'USD' : currency;
        const fetchedRate = normalizedRates[sourceCurrency];

        if (currency === base) {
          newRates[currency] = 1;
        } else if (Number.isFinite(fetchedRate) && fetchedRate > 0) {
          newRates[currency] = parseFloat((1 / fetchedRate).toFixed(6));
        }
      });

      return { ...prev, rates: newRates };
    });
  };

  const fetchLatestRates = async () => {
    setFetchingRates('latest');
    const base = settings.baseCurrency || 'RUB';

    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${base}`);
      if (!response.ok) throw new Error(`Exchange rate request failed with status ${response.status}`);

      const responseData = await response.json();
      if (!responseData?.rates) throw new Error('Exchange rate response does not contain rates');

      applyFetchedRates(responseData.rates);
    } catch (error) {
      console.error(error);
      alert('Failed to fetch latest rates');
    } finally {
      setFetchingRates(null);
    }
  };

  const fetchPeriodStartRates = async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(currentMonth)) {
      alert('Enter a valid period in YYYY-MM format first.');
      return;
    }

    const date = `${currentMonth}-01`;
    const base = (settings.baseCurrency || 'RUB').toLowerCase();
    const urls = [
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${base}.json`,
      `https://${date}.currency-api.pages.dev/v1/currencies/${base}.json`
    ];

    setFetchingRates('periodStart');

    try {
      let lastError: unknown;

      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Exchange rate request failed with status ${response.status}`);

          const responseData: Record<string, unknown> = await response.json();
          const rates = responseData[base];
          if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
            throw new Error('Exchange rate response does not contain rates');
          }

          applyFetchedRates(rates as Record<string, number>);
          return;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError || new Error('All exchange rate sources failed');
    } catch (error) {
      console.error(error);
      alert(`Failed to fetch rates for ${date}`);
    } finally {
      setFetchingRates(null);
    }
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
        onFetchLatestRates={fetchLatestRates}
        onFetchPeriodStartRates={fetchPeriodStartRates}
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

      {showLeaveConfirm && (
        <ConfirmLeaveModal
          message="This snapshot has unsaved changes. Leave without saving?"
          onCancel={() => setShowLeaveConfirm(false)}
          onConfirm={() => navigate('/')}
        />
      )}
    </div>
  );
}
