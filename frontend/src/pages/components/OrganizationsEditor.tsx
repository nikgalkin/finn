import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { ArrowDownWideNarrow, Building2, Copy, List, MessageSquare, Plus, Trash2, WalletCards } from 'lucide-react';
import type { AppSettings, BalanceDraft, OrganizationDraft } from '../../types';
import { getCountryByAlpha3, getCountryDisplayName } from '../../lib/countries';
import {
  readSnapshotOrganizationSort,
  reconcileSnapshotOrganizationOrder,
  saveSnapshotOrganizationSort,
  snapshotOrganizationOrderNeedsApply,
  sortSnapshotOrganizations,
  type SnapshotOrganizationSort,
} from '../../lib/snapshotOrganizationSort';
import { AppSelect, type AppSelectOption } from './AppSelect';
import { AmountFieldHelp, AmountInput } from './AmountInput';
import { HelpTooltip } from './HelpTooltip';
import { MultiTagSelect } from './MultiTagSelect';
import type { ActiveSnapshotComment } from './SnapshotCommentModal';

type OrganizationsEditorProps = {
  activeDropdownOrgId: string | null;
  isNew: boolean;
  latestSnapshotAvailable: boolean;
  recentlyAddedOrgId: string | null;
  organizations: OrganizationDraft[];
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
  onUpdateBalance: (orgId: string, index: number, field: keyof BalanceDraft, value: any) => void;
  onUpdateOrganizationField: (id: string, field: 'name' | 'comment', value: string) => void;
};

const getIconStyle = (hasComment: boolean) => ({
  padding: '8px',
  color: hasComment ? '#3b82f6' : 'rgba(255, 255, 255, 0.6)',
  transition: 'color 0.2s'
});

const cellStyle = { padding: '5px 6px 5px 0' };
const headerStyle = { padding: '7px 5px', textTransform: 'uppercase' as const, fontSize: '12px', letterSpacing: '0.5px', color: 'var(--text-secondary)', textAlign: 'center' as const };
const tableHeaders = [['25%', 'Tags'], ['45%', 'Amount'], ['20%', 'Currency'], ['10%', '']] as const;
const organizationSortOptions: AppSelectOption[] = [
  { value: 'balance-count-desc', label: 'Most balances first', description: 'Groups taller cards together' },
  { value: 'balance-count-asc', label: 'Fewest balances first', description: 'Starts with compact cards' },
  { value: 'name', label: 'Name A–Z', description: 'Sorts organizations alphabetically' },
  { value: 'original', label: 'Snapshot order', description: 'Uses the saved organization order' },
];

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
  const [organizationSort, setOrganizationSort] = useState<SnapshotOrganizationSort>(readSnapshotOrganizationSort);
  const [organizationOrder, setOrganizationOrder] = useState<string[]>(() => (
    sortSnapshotOrganizations(organizations, organizationSort).map(organization => organization.id)
  ));
  const organizationIds = organizations.map(organization => organization.id).join('\u0000');
  const organizationsRef = useRef(organizations);
  const organizationSortRef = useRef(organizationSort);
  organizationsRef.current = organizations;
  organizationSortRef.current = organizationSort;

  useEffect(() => {
    setOrganizationOrder(currentOrder => (
      reconcileSnapshotOrganizationOrder(organizationsRef.current, currentOrder, organizationSortRef.current)
    ));
    // Balance edits intentionally do not trigger a reorder. Membership changes do.
  }, [organizationIds]);

  const displayedOrganizations = useMemo(
    () => {
      const organizationsById = new Map(organizations.map(organization => [organization.id, organization]));
      return reconcileSnapshotOrganizationOrder(organizations, organizationOrder, organizationSort)
        .map(id => organizationsById.get(id))
        .filter((organization): organization is OrganizationDraft => !!organization);
    },
    [organizationOrder, organizationSort, organizations],
  );
  const organizationSortNeedsApply = useMemo(
    () => snapshotOrganizationOrderNeedsApply(organizations, organizationOrder, organizationSort),
    [organizationOrder, organizationSort, organizations],
  );
  const applyOrganizationSort = (sort: SnapshotOrganizationSort) => {
    setOrganizationOrder(sortSnapshotOrganizations(organizations, sort).map(organization => organization.id));
  };
  const uniqueConfiguredOrganizations = settings.organizations.filter((organization, index, organizations) => (
    !organization.archivedAt
    && organizations.findIndex(candidate => !candidate.archivedAt && candidate.name.trim().toLocaleLowerCase() === organization.name.trim().toLocaleLowerCase()) === index
  ));
  const selectedOrganizationNames = new Set(
    organizations.map(org => org.name.trim().toLocaleLowerCase()).filter(Boolean)
  );
  const allOrganizationsUsed = uniqueConfiguredOrganizations.every(organization => (
    selectedOrganizationNames.has(organization.name.trim().toLocaleLowerCase())
  ));
  const hasUnselectedOrganization = organizations.some(organization => !organization.name.trim());
  const addOrganizationDisabled = allOrganizationsUsed || hasUnselectedOrganization;
  const addOrganizationTitle = allOrganizationsUsed
    ? 'All configured organizations have already been added'
    : hasUnselectedOrganization
      ? 'Select the organization you just added first'
      : 'Add organization';
  const baseCurrency = (settings.baseCurrency || 'RUB').toUpperCase();
  const configuredCurrencyOptions: AppSelectOption[] = settings.currencies.map(currency => ({
    value: currency,
    meta: currency.toUpperCase() === baseCurrency ? 'BASE' : undefined
  }));

  return (
    <section className="snapshot-organizations-section">
      <div className="snapshot-organizations-heading">
        <div className="snapshot-organizations-title">
          <span className="snapshot-section-icon" aria-hidden="true"><Building2 size={19} /></span>
          <div>
            <div className="flex items-center gap-2">
              <h3>Organizations & Accounts</h3>
              <HelpTooltip text={<AmountFieldHelp />} ariaLabel="Amount field help" width={400} />
            </div>
            <p>Keep balances grouped by where they are held.</p>
          </div>
        </div>
        <div className="snapshot-organizations-controls">
          {organizations.length > 1 && (
            <div className="snapshot-organizations-sort">
              <button
                className={`btn snapshot-organizations-sort-apply${organizationSortNeedsApply ? ' is-pending' : ''}`}
                type="button"
                title={organizationSortNeedsApply
                  ? 'Balances changed — apply the selected organization order'
                  : 'Organization order is up to date'}
                aria-label={organizationSortNeedsApply
                  ? 'Apply updated organization sorting'
                  : 'Organization sorting is up to date'}
                onClick={() => applyOrganizationSort(organizationSort)}
                disabled={!organizationSortNeedsApply}
              >
                <ArrowDownWideNarrow size={17} aria-hidden="true" />
              </button>
              <AppSelect
                id="snapshot-organization-sort"
                ariaLabel="Organization display order"
                value={organizationSort}
                options={organizationSortOptions}
                placeholder="Sort organizations"
                onChange={value => {
                  const nextSort = value as SnapshotOrganizationSort;
                  setOrganizationSort(nextSort);
                  applyOrganizationSort(nextSort);
                  saveSnapshotOrganizationSort(nextSort);
                }}
                width="190px"
                dropdownWidth={270}
                dropdownAlign="right"
                height="38px"
              />
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={onAddOrganization}
            disabled={addOrganizationDisabled}
            title={addOrganizationTitle}
          >
            <Plus size={18} className="mr-1" /> Add Organization
          </button>
        </div>
      </div>

      {organizations.length === 0 && (
        <div className="glass-panel snapshot-organizations-empty">
          <span className="snapshot-organizations-empty-icon" aria-hidden="true"><WalletCards size={25} /></span>
          <div>
            <h3>No organizations in this snapshot</h3>
            <p>Add one manually or start with the organizations already configured in Finn.</p>
          </div>
          {isNew && (
            <div className="snapshot-organizations-empty-actions">
              {latestSnapshotAvailable && (
                <button className="btn" onClick={onCopyFromPrevious}>
                  <Copy size={15} /> Copy previous snapshot
                </button>
              )}
              <button className="btn" onClick={onFillFromSettings}>
                <List size={15} /> Fill from Settings
              </button>
            </div>
          )}
        </div>
      )}

      <div className="snapshot-organizations-grid">
        {displayedOrganizations.map(org => {
          const isCurrentOrgDropdownOpen = activeDropdownOrgId === org.id;
          const selectedOrganizationNames = new Set(
            organizations
              .filter(item => item.id !== org.id)
              .map(item => item.name.trim().toLocaleLowerCase())
              .filter(Boolean)
          );
          const archivedOrganization = settings.organizations.find(organization => (
            !!organization.archivedAt
            && organization.name.trim().toLocaleLowerCase() === org.name.trim().toLocaleLowerCase()
          ));
          const country = getCountryByAlpha3(org.country);
          const organizationOptions: AppSelectOption[] = uniqueConfiguredOrganizations.map(organization => {
            const optionCountry = getCountryByAlpha3(organization.country);
            const isCurrent = organization.name.trim().toLocaleLowerCase() === org.name.trim().toLocaleLowerCase();
            return {
              value: organization.name,
              description: optionCountry ? getCountryDisplayName(optionCountry) : undefined,
              meta: optionCountry?.alpha3,
              disabled: !isCurrent && selectedOrganizationNames.has(organization.name.trim().toLocaleLowerCase())
            };
          });
          if (org.name && !organizationOptions.some(option => option.value === org.name)) {
            organizationOptions.push({
              value: org.name,
              description: archivedOrganization ? 'Archived organization' : 'Not in current settings',
              meta: country?.alpha3
            });
          }

          return (
            <div
              key={org.id}
              ref={el => { orgRefs.current[org.id] = el; }}
              className={`glass-panel snapshot-organization-card${recentlyAddedOrgId === org.id ? ' organization-card-new' : ''}`}
              style={{
                zIndex: isCurrentOrgDropdownOpen ? 10 : 1,
                position: 'relative'
              }}
            >
              <div className="snapshot-organization-card-header">
                <button
                  className="btn snapshot-add-balance"
                  onClick={() => onAddBalance(org.id)}
                  title="Add balance"
                  aria-label={`Add balance to ${org.name || 'organization'}`}
                >
                  <Plus size={16} />
                  <span className="snapshot-add-balance-label">Add Balance</span>
                </button>
                <div className="snapshot-organization-identity">
                  <div className="snapshot-organization-select">
                    <AppSelect
                      id={`snapshot-organization-${org.id}`}
                      name={`snapshot-organization-${org.id}`}
                      ariaLabel="Snapshot organization"
                      value={org.name}
                      onChange={value => onUpdateOrganizationField(org.id, 'name', value)}
                      options={organizationOptions}
                      placeholder="Select Organization"
                      searchable={organizationOptions.length > 6}
                      searchPlaceholder="Find organization…"
                      width="230px"
                      dropdownWidth={300}
                      height="36px"
                      textAlign="center"
                      showSelectedMeta={false}
                    />
                    {country && (
                      <span
                        className="country-code-hint snapshot-organization-country"
                        data-tooltip={`${getCountryDisplayName(country)}`}
                        aria-label={`Country: ${getCountryDisplayName(country)}`}
                        tabIndex={0}
                      >
                        {country.alpha3}
                      </span>
                    )}
                  </div>
                </div>
                <div className="snapshot-organization-actions">
                  <button
                    className="btn"
                    style={getIconStyle(!!org.comment)}
                    title="Organization Note"
                    aria-label={`Edit note for ${org.name || 'organization'}`}
                    onClick={() => onOpenComment({ type: 'org', orgId: org.id, text: org.comment || '', initialText: org.comment || '', title: `${org.name || 'Organization'} Note` })}
                  >
                    <MessageSquare size={16} />
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => onRemoveOrganization(org.id)}
                    title="Remove organization"
                    aria-label={`Remove ${org.name || 'organization'}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {org.balances.length > 0 ? (
                <div className="snapshot-balances-table">
                  <table className="table">
                    <thead>
                      <tr>
                        {tableHeaders.map(([width, label]) => (
                          <th key={label || 'actions'} style={{ ...headerStyle, width, padding: label ? headerStyle.padding : '7px 0' }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {org.balances.map((balance, index) => (
                        <tr key={index}>
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
                            <AmountInput
                              value={balance.amount}
                              onChange={value => onUpdateBalance(org.id, index, 'amount', value)}
                              maximumFractionDigits={8}
                            />
                          </td>
                          <td style={cellStyle}>
                            <AppSelect
                              id={`snapshot-balance-${org.id}-${index}-currency`}
                              name={`snapshot-balance-${org.id}-${index}-currency`}
                              ariaLabel={`Balance ${index + 1} currency`}
                              value={balance.currency}
                              onChange={value => onUpdateBalance(org.id, index, 'currency', value)}
                              options={settings.currencies.includes(balance.currency) || !balance.currency
                                ? configuredCurrencyOptions
                                : [...configuredCurrencyOptions, { value: balance.currency, description: 'Not in current settings' }]}
                              placeholder="Select"
                              searchable={settings.currencies.length > 8}
                              searchPlaceholder="Find currency…"
                              width="100%"
                              dropdownWidth={240}
                              height="36px"
                              textAlign="left"
                            />
                          </td>
                          <td className="text-right" style={{ ...cellStyle, paddingRight: 0 }}>
                            <div className="flex justify-end gap-1.5">
                              <button
                                className="btn"
                                style={{ ...getIconStyle(!!balance.comment), padding: '6px' }}
                                title="Balance Note"
                                aria-label={`Edit note for ${balance.currency || 'balance'}`}
                                onClick={() => onOpenComment({ type: 'balance', orgId: org.id, index, text: balance.comment || '', initialText: balance.comment || '', title: `${balance.currency || 'Balance'} Note` })}
                              >
                                <MessageSquare size={14} />
                              </button>
                              <button
                                className="btn"
                                style={{ padding: '6px' }}
                                onClick={() => onRemoveBalance(org.id, index)}
                                title="Remove balance"
                                aria-label={`Remove ${balance.currency || 'balance'}`}
                              >
                                <Trash2 size={14} className="text-danger" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="snapshot-balances-empty">
                  <WalletCards size={18} aria-hidden="true" />
                  <span>No balances yet</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
