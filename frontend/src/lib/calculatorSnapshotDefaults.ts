import type { FlowEntry, ParsedSnapshot } from '../types.ts';
import {
  calculateOrganizationTotal,
  calculateSnapshotTotalAtRates,
  convertAmount
} from './finance.ts';

export type SnapshotRebalanceRow = {
  id: string;
  label: string;
  currentAmount: number;
  targetPercent: number;
};

export type SnapshotReturnFlow = {
  id: string;
  date: string;
  amount: number;
};

const roundMoney = (value: number) => {
  const adjusted = value + Math.sign(value) * Number.EPSILON;
  return Math.round(adjusted * 100) / 100;
};

export const getSnapshotPortfolioTotal = (
  snapshot: ParsedSnapshot | null,
  currency: string
) => snapshot
  ? roundMoney(calculateSnapshotTotalAtRates(snapshot, snapshot.data.rates, currency))
  : null;

export const buildSnapshotRebalanceRows = (
  snapshot: ParsedSnapshot | null,
  currency: string,
  existingTargets: ReadonlyMap<string, number> = new Map()
): SnapshotRebalanceRow[] => {
  if (!snapshot) return [];

  const organizations = snapshot.data.organizations
    .map((organization, index) => ({
      id: `snapshot-org-${organization.id || index}`,
      label: organization.name || `Organization ${index + 1}`,
      currentAmount: roundMoney(calculateOrganizationTotal(
        organization,
        snapshot.data.rates,
        currency
      ))
    }))
    .filter(organization => organization.currentAmount > 0);
  const total = organizations.reduce((sum, organization) => sum + organization.currentAmount, 0);

  return organizations.map(organization => ({
    ...organization,
    targetPercent: existingTargets.get(organization.id)
      ?? (total > 0 ? organization.currentAmount / total * 100 : 0)
  }));
};

const monthEndDate = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return `${month}-28`;
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
};

const monthMiddleDate = (month: string) => `${month}-15`;

export const buildSnapshotReturnFlows = (
  snapshots: ParsedSnapshot[],
  entries: FlowEntry[],
  currency: string
): SnapshotReturnFlow[] => {
  if (snapshots.length < 2) return [];

  const chronological = [...snapshots].sort((left, right) => left.month.localeCompare(right.month));
  const previous = chronological[chronological.length - 2];
  const latest = chronological[chronological.length - 1];
  const previousTotal = roundMoney(
    calculateSnapshotTotalAtRates(previous, previous.data.rates, currency)
  );
  const latestTotal = roundMoney(
    calculateSnapshotTotalAtRates(latest, latest.data.rates, currency)
  );

  const externalFlows = entries
    .filter(entry => (
      entry.entryType !== 'transfer'
      && entry.month > previous.month
      && entry.month <= latest.month
    ))
    .map(entry => {
      const rateSnapshot = chronological.find(snapshot => snapshot.month === entry.month) || latest;
      const netAmount = entry.direction === 'in'
        ? entry.amount * (1 - (entry.taxRate || 0) / 100)
        : entry.amount;
      const converted = convertAmount(
        netAmount,
        entry.currency,
        currency,
        rateSnapshot.data.rates
      );
      return {
        id: `flow-${entry.id}`,
        date: monthMiddleDate(entry.month),
        amount: roundMoney(entry.direction === 'in' ? -converted : converted)
      };
    })
    .filter(flow => Number.isFinite(flow.amount) && flow.amount !== 0)
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));

  return [
    {
      id: `snapshot-open-${previous.id}`,
      date: monthEndDate(previous.month),
      amount: -previousTotal
    },
    ...externalFlows,
    {
      id: `snapshot-close-${latest.id}`,
      date: monthEndDate(latest.month),
      amount: latestTotal
    }
  ];
};

export const getSnapshotFxQuote = (
  snapshot: ParsedSnapshot | null,
  fromCurrency: string,
  toCurrency: string,
  basis: number
) => {
  if (!snapshot || !fromCurrency || !toCurrency || fromCurrency === toCurrency) return null;
  const quote = convertAmount(basis, toCurrency, fromCurrency, snapshot.data.rates);
  return Number.isFinite(quote) && quote > 0 ? quote : null;
};

export const suggestFxQuoteBasis = (
  snapshot: ParsedSnapshot | null,
  fromCurrency: string,
  toCurrency: string
) => {
  const unitQuote = getSnapshotFxQuote(snapshot, fromCurrency, toCurrency, 1);
  if (unitQuote === null) return 1;
  if (unitQuote < 0.1) return 1_000;
  if (unitQuote < 1) return 100;
  return 1;
};
