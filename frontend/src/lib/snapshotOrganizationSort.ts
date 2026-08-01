import type { OrganizationDraft } from '../types';

export const snapshotOrganizationSortChoices = [
  'settings-order',
  'balance-count-desc',
  'balance-count-asc',
  'name',
  'original',
] as const;

export type SnapshotOrganizationSort = (typeof snapshotOrganizationSortChoices)[number];
export type SnapshotOrganizationSortStorage = Pick<Storage, 'getItem' | 'setItem'>;

type SortableOrganization = Pick<OrganizationDraft, 'name' | 'balances'>;
type OrderableOrganization = SortableOrganization & Pick<OrganizationDraft, 'id'>;

const storageKey = 'finn:snapshot-organization-sort';

const browserStorage = (): SnapshotOrganizationSortStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function readSnapshotOrganizationSort(
  storage: SnapshotOrganizationSortStorage | null = browserStorage(),
): SnapshotOrganizationSort {
  try {
    const stored = storage?.getItem(storageKey) as SnapshotOrganizationSort | null;
    return stored && snapshotOrganizationSortChoices.includes(stored)
      ? stored
      : 'settings-order';
  } catch {
    return 'settings-order';
  }
}

export function saveSnapshotOrganizationSort(
  sort: SnapshotOrganizationSort,
  storage: SnapshotOrganizationSortStorage | null = browserStorage(),
) {
  try {
    storage?.setItem(storageKey, sort);
  } catch {
    return;
  }
}

export function sortSnapshotOrganizations<T extends SortableOrganization>(
  organizations: readonly T[],
  sort: SnapshotOrganizationSort,
  settingsOrganizationOrder: readonly string[] = [],
): T[] {
  const settingsOrder = new Map<string, number>();
  settingsOrganizationOrder.forEach((name, index) => {
    const normalizedName = name.trim().toLocaleLowerCase();
    if (normalizedName && !settingsOrder.has(normalizedName)) settingsOrder.set(normalizedName, index);
  });

  return organizations
    .map((organization, index) => ({ organization, index }))
    .sort((left, right) => {
      if (sort === 'balance-count-desc') {
        return right.organization.balances.length - left.organization.balances.length || left.index - right.index;
      }
      if (sort === 'balance-count-asc') {
        return left.organization.balances.length - right.organization.balances.length || left.index - right.index;
      }
      if (sort === 'name') {
        return left.organization.name.localeCompare(right.organization.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        }) || left.index - right.index;
      }
      if (sort === 'settings-order') {
        const leftPosition = settingsOrder.get(left.organization.name.trim().toLocaleLowerCase());
        const rightPosition = settingsOrder.get(right.organization.name.trim().toLocaleLowerCase());
        return (leftPosition ?? Number.MAX_SAFE_INTEGER) - (rightPosition ?? Number.MAX_SAFE_INTEGER)
          || left.index - right.index;
      }
      return left.index - right.index;
    })
    .map(({ organization }) => organization);
}

export function reconcileSnapshotOrganizationOrder<T extends OrderableOrganization>(
  organizations: readonly T[],
  currentOrder: readonly string[],
  sort: SnapshotOrganizationSort,
  settingsOrganizationOrder: readonly string[] = [],
): string[] {
  const organizationsById = new Map(organizations.map(organization => [organization.id, organization]));
  const retainedOrder = currentOrder.filter((id, index) => (
    organizationsById.has(id) && currentOrder.indexOf(id) === index
  ));
  const retainedIds = new Set(retainedOrder);
  const addedOrganizations = organizations.filter(organization => !retainedIds.has(organization.id));

  return [
    ...retainedOrder,
    ...sortSnapshotOrganizations(addedOrganizations, sort, settingsOrganizationOrder).map(organization => organization.id),
  ];
}

export function snapshotOrganizationOrderNeedsApply<T extends OrderableOrganization>(
  organizations: readonly T[],
  currentOrder: readonly string[],
  sort: SnapshotOrganizationSort,
  settingsOrganizationOrder: readonly string[] = [],
): boolean {
  const displayedOrder = reconcileSnapshotOrganizationOrder(organizations, currentOrder, sort, settingsOrganizationOrder);
  const sortedOrder = sortSnapshotOrganizations(organizations, sort, settingsOrganizationOrder).map(organization => organization.id);
  return displayedOrder.some((id, index) => id !== sortedOrder[index]);
}
