import { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Calendar } from 'lucide-react';
import { getCurrencyColor } from '../types';
import { useSettings } from '../hooks/useSettings';
import { useSnapshots } from '../hooks/useSnapshots';
import { calculateTotals, extractComments } from '../lib/finance';

const getOrgColor = (orgName: string) => {
  if (!orgName) return 'hsl(0, 0%, 50%)';
  let hash = 0;
  for (let i = 0; i < orgName.length; i++) {
    hash = orgName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 75%)`;
};

export default function CommentFeed() {
  const { settings } = useSettings();
  const { snapshots, loading } = useSnapshots({ sort: 'desc' });
  const baseCurrency = settings.baseCurrency || 'RUB';
  const navigate = useNavigate();

  const snapshotsWithComments = useMemo(() => {
    return snapshots
      .map(snapshot => ({
        snapshot,
        comments: extractComments(snapshot),
        totalBase: Math.round(calculateTotals(snapshot, baseCurrency).totalBase)
      }))
      .filter(item => item.comments.length > 0);
  }, [snapshots, baseCurrency]);

  if (loading) return <div>Loading timeline...</div>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Link to="/" className="btn" title="Back to dashboard"><ArrowLeft size={18} /></Link>
        <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Financial Retrospective Feed</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {snapshotsWithComments.map(({ snapshot: s, comments, totalBase }) => {
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
