import type { FlowDirection, FlowEntry } from '../types';

export type FlowCsvEntry = {
  month: string;
  direction: FlowDirection;
  counterparty: string;
  amount: number;
  currency: string;
  taxRate: number;
  category: string;
  comment: string;
};

export type FlowCsvPreview = {
  fileName: string;
  entries: FlowCsvEntry[];
  errors: string[];
  duplicates: FlowCsvDuplicate[];
};

export type FlowCsvDuplicate = {
  entryIndex: number;
  reason: 'existing' | 'file';
};

const ALLOWED_HEADERS = ['month', 'direction', 'counterparty', 'amount', 'currency', 'tax_rate', 'category', 'comment'] as const;
const REQUIRED_HEADERS = ['month', 'direction', 'counterparty', 'amount', 'currency'] as const;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const CSV_SEPARATOR = ';';

const parseNumber = (value: string) => Number(/^[-+]?\d+,\d+$/.test(value) ? value.replace(',', '.') : value);

const flowEntryKey = (entry: FlowCsvEntry | FlowEntry) => [
  entry.month.trim(),
  entry.direction.trim().toLowerCase(),
  entry.counterparty.trim(),
  entry.currency.trim().toUpperCase(),
  String(Number(entry.amount)),
  String(entry.direction === 'out' ? 0 : Number(entry.taxRate || 0)),
  entry.category.trim(),
  entry.comment.trim()
].join('\u001f');

export const findFlowCsvDuplicates = (csvEntries: FlowCsvEntry[], existingEntries: FlowEntry[]): FlowCsvDuplicate[] => {
  const existingKeys = new Set(existingEntries.map(flowEntryKey));
  const seenFileKeys = new Set<string>();
  const duplicates: FlowCsvDuplicate[] = [];

  csvEntries.forEach((entry, entryIndex) => {
    const key = flowEntryKey(entry);
    if (existingKeys.has(key)) duplicates.push({ entryIndex, reason: 'existing' });
    else if (seenFileKeys.has(key)) duplicates.push({ entryIndex, reason: 'file' });
    seenFileKeys.add(key);
  });

  return duplicates;
};

const parseCsvRows = (source: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === CSV_SEPARATOR && !quoted) {
      row.push(value);
      value = '';
      continue;
    }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
      value = '';
      continue;
    }
    value += character;
  }

  if (quoted) throw new Error('Unclosed quoted value.');
  row.push(value);
  if (row.some(cell => cell.trim() !== '')) rows.push(row);
  return rows;
};

export const parseFlowCsv = (text: string, fileName: string, configuredCurrencies: string[]): FlowCsvPreview => {
  let rows: string[][];
  try {
    rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    return { fileName, entries: [], errors: [error instanceof Error ? error.message : 'Could not parse CSV.'], duplicates: [] };
  }

  if (rows.length === 0) return { fileName, entries: [], errors: ['The CSV file is empty.'], duplicates: [] };
  if (rows[0].length === 1 && rows[0][0].includes(',')) {
    return { fileName, entries: [], errors: ['Use a semicolon (;) as the CSV separator.'], duplicates: [] };
  }

  const headers = rows[0].map(header => header.trim().toLowerCase());
  const errors: string[] = [];
  const duplicateHeaders = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) errors.push(`Duplicate headers: ${Array.from(new Set(duplicateHeaders)).join(', ')}.`);
  const unknownHeaders = headers.filter(header => header && !ALLOWED_HEADERS.includes(header as typeof ALLOWED_HEADERS[number]));
  if (unknownHeaders.length > 0) errors.push(`Unknown headers: ${Array.from(new Set(unknownHeaders)).join(', ')}.`);
  const missingHeaders = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missingHeaders.length > 0) errors.push(`Missing required headers: ${missingHeaders.join(', ')}.`);
  if (errors.length > 0) return { fileName, entries: [], errors, duplicates: [] };

  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const configuredCurrencySet = new Set(configuredCurrencies.map(currency => currency.trim().toUpperCase()).filter(Boolean));
  const entries: FlowCsvEntry[] = [];

  rows.slice(1).forEach((row, rowIndex) => {
    const csvRowNumber = rowIndex + 2;
    const read = (header: string) => row[headerIndex.get(header) ?? -1]?.trim() || '';
    const month = read('month');
    const direction = read('direction').toLowerCase();
    const counterparty = read('counterparty');
    const amountText = read('amount');
    const amount = parseNumber(amountText);
    const currency = read('currency').toUpperCase();
    const taxRateText = read('tax_rate');
    const taxRate = taxRateText === '' ? 0 : parseNumber(taxRateText);
    const rowErrors: string[] = [];

    if (row.length > headers.length) rowErrors.push('has more values than headers');
    if (!MONTH_PATTERN.test(month)) rowErrors.push('month must use YYYY-MM');
    if (direction !== 'in' && direction !== 'out') rowErrors.push('direction must be in or out');
    if (!counterparty) rowErrors.push('counterparty is required');
    if (!amountText || !Number.isFinite(amount) || amount <= 0) rowErrors.push('amount must be a positive number');
    if (!currency) rowErrors.push('currency is required');
    else if (configuredCurrencySet.size > 0 && !configuredCurrencySet.has(currency)) rowErrors.push(`${currency} is not configured in Settings`);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) rowErrors.push('tax_rate must be from 0 to 100');
    if (direction === 'out' && taxRate !== 0) rowErrors.push('tax_rate must be empty or 0 for outgoing entries');

    if (rowErrors.length > 0) {
      errors.push(`Row ${csvRowNumber}: ${rowErrors.join('; ')}.`);
      return;
    }

    entries.push({
      month,
      direction: direction as FlowDirection,
      counterparty,
      amount,
      currency,
      taxRate,
      category: read('category'),
      comment: read('comment')
    });
  });

  if (entries.length > 5000) errors.push('A single import cannot contain more than 5000 entries.');
  if (entries.length === 0 && errors.length === 0) errors.push('The CSV file has a header but no entries.');
  return { fileName, entries, errors, duplicates: [] };
};
