import type { Balance, ParsedSnapshot } from '../types';

export type DiffStatus = 'new' | 'deleted' | 'up' | 'down' | 'stable';

export type DiffBalanceNode = {
  currency: string;
  currentTags: string[];
  previousTags: string[];
  tagsChanged: boolean;
  comment?: string;
  previousAmt: number;
  currentAmt: number;
  delta: number;
  deltaPercent: number;
  status: DiffStatus;
};

export type DiffOrgNode = {
  orgName: string;
  comment?: string;
  balances: DiffBalanceNode[];
  hasChanges: boolean;
};

type AggregatedBalance = {
  amount: number;
  tags: string[];
  comments: string[];
};

export const normalizeTags = (tags?: string[]) => {
  return (tags && tags.length > 0 ? tags : ['untagged']).filter(Boolean);
};

export const areTagsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((tag, index) => tag === rightSorted[index]);
};

const aggregateBalancesByCurrency = (balances?: Balance[]) => {
  const byCurrency = new Map<string, AggregatedBalance>();

  (balances || []).forEach(balance => {
    if (!balance.currency) return;
    const aggregated = byCurrency.get(balance.currency) || { amount: 0, tags: [], comments: [] };
    aggregated.amount += Number(balance.amount || 0);
    normalizeTags(balance.tags).forEach(tag => {
      if (!aggregated.tags.includes(tag)) aggregated.tags.push(tag);
    });
    const comment = balance.comment?.trim();
    if (comment) aggregated.comments.push(comment);
    byCurrency.set(balance.currency, aggregated);
  });

  return byCurrency;
};

const pickComment = (current?: AggregatedBalance, previous?: AggregatedBalance) => {
  const comments = current?.comments.length ? current.comments : previous?.comments || [];
  return comments.length > 0 ? comments.join('\n') : undefined;
};

export const buildTreeDiffData = (
  current: ParsedSnapshot,
  previous: ParsedSnapshot | null,
  onlyChanges: boolean
): DiffOrgNode[] => {
  const currentOrgs = current.data.organizations;
  const previousOrgs = previous ? previous.data.organizations : [];

  const orgNames = new Set<string>();
  currentOrgs.forEach(org => org.name && orgNames.add(org.name));
  previousOrgs.forEach(org => org.name && orgNames.add(org.name));

  const tree: DiffOrgNode[] = Array.from(orgNames).map(orgName => {
    const currentOrg = currentOrgs.find(org => org.name === orgName);
    const previousOrg = previousOrgs.find(org => org.name === orgName);

    const currentBalances = aggregateBalancesByCurrency(currentOrg?.balances);
    const previousBalances = aggregateBalancesByCurrency(previousOrg?.balances);
    const currencies = new Set([...currentBalances.keys(), ...previousBalances.keys()]);

    let hasChanges = false;

    const balances: DiffBalanceNode[] = Array.from(currencies).map(currency => {
      const currentBalance = currentBalances.get(currency);
      const previousBalance = previousBalances.get(currency);

      const currentAmt = currentBalance?.amount || 0;
      const previousAmt = previousBalance?.amount || 0;
      const delta = currentAmt - previousAmt;
      const deltaPercent = previousAmt > 0 ? (delta / previousAmt) * 100 : 0;
      const currentTags = normalizeTags(currentBalance?.tags);
      const previousTags = normalizeTags(previousBalance?.tags);
      const tagsChanged = Boolean(currentBalance || previousBalance) && !areTagsEqual(currentTags, previousTags);
      const comment = pickComment(currentBalance, previousBalance);

      if (Math.abs(delta) >= 0.01 || tagsChanged) {
        hasChanges = true;
      }

      let status: DiffStatus = 'stable';
      if (!previousBalance && currentBalance) status = 'new';
      else if (previousBalance && !currentBalance) status = 'deleted';
      else if (delta > 0) status = 'up';
      else if (delta < 0) status = 'down';

      return { currency, currentTags, previousTags, tagsChanged, comment, currentAmt, previousAmt, delta, deltaPercent, status };
    }).sort((a, b) => a.currency.localeCompare(b.currency));

    return { orgName, comment: currentOrg?.comment || previousOrg?.comment || undefined, balances, hasChanges };
  }).sort((a, b) => a.orgName.localeCompare(b.orgName));

  if (!onlyChanges) return tree;

  return tree
    .filter(org => org.hasChanges)
    .map(org => ({
      ...org,
      balances: org.balances.filter(balance => Math.abs(balance.delta) >= 0.01 || balance.tagsChanged)
    }));
};
