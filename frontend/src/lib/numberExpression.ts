const SHORTHAND_MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  kk: 1_000_000,
  m: 1_000_000,
  b: 1_000_000_000,
  mm: 1_000_000_000_000
};

const expandNumberShorthand = (expression: string) => expression.replace(
  /((?:\d+(?:\.\d+)?|\.\d+))(kk|mm|k|m|b)(?![a-z])/gi,
  (_, amount: string, suffix: string) => `(${amount}*${SHORTHAND_MULTIPLIERS[suffix.toLowerCase()]})`
);

const expandMonthlyAnnualRate = (expression: string) => {
  const match = expression.match(/^(.+)([+-])\s*((?:\d+(?:\.\d+)?|\.\d+))%\s*$/);
  if (!match) return expression;
  const base = match[1].trim();
  const operator = match[2];
  const annualRate = match[3];
  return `((${base})${operator}((${base})*${annualRate}/100/12))`;
};

export const evaluateNumberExpression = (expression: string | number): number => {
  if (typeof expression === 'number') return expression;

  try {
    const normalized = expression.replace(/,/g, '.');
    const expanded = expandMonthlyAnnualRate(expandNumberShorthand(normalized));
    if (/[a-z%]/i.test(expanded)) return 0;

    const sanitized = expanded.replace(/[^-()\d/*+.]/g, '');
    if (!sanitized) return 0;

    const result = new Function(`return ${sanitized}`)();
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
};
