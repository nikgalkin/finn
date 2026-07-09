import type { MutableRefObject } from 'react';
import { Copy, List, MessageSquare, Plus, Trash2 } from 'lucide-react';
import type { AppSettings, Balance, Organization } from '../../types';
import { MultiTagSelect } from './MultiTagSelect';
import type { ActiveSnapshotComment } from './SnapshotCommentModal';

type OrganizationsEditorProps = {
  activeDropdownOrgId: string | null;
  isNew: boolean;
  latestSnapshotAvailable: boolean;
  organizations: Organization[];
  orgRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  settings: AppSettings;
  onActiveDropdownChange: (orgId: string | null) => void;
  onAddBalance: (orgId: string) => void;
  onAddOrganization: () => void;
  onCopyFromPrevious: () => void;
  onFillFromSettings: () => void;
  onOpenComment: (comment: ActiveSnapshotComment) => void;
  onRemoveBalance: (orgId: string, index: number) => void;
  onRemoveOrganization: (orgId: string) => void;
  onUpdateBalance: (orgId: string, index: number, field: keyof Balance, value: any) => void;
  onUpdateOrganizationField: (id: string, field: 'name' | 'comment', value: string) => void;
};

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

const getIconStyle = (hasComment: boolean) => ({
  padding: '8px',
  color: hasComment ? '#3b82f6' : 'rgba(255, 255, 255, 0.6)',
  transition: 'color 0.2s'
});

export function OrganizationsEditor({
  activeDropdownOrgId,
  isNew,
  latestSnapshotAvailable,
  organizations,
  orgRefs,
  settings,
  onActiveDropdownChange,
  onAddBalance,
  onAddOrganization,
  onCopyFromPrevious,
  onFillFromSettings,
  onOpenComment,
  onRemoveBalance,
  onRemoveOrganization,
  onUpdateBalance,
  onUpdateOrganizationField
}: OrganizationsEditorProps) {
  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h3>Organizations & Accounts</h3>
          {isNew && organizations.length === 0 && (
            <div className="flex gap-2 ml-4">
              {latestSnapshotAvailable && (
                <button className="btn" onClick={onCopyFromPrevious}>
                  <Copy size={14} className="mr-1" /> Copy from previous
                </button>
              )}
              <button className="btn" onClick={onFillFromSettings}>
                <List size={14} className="mr-1" /> Fill from Settings
              </button>
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={onAddOrganization}>
          <Plus size={18} className="mr-1" /> Add Organization
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {organizations.map(org => {
          const isCurrentOrgDropdownOpen = activeDropdownOrgId === org.id;

          return (
            <div
              key={org.id}
              ref={el => { orgRefs.current[org.id] = el; }}
              className="glass-panel"
              style={{
                zIndex: isCurrentOrgDropdownOpen ? 10 : 1,
                position: 'relative'
              }}
            >
              <div className="flex items-center mb-6 relative">
                <div className="flex-1 flex justify-center">
                  <select
                    className="input"
                    value={org.name}
                    onChange={event => onUpdateOrganizationField(org.id, 'name', event.target.value)}
                    style={{ fontSize: 20, fontWeight: 'bold', width: 'auto', minWidth: '150px', textAlign: 'center' }}
                  >
                    <option value="" disabled>Select Organization</option>
                    {settings.organizations.map(name => <option key={name} value={name}>{name}</option>)}
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
                    onClick={() => onOpenComment({ type: 'org', orgId: org.id, text: org.comment || '', initialText: org.comment || '', title: `${org.name || 'Organization'} Note` })}
                  >
                    <MessageSquare size={16} />
                  </button>
                  <button className="btn btn-danger" onClick={() => onRemoveOrganization(org.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <table className="table mb-4" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: '20%', padding: '10px 5px', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', color: 'var(--text-secondary)', textAlign: 'center' }}>Currency</th>
                    <th style={{ width: '35%', padding: '10px 5px', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', color: 'var(--text-secondary)', textAlign: 'center' }}>Tags</th>
                    <th style={{ width: '35%', padding: '10px 5px', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.5px', color: 'var(--text-secondary)', textAlign: 'center' }}>Amount</th>
                    <th style={{ width: '10%', padding: '10px 0' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {org.balances.map((balance, index) => (
                    <tr key={index}>
                      <td style={{ paddingLeft: 0, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }}>
                        <select
                          className="input"
                          value={balance.currency}
                          onChange={event => onUpdateBalance(org.id, index, 'currency', event.target.value)}
                          style={{ width: '100%', paddingRight: '20px' }}
                        >
                          <option value="" disabled>Select</option>
                          {settings.currencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}
                          {!settings.currencies.includes(balance.currency) && balance.currency && (
                            <option value={balance.currency}>{balance.currency}</option>
                          )}
                        </select>
                      </td>
                      <td style={{ paddingLeft: 0, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }}>
                        <MultiTagSelect
                          selectedTags={balance.tags || []}
                          availableTags={settings.tags || []}
                          onChange={(newTags: string[]) => onUpdateBalance(org.id, index, 'tags', newTags)}
                          onOpen={() => onActiveDropdownChange(org.id)}
                          onClose={() => onActiveDropdownChange(null)}
                        />
                      </td>
                      <td style={{ paddingLeft: 0, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }}>
                        <input
                          type="text"
                          className="input"
                          value={balance.amount === 0 ? '' : (typeof balance.amount === 'number' ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(balance.amount) : balance.amount)}
                          placeholder="0"
                          onChange={event => onUpdateBalance(org.id, index, 'amount', event.target.value)}
                          onBlur={event => {
                            const calculated = evaluateMath(event.target.value);
                            onUpdateBalance(org.id, index, 'amount', calculated);
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              const calculated = evaluateMath((event.target as HTMLInputElement).value);
                              onUpdateBalance(org.id, index, 'amount', calculated);
                              (event.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </td>
                      <td className="text-right" style={{ paddingLeft: 0, paddingRight: 0, paddingTop: 4, paddingBottom: 4 }}>
                        <div className="flex justify-end gap-1.5">
                          <button
                            className="btn"
                            style={{ ...getIconStyle(!!balance.comment), padding: '6px' }}
                            title="Balance Note"
                            onClick={() => onOpenComment({ type: 'balance', orgId: org.id, index, text: balance.comment || '', initialText: balance.comment || '', title: `${balance.currency || 'Balance'} Note` })}
                          >
                            <MessageSquare size={14} />
                          </button>
                          <button className="btn" style={{ padding: '6px' }} onClick={() => onRemoveBalance(org.id, index)}>
                            <Trash2 size={14} className="text-danger" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button className="btn" onClick={() => onAddBalance(org.id)}>
                <Plus size={16} className="mr-1" /> Add Balance
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
