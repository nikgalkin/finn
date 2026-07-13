import type { MutableRefObject } from 'react';
import { Copy, List, MessageSquare, Plus, Trash2 } from 'lucide-react';
import type { AppSettings, Balance, Organization } from '../../types';
import { getCountryByAlpha3, getCountryDisplayName } from '../../lib/countries';
import { evaluateNumberExpression } from '../../lib/numberExpression';
import { HelpTooltip } from './HelpTooltip';
import { MultiTagSelect } from './MultiTagSelect';
import type { ActiveSnapshotComment } from './SnapshotCommentModal';

type OrganizationsEditorProps = {
  activeDropdownOrgId: string | null;
  isNew: boolean;
  latestSnapshotAvailable: boolean;
  recentlyAddedOrgId: string | null;
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

const getIconStyle = (hasComment: boolean) => ({
  padding: '8px',
  color: hasComment ? '#3b82f6' : 'rgba(255, 255, 255, 0.6)',
  transition: 'color 0.2s'
});

const amountFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const cellStyle = { padding: '4px 6px 4px 0' };
const headerStyle = { padding: '10px 5px', textTransform: 'uppercase' as const, fontSize: '12px', letterSpacing: '0.5px', color: 'var(--text-secondary)', textAlign: 'center' as const };
const tableHeaders = [['20%', 'Currency'], ['35%', 'Tags'], ['35%', 'Amount'], ['10%', '']] as const;
const formatAmount = (amount: Balance['amount']) => amount === 0 ? '' : typeof amount === 'number' ? amountFormatter.format(amount) : amount;

const amountFieldHelp = (
  <div>
    <div style={{ fontWeight: 700, marginBottom: '8px' }}>Amount field capabilities</div>
    <div style={{ marginBottom: '8px' }}>
      The value is calculated when you press Enter or leave the field.
    </div>
    <div style={{ marginBottom: '4px', fontWeight: 700 }}>Basic math</div>
    <div style={{ marginBottom: '8px' }}>
      Use +, -, *, / and parentheses. Examples: 1200 + 350, (100 + 20) * 3, -500.
    </div>
    <div style={{ marginBottom: '4px', fontWeight: 700 }}>Number shortcuts</div>
    <div>
      k = 3 zeros (1k = 1,000){'\n'}
      kk or m = 6 zeros (1kk = 1m = 1,000,000){'\n'}
      b = 9 zeros (1b = 1,000,000,000){'\n'}
      mm = 12 zeros (1mm = 1,000,000,000,000){'\n\n'}
      Shortcuts are case-insensitive and work inside expressions, for example 1m + 250k or 1.5k * 2.
    </div>
  </div>
);

export function OrganizationsEditor({
  activeDropdownOrgId,
  isNew,
  latestSnapshotAvailable,
  recentlyAddedOrgId,
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
  const uniqueConfiguredOrganizations = settings.organizations.filter((organization, index, organizations) => (
    organizations.findIndex(candidate => candidate.name.trim().toLocaleLowerCase() === organization.name.trim().toLocaleLowerCase()) === index
  ));
  const selectedOrganizationNames = new Set(
    organizations.map(org => org.name.trim().toLocaleLowerCase()).filter(Boolean)
  );
  const allOrganizationsUsed = uniqueConfiguredOrganizations.every(organization => (
    selectedOrganizationNames.has(organization.name.trim().toLocaleLowerCase())
  ));
  const organizationLimitReached = organizations.length >= uniqueConfiguredOrganizations.length;
  const addOrganizationDisabled = allOrganizationsUsed || organizationLimitReached;

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <h3 style={{ margin: 0 }}>Organizations & Accounts</h3>
            <HelpTooltip text={amountFieldHelp} ariaLabel="Amount field help" width={400} />
          </div>
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
        <button
          className="btn btn-primary"
          onClick={onAddOrganization}
          disabled={addOrganizationDisabled}
          title={addOrganizationDisabled ? 'All configured organizations have already been added' : 'Add organization'}
        >
          <Plus size={18} className="mr-1" /> Add Organization
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {organizations.map(org => {
          const isCurrentOrgDropdownOpen = activeDropdownOrgId === org.id;
          const selectedOrganizationNames = new Set(
            organizations
              .filter(item => item.id !== org.id)
              .map(item => item.name.trim().toLocaleLowerCase())
              .filter(Boolean)
          );
          const configuredOrganization = uniqueConfiguredOrganizations.find(organization => (
            organization.name.trim().toLocaleLowerCase() === org.name.trim().toLocaleLowerCase()
          ));
          const country = getCountryByAlpha3(configuredOrganization?.country);

          return (
            <div
              key={org.id}
              ref={el => { orgRefs.current[org.id] = el; }}
              className={`glass-panel${recentlyAddedOrgId === org.id ? ' organization-card-new' : ''}`}
              style={{
                zIndex: isCurrentOrgDropdownOpen ? 10 : 1,
                position: 'relative'
              }}
            >
              <div className="flex items-center mb-6 relative">
                <div className="flex-1 flex justify-center">
                  <div className="flex items-center gap-2">
                    <select
                      className="input"
                      value={org.name}
                      onChange={event => onUpdateOrganizationField(org.id, 'name', event.target.value)}
                      style={{ fontSize: 20, fontWeight: 'bold', width: 'auto', minWidth: '150px', textAlign: 'center' }}
                    >
                      <option value="" disabled>Select Organization</option>
                      {uniqueConfiguredOrganizations.map(organization => (
                        <option
                          key={organization.name}
                          value={organization.name}
                          disabled={selectedOrganizationNames.has(organization.name.trim().toLocaleLowerCase())}
                        >
                          {organization.name}
                        </option>
                      ))}
                      {!settings.organizations.some(organization => organization.name === org.name) && org.name && (
                        <option value={org.name}>{org.name}</option>
                      )}
                    </select>
                    {country && (
                      <span
                        className="country-code-hint"
                        data-tooltip={getCountryDisplayName(country)}
                        aria-label={`Country: ${getCountryDisplayName(country)}`}
                        tabIndex={0}
                        style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.58 }}
                      >
                        {country.alpha3}
                      </span>
                    )}
                  </div>
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
                    {tableHeaders.map(([width, label]) => (
                      <th key={label || 'actions'} style={{ ...headerStyle, width, padding: label ? headerStyle.padding : '10px 0' }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {org.balances.map((balance, index) => (
                    <tr key={index}>
                      <td style={cellStyle}>
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
                      <td style={cellStyle}>
                        <MultiTagSelect
                          selectedTags={balance.tags || []}
                          availableTags={settings.tags || []}
                          onChange={(newTags: string[]) => onUpdateBalance(org.id, index, 'tags', newTags)}
                          onOpen={() => onActiveDropdownChange(org.id)}
                          onClose={() => onActiveDropdownChange(null)}
                        />
                      </td>
                      <td style={cellStyle}>
                        <input
                          type="text"
                          className="input"
                          value={formatAmount(balance.amount)}
                          placeholder="0"
                          onChange={event => onUpdateBalance(org.id, index, 'amount', event.target.value)}
                          onBlur={event => {
                            const calculated = evaluateNumberExpression(event.target.value);
                            onUpdateBalance(org.id, index, 'amount', calculated);
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              const calculated = evaluateNumberExpression((event.target as HTMLInputElement).value);
                              onUpdateBalance(org.id, index, 'amount', calculated);
                              (event.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </td>
                      <td className="text-right" style={{ ...cellStyle, paddingRight: 0 }}>
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
