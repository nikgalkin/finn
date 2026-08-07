// Two ways a shortcut arrives in Cyrillic: written on purpose, where к/м/б mean
// the same as k/m/b, or typed with the wrong layout still on, where the k, m and
// b keys emit л, ь and и. Both are translated rather than dropped, because
// dropping the letter would silently turn "5к" into 5 rather than 5000.
const LAYOUT_ALIASES: Record<string, string> = {
  к: 'k',
  К: 'k',
  л: 'k',
  Л: 'k',
  м: 'm',
  М: 'm',
  ь: 'm',
  Ь: 'm',
  б: 'b',
  Б: 'b',
  и: 'b',
  И: 'b'
};

// A run only counts as a shortcut when it is glued to a digit and no other
// letter follows it, so "1000 руб" and "5 литров" keep no translated leftovers.
const CYRILLIC_SHORTHAND = /(\d)([кКлЛмМьЬбБиИ]+)(?!\p{L})/gu;

const DISALLOWED_INPUT_CHARACTER = /[^\d\s.,+\-*/()%kKmMbB]/;

export const normalizeNumberExpressionInput = (value: string): string | null => {
  const translated = value.replace(CYRILLIC_SHORTHAND, (_, digit: string, shorthand: string) => (
    digit + Array.from(shorthand).map(character => LAYOUT_ALIASES[character]).join('')
  ));
  return DISALLOWED_INPUT_CHARACTER.test(translated) ? null : translated;
};

export const substituteExpressionBase = (expression: string, shownBase: string, exactBase: string) => (
  shownBase && expression.startsWith(shownBase)
    ? `${exactBase}${expression.slice(shownBase.length)}`
    : expression
);

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

const parseArithmeticExpression = (expression: string): number | null => {
  let position = 0;

  const parseNumber = (): number | null => {
    const match = expression.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) return null;
    position += match[0].length;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  };

  const parsePrimary = (): number | null => {
    if (expression[position] === '(') {
      position += 1;
      const value = parseExpression();
      if (value === null || expression[position] !== ')') return null;
      position += 1;
      return value;
    }
    return parseNumber();
  };

  const parseUnary = (): number | null => {
    if (expression[position] === '+' || expression[position] === '-') {
      const operator = expression[position];
      position += 1;
      const value = parseUnary();
      if (value === null) return null;
      return operator === '-' ? -value : value;
    }
    return parsePrimary();
  };

  const parseTerm = (): number | null => {
    let value = parseUnary();
    if (value === null) return null;

    while (expression[position] === '*' || expression[position] === '/') {
      const operator = expression[position];
      position += 1;
      const right = parseUnary();
      if (right === null) return null;
      value = operator === '*' ? value * right : value / right;
      if (!Number.isFinite(value)) return null;
    }
    return value;
  };

  function parseExpression(): number | null {
    let value = parseTerm();
    if (value === null) return null;

    while (expression[position] === '+' || expression[position] === '-') {
      const operator = expression[position];
      position += 1;
      const right = parseTerm();
      if (right === null) return null;
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  const value = parseExpression();
  return value !== null && position === expression.length && Number.isFinite(value) ? value : null;
};

export const parseNumberExpression = (expression: string | number): number | null => {
  if (typeof expression === 'number') return Number.isFinite(expression) ? expression : null;

  const accepted = normalizeNumberExpressionInput(expression);
  if (accepted === null) return null;

  const normalized = accepted.replace(/\s/g, '').replace(/,/g, '.');
  const expanded = expandMonthlyAnnualRate(expandNumberShorthand(normalized));
  if (!expanded || /[a-z%]/i.test(expanded) || /\+\+|--/.test(expanded)) return null;
  return parseArithmeticExpression(expanded);
};
