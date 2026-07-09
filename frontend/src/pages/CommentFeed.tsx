import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Calendar } from 'lucide-react';
import { API_URL, getCurrencyColor } from '../types';
import type { ParsedSnapshot, Snapshot } from '../types';

const getOrgColor = (orgName: string) => {
  if (!orgName) return 'hsl(0, 0%, 50%)';
  let hash = 0;
  for (let i = 0; i < orgName.length; i++) {
    hash = orgName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 75%)`;
};

type CommentItem = {
  type: 'snapshot' | 'org' | 'balance';
  orgName?: string;
  currency?: string;
  text: string;
};

export default function CommentFeed() {
  const [snapshots, setSnapshots] = useState<ParsedSnapshot[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('RUB');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_URL}/settings`)
      .then(res => res.json())
      .then(resData => {
        const settings = JSON.parse(resData.value);
        if (settings.baseCurrency) setBaseCurrency(settings.baseCurrency);
      });

    fetch(`${API_URL}/snapshots`)
      .then(res => res.json())
      .then((data: Snapshot[]) => {
        const parsed = (data || []).map(s => ({
          ...s,
          data: JSON.parse(s.data)
        }));
        parsed.sort((a, b) => b.month.localeCompare(a.month));
        setSnapshots(parsed);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  /**
   * Cross-rate frontend converter to dynamically determine the value
   * inside the current baseCurrency selection using local snapshot rates.
   */
  const convertAmount = useCallback((amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number | string>) => {
    if (fromCurrency === toCurrency) return amount;
    
    const rateToOriginalBase = fromCurrency === 'RUB' ? 1 : Number(rates[fromCurrency] || 0);
    const targetRateToOriginalBase = toCurrency === 'RUB' ? 1 : Number(rates[toCurrency] || 0);
    
    if (targetRateToOriginalBase === 0) return 0;
    
    return (amount * rateToOriginalBase) / targetRateToOriginalBase;
  }, []);

  const calculateTotalBase = (snap: ParsedSnapshot) => {
    let total = 0;
    snap.data.organizations.forEach(org => {
      org.balances.forEach(b => {
        const amount = Number(b.amount || 0);
        total += convertAmount(amount, b.currency, baseCurrency, snap.data.rates);
      });
    });
    return Math.round(total);
  };

  const extractComments = (snap: ParsedSnapshot): CommentItem[] => {
    const items: CommentItem[] = [];
    if (snap.data.comment) {
      items.push({ type: 'snapshot', text: snap.data.comment });
    }
    snap.data.organizations.forEach(org => {
      if (org.comment) {
        items.push({ type: 'org', orgName: org.name, text: org.comment });
      }
      org.balances.forEach(b => {
        if (b.comment) {
          items.push({ type: 'balance', orgName: org.name, currency: b.currency, text: b.comment });
        }
      });
    });
    return items;
  };

  if (loading) return <div>Loading timeline...</div>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Link to="/" className="btn" title="Back to dashboard"><ArrowLeft size={18} /></Link>
        <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Financial Retrospective Feed</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {snapshots.map(s => {
          const comments = extractComments(s);
          if (comments.length === 0) return null;

          const totalBase = calculateTotalBase(s);

          return (
            <div key={s.month} className="glass-panel" style={{ padding: '16px' }}>
              <div className="flex justify-between items-center mb-4" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Calendar size={18} style={{ color: 'var(--text-secondary)' }} />
                  <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{s.month}</span>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Balance: <b style={{ color: 'var(--text-primary)' }}>{totalBase.toLocaleString('en-US')} {baseCurrency}</b>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {comments.map((comm, idx) => (
                  <div key={idx} className="flex flex-col gap-1" style={{ background: 'rgba(255,255,255,0.01)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div className="flex items-center gap-2">
                      {comm.type === 'snapshot' && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                          GLOBAL NOTE
                        </span>
                      )}
                      {comm.orgName && (
                        <span 
                          style={{ fontSize: '12px', fontWeight: 600, color: getOrgColor(comm.orgName), cursor: 'pointer' }}
                          onClick={() => navigate(`/snapshot/${s.month}?focusOrg=${encodeURIComponent(comm.orgName!)}`)}
                        >
                          {comm.orgName}
                        </span>
                      )}
                      
                      {comm.currency && (
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 700, 
                          color: getCurrencyColor(comm.currency), 
                          background: 'rgba(255,255,255,0.02)', 
                          padding: '2px 6px', 
                          borderRadius: '4px',
                          border: `1px solid ${getCurrencyColor(comm.currency)}25`
                        }}>
                          {comm.currency}
                        </span>
                      )}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', color: 'var(--text-primary)', marginTop: '4px' }}>
                      {comm.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
