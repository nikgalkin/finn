export const DELTA_POSITIVE_COLOR = 'var(--diff-positive, hsl(142, 45%, 55%))';
export const DELTA_NEGATIVE_COLOR = 'var(--diff-negative, hsl(0, 45%, 60%))';
export const DELTA_NEUTRAL_COLOR = 'var(--text-secondary)';

const normalizeDisplayNumber = (value: number, precision = 0.005) => Math.abs(value) < precision ? 0 : value;

export const getDeltaColor = (value: number) => {
  if (value > 0) return DELTA_POSITIVE_COLOR;
  if (value < 0) return DELTA_NEGATIVE_COLOR;
  return DELTA_NEUTRAL_COLOR;
};

export const getMoneyDeltaColor = (value: number) => getDeltaColor(normalizeDisplayNumber(value, 0.5));
export const getPercentDeltaColor = (value: number) => getDeltaColor(normalizeDisplayNumber(value));

export const formatNumber = (value: number) => Math.round(normalizeDisplayNumber(value, 0.5)).toLocaleString('en-US');

export const formatMoney = (value: number, suffix: string) => `${formatNumber(value)} ${suffix}`;

export const formatSigned = (value: number) => {
  const normalized = normalizeDisplayNumber(value, 0.5);
  return `${normalized > 0 ? '+' : ''}${formatNumber(normalized)}`;
};

export const formatSignedMoney = (value: number, suffix: string) => `${formatSigned(value)} ${suffix}`;

export const formatPercent = (value: number, fractionDigits = 2) => {
  const normalized = normalizeDisplayNumber(value);
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(fractionDigits)}%`;
};

const flowNumberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export const formatFlowNumber = (value: number) => flowNumberFormat.format(value);

export const formatFlowAmount = (value: number, currency: string) => `${formatFlowNumber(value)} ${currency}`;

const EXCHANGE_RATE_FRACTION_DIGITS = 1;

export const formatExchangeRate = (value: number, useGrouping = true) => (
  new Intl.NumberFormat('en-US', {
    useGrouping,
    maximumFractionDigits: EXCHANGE_RATE_FRACTION_DIGITS
  }).format(value)
);

export const formatNativeAmount = (value: number) => {
  const absolute = Math.abs(value);
  const maximumFractionDigits = absolute >= 1000 ? 0 : absolute >= 1 ? 2 : 6;
  return normalizeDisplayNumber(value).toLocaleString('en-US', { maximumFractionDigits });
};

export const formatCompact = (value: number) => (
  Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
);

export const formatFriendlyTime = (seconds: number) => {
  if (seconds < 120) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
};

export const formatMonth = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1));
};
