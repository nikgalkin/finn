import type { FlowEntry, ParsedSnapshot } from '../types';
import { calculateFlowTax } from './cashFlow.ts';
import { convertAmount, inferRateReferenceCurrency, monthsBetween } from './finance.ts';

export type IncomeMultipleIssue = {
  kind: 'no_history' | 'missing_cash_flow' | 'missing_snapshot' | 'missing_income_snapshot' | 'missing_income_rate' | 'missing_net_worth_rate' | 'zero_average';
  month: string;
  currency?: string;
};

export type IncomeMultiplePoint = {
  month: string;
  netWorth: number | null;
  averageIncome: number | null;
  multiple: number | null;
  windowStart: string | null;
  windowEnd: string;
  windowMonths: number;
  shortHistory: boolean;
  provisional: boolean;
  issues: IncomeMultipleIssue[];
};

const monthIndex = (month: string) => {
  const [year, number] = month.split('-').map(Number);
  return year * 12 + number - 1;
};

const monthAt = (index: number) => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;

/** Only the stored reference currency may have an implicit rate of 1. */
const convertHistoricalAmount = (amount: number, from: string, to: string, snapshot?: ParsedSnapshot) => {
  if (from === to) return amount;
  if (!snapshot) return NaN;
  const rates = snapshot.data.sourceRates || snapshot.data.rates;
  const reference = inferRateReferenceCurrency(rates);
  return [from, to].every(currency => {
    const rate = rates[currency] === undefined && currency === reference ? 1 : Number(rates[currency]);
    return Number.isFinite(rate) && rate > 0;
  }) ? convertAmount(amount, from, to, rates) : NaN;
};

export function calculateNetWorthIncome(
  snapshots: ParsedSnapshot[],
  entries: FlowEntry[],
  baseCurrency: string,
  today: Date
): IncomeMultiplePoint[] {
  if (snapshots.length === 0) return [];

  const snapshotsByMonth = new Map(snapshots.map(snapshot => [snapshot.month, snapshot]));
  const incomeByMonth = new Map<string, { income: number; issues: IncomeMultipleIssue[] }>();
  for (const entry of entries) {
    const month = entry.month;
    const item = incomeByMonth.get(month) || { income: 0, issues: [] };
    incomeByMonth.set(month, item);
    if (entry.entryType !== 'external' || entry.direction !== 'in') continue;
    const net = entry.amount - calculateFlowTax(entry);
    if (net === 0) continue;
    const snapshot = snapshotsByMonth.get(month);
    const converted = convertHistoricalAmount(net, entry.currency, baseCurrency, snapshot);
    if (!Number.isFinite(converted)) {
      item.issues.push({ kind: snapshot ? 'missing_income_rate' : 'missing_income_snapshot', month, currency: entry.currency });
    } else item.income += converted;
  }
  const firstFlowMonth = [...incomeByMonth.keys()].sort()[0];
  const firstIndex = Math.min(...snapshots.map(snapshot => monthIndex(snapshot.month)));
  const lastIndex = Math.max(...snapshots.map(snapshot => monthIndex(snapshot.month)));
  // Income before the first snapshot has no corresponding historical rate
  // record. Treat the first snapshot as the start of the comparable history.
  const historyStart = firstFlowMonth
    ? monthAt(Math.max(firstIndex, monthIndex(firstFlowMonth)))
    : null;
  const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  return Array.from({ length: lastIndex - firstIndex + 1 }, (_, offset) => {
    const month = monthAt(firstIndex + offset);
    const snapshot = snapshotsByMonth.get(month);
    const issues: IncomeMultipleIssue[] = [];
    let netWorth: number | null = null;
    if (!snapshot) {
      issues.push({ kind: 'missing_snapshot', month });
    } else {
      let total = 0;
      for (const org of snapshot.data.organizations) {
        for (const balance of org.balances) {
          if (Number(balance.amount) === 0) continue;
          const amount = convertHistoricalAmount(Number(balance.amount), balance.currency, baseCurrency, snapshot);
          if (!Number.isFinite(amount)) issues.push({ kind: 'missing_net_worth_rate', month, currency: balance.currency });
          else total += amount;
        }
      }
      if (!issues.length) {
        if (Number.isFinite(total)) netWorth = total;
        else issues.push({ kind: 'missing_net_worth_rate', month });
      }
    }

    let windowStart: string | null = null;
    let windowMonths = 0;
    let averageIncome: number | null = null;
    if (!historyStart || month < historyStart) {
      issues.push({ kind: 'no_history', month });
    } else {
      windowStart = monthAt(Math.max(monthIndex(historyStart), monthIndex(month) - 11));
      windowMonths = monthsBetween(windowStart, month) + 1;
      let incomeTotal = 0;
      for (let index = monthIndex(windowStart); index <= monthIndex(month); index++) {
        const incomeMonth = monthAt(index);
        const item = incomeByMonth.get(incomeMonth);
        if (!item) issues.push({ kind: 'missing_cash_flow', month: incomeMonth });
        else if (item.issues.length) issues.push(...item.issues);
        else incomeTotal += item.income;
      }
      if (!issues.some(issue => issue.kind === 'missing_cash_flow' || issue.kind === 'missing_income_snapshot' || issue.kind === 'missing_income_rate')) {
        averageIncome = incomeTotal / windowMonths;
        if (!Number.isFinite(averageIncome)) {
          averageIncome = null;
          issues.push({ kind: 'missing_income_rate', month });
        } else if (averageIncome <= 0) issues.push({ kind: 'zero_average', month });
      }
    }
    const quotient = netWorth !== null && averageIncome !== null && averageIncome > 0
      ? netWorth / averageIncome : null;
    const multiple = quotient !== null && Number.isFinite(quotient) ? quotient : null;
    if (quotient !== null && multiple === null) issues.push({ kind: 'missing_income_rate', month });
    return {
      month, netWorth, averageIncome, multiple, windowStart, windowEnd: month,
      windowMonths, shortHistory: windowMonths > 0 && windowMonths < 12,
      provisional: month >= todayMonth, issues
    };
  });
}
