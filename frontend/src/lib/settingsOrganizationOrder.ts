import type { ConfiguredOrganization } from '../types';

export function moveActiveOrganization(
  organizations: readonly ConfiguredOrganization[],
  fromIndex: number,
  toIndex: number,
): ConfiguredOrganization[] {
  if (
    fromIndex === toIndex
    || organizations[fromIndex]?.archivedAt
    || organizations[toIndex]?.archivedAt
  ) return [...organizations];

  const activeIndexes = organizations.flatMap((organization, index) => (
    organization.archivedAt ? [] : [index]
  ));
  const fromPosition = activeIndexes.indexOf(fromIndex);
  const toPosition = activeIndexes.indexOf(toIndex);
  if (fromPosition < 0 || toPosition < 0) return [...organizations];

  const reorderedActiveOrganizations = activeIndexes.map(index => organizations[index]);
  const [movedOrganization] = reorderedActiveOrganizations.splice(fromPosition, 1);
  reorderedActiveOrganizations.splice(toPosition, 0, movedOrganization);

  const reorderedOrganizations = [...organizations];
  activeIndexes.forEach((index, position) => {
    reorderedOrganizations[index] = reorderedActiveOrganizations[position];
  });
  return reorderedOrganizations;
}
