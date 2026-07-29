/**
 * Assembles UPDATE statements from a picked result cell. Pure and app-free so it
 * stays directly testable.
 */

export type WhereOperator =
  | '=' | '<>' | '>' | '>=' | '<' | '<='
  | 'BETWEEN' | 'IN' | 'LIKE' | 'IS NULL' | 'IS NOT NULL';

export const WHERE_OPERATORS: WhereOperator[] = [
  '=', '<>', '>', '>=', '<', '<=', 'BETWEEN', 'IN', 'LIKE', 'IS NULL', 'IS NOT NULL'
];

/** Operators that need no operand at all. */
export const isUnaryOperator = (operator: WhereOperator) =>
  operator === 'IS NULL' || operator === 'IS NOT NULL';

export type WhereClause = {
  /** `column` compares a table column; `json` compares a value inside a JSON column. */
  mode: 'column' | 'json';
  column: string;
  /** JSON mode: the column holding the document. */
  jsonColumn: string;
  /** JSON mode: path inside the document, e.g. `$.organizations[0].id`. */
  jsonPath: string;
  /** JSON mode: match the path against any element of its array, not just one index. */
  anyElement: boolean;
  operator: WhereOperator;
  value: string;
  /** Upper bound, used by BETWEEN only. */
  secondValue: string;
};

/** Quotes identifiers that are not plain words, and escapes embedded quotes. */
export const quoteIdentifier = (name: string): string =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;

/**
 * Turns text typed by a person into a SQL literal.
 *
 * Numbers stay bare so comparisons work numerically, a bare NULL becomes the
 * keyword, and text that is already quoted is passed through untouched so the
 * user can always take manual control.
 */
export const toSqlInputLiteral = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed === '') return "''";
  if (trimmed.toUpperCase() === 'NULL') return 'NULL';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if (trimmed.length > 1 && trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed;
  return `'${trimmed.replace(/'/g, "''")}'`;
};

/** Renders a value read back from the database as editable text. */
export const toEditableText = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return value;
  // Objects and arrays come from picking a branch of a JSON tree.
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/**
 * Literal for the third argument of json_set. Object and array text has to go
 * through json(), otherwise SQLite stores it as a quoted string rather than as
 * nested JSON.
 */
export const toJsonValueLiteral = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return `json('${trimmed.replace(/'/g, "''")}')`;
    } catch {
      // not valid JSON after all, fall through and treat it as plain text
    }
  }
  return toSqlInputLiteral(trimmed);
};

/** Applies the operator and its operands to an already-rendered left-hand side. */
const renderComparison = (operand: string, clause: WhereClause): string | null => {
  if (isUnaryOperator(clause.operator)) {
    return `${operand} ${clause.operator}`;
  }

  if (clause.operator === 'BETWEEN') {
    if (!clause.value.trim() || !clause.secondValue.trim()) return null;
    return `${operand} BETWEEN ${toSqlInputLiteral(clause.value)} AND ${toSqlInputLiteral(clause.secondValue)}`;
  }

  if (clause.operator === 'IN') {
    const items = clause.value
      .split(',')
      .map(item => item.trim())
      .filter(item => item !== '');
    if (items.length === 0) return null;
    return `${operand} IN (${items.map(toSqlInputLiteral).join(', ')})`;
  }

  if (!clause.value.trim()) return null;
  return `${operand} ${clause.operator} ${toSqlInputLiteral(clause.value)}`;
};

/**
 * Splits a JSON path at its first array index, so the index can be replaced by a
 * scan over every element.
 *
 * `$.organizations[0].id` becomes the array `$.organizations` plus the path
 * `$.id` within each element. Returns null when the path has no array index and
 * therefore nothing to iterate.
 */
export const splitJsonPathAtFirstIndex = (
  path: string
): { arrayPath: string; elementPath: string } | null => {
  const open = path.indexOf('[');
  if (open < 0) return null;
  const close = path.indexOf(']', open);
  if (close < 0) return null;

  const arrayPath = path.slice(0, open);
  if (!arrayPath) return null;

  const rest = path.slice(close + 1);
  return { arrayPath, elementPath: rest ? `$${rest}` : '' };
};

/** Escapes a JSON path for embedding in a single-quoted SQL string. */
const quoteJsonPath = (path: string) => path.replace(/'/g, "''");

/**
 * The element-level test used inside a json_each scan, e.g.
 * `json_extract(value, '$.id') = '123'`. Exposed so the same condition can also
 * drive a rewrite of the matching elements.
 */
export const buildJsonElementMatch = (clause: WhereClause): string | null => {
  const split = splitJsonPathAtFirstIndex(clause.jsonPath.trim());
  if (!split) return null;

  // json_each exposes each element as `value`; an empty element path means the
  // element itself is being compared.
  const operand = split.elementPath
    ? `json_extract(value, '${quoteJsonPath(split.elementPath)}')`
    : 'value';
  return renderComparison(operand, clause);
};

const buildJsonWhereClause = (clause: WhereClause): string | null => {
  const path = clause.jsonPath.trim();
  const column = clause.jsonColumn.trim();
  if (!path || !column) return null;
  const target = quoteIdentifier(column);

  if (!clause.anyElement) {
    return renderComparison(`json_extract(${target}, '${quoteJsonPath(path)}')`, clause);
  }

  const split = splitJsonPathAtFirstIndex(path);
  if (!split) return null;

  const comparison = buildJsonElementMatch(clause);
  if (!comparison) return null;

  return `EXISTS (SELECT 1 FROM json_each(${target}, '${quoteJsonPath(split.arrayPath)}') WHERE ${comparison})`;
};

export const buildWhereClause = (clause: WhereClause): string | null => {
  if (clause.mode === 'json') return buildJsonWhereClause(clause);

  const column = clause.column.trim();
  if (!column) return null;
  return renderComparison(quoteIdentifier(column), clause);
};

type UpdateStatementInput = {
  table: string;
  /** Right-hand side of the assignment, already rendered. */
  assignment: string;
  where: WhereClause;
};

export const buildUpdateStatement = ({ table, assignment, where }: UpdateStatementInput): string => {
  const clause = buildWhereClause(where);
  const lines = [
    `UPDATE ${quoteIdentifier(table)}`,
    `SET ${assignment}`,
    // Refusing to emit an unqualified UPDATE keeps an unfinished condition from
    // silently becoming "every row in the table".
    clause ? `WHERE ${clause};` : `WHERE /* add a condition */;`
  ];
  return lines.join('\n');
};

/** `column = <literal>` for an ordinary cell. */
export const buildColumnAssignment = (column: string, text: string): string =>
  `${quoteIdentifier(column)} = ${toSqlInputLiteral(text)}`;

/** `column = json_set(column, '$.path', <literal>)` for a JSON cell. */
export const buildJsonAssignment = (column: string, path: string, text: string): string =>
  `${quoteIdentifier(column)} = json_set(${quoteIdentifier(column)}, '${path}', ${toJsonValueLiteral(text)})`;

type MatchedElementAssignment = {
  column: string;
  /** Array being rewritten, e.g. `$.organizations`. */
  arrayPath: string;
  /** Field inside each element to set; empty replaces the element itself. */
  elementPath: string;
  text: string;
  /** Element-level test, from {@link buildJsonElementMatch}. */
  match: string;
};

/**
 * Rewrites an array so that *every* element passing the test is updated, rather
 * than one fixed index.
 *
 * Elements are passed through as bare `value`. Wrapping them in json() looks
 * tidier but fails on arrays of strings, where json('cash') is malformed.
 */
export const buildMatchedElementAssignment = ({
  column,
  arrayPath,
  elementPath,
  text,
  match
}: MatchedElementAssignment): string => {
  const target = quoteIdentifier(column);
  const literal = toJsonValueLiteral(text);
  const replacement = elementPath
    ? `json_set(value, '${quoteJsonPath(elementPath)}', ${literal})`
    : literal;

  return `${target} = json_set(${target}, '${quoteJsonPath(arrayPath)}', `
    + `(SELECT json_group_array(CASE WHEN ${match} THEN ${replacement} ELSE value END) `
    + `FROM json_each(${target}, '${quoteJsonPath(arrayPath)}')))`;
};

/**
 * Condition column to start from when the cell is clicked normally: a primary
 * key the result actually carries a value for, otherwise the first column it
 * does carry. Alt-clicking a cell bypasses this and conditions on that column.
 */
export const defaultWhereColumn = (
  tableColumns: { name: string; primaryKey: boolean }[],
  rowValues: Record<string, unknown>,
  fallback: string
): string => {
  const present = tableColumns.filter(column => rowValues[column.name] !== undefined);
  const primary = present.find(column => column.primaryKey);
  if (primary) return primary.name;
  if (present.length > 0) return present[0].name;
  return fallback;
};

/**
 * Lowest and highest of the values the result already shows for a column, used
 * to prefill BETWEEN with the range currently on screen.
 */
export const rangeFromValues = (values: unknown[]): { from: string; to: string } | null => {
  const usable = values.filter(value => value !== null && value !== undefined);
  if (usable.length < 2) return null;

  const allNumeric = usable.every(value => typeof value === 'number');
  const sorted = [...usable].sort((left, right) => {
    if (allNumeric) return (left as number) - (right as number);
    return String(left).localeCompare(String(right));
  });

  const from = toEditableText(sorted[0]);
  const to = toEditableText(sorted[sorted.length - 1]);
  return from === to ? null : { from, to };
};
