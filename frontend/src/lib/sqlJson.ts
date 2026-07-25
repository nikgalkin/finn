/**
 * Pure helpers for presenting SQL values and building SQLite JSON expressions.
 * Kept free of app imports so they stay directly testable.
 */

export type JsonCell = {
  /** The decoded object or array. */
  value: unknown;
  /** A compact stand-in shown inside the results table. */
  preview: string;
};

export const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

/** Kept free of braces: the chip in the results table already carries an icon. */
export const formatJsonPreview = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  return `${keys.length} key${keys.length === 1 ? '' : 's'}`;
};

/**
 * Recognises cells holding a JSON object or array. Scalars are left alone: a
 * bare number or quoted word is valid JSON but reads better as a plain value.
 */
export const parseJsonCell = (value: unknown): JsonCell | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed === null || typeof parsed !== 'object') return null;
    return { value: parsed, preview: formatJsonPreview(parsed) };
  } catch {
    return null;
  }
};

/** Extends a SQLite JSON path, quoting keys that are not plain identifiers. */
export const appendJsonPath = (base: string, key: string | number): string => {
  if (typeof key === 'number') return `${base}[${key}]`;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `${base}.${key}`;
  return `${base}."${key.replace(/"/g, '""')}"`;
};

/** Renders a value as a SQL literal for generated json_set snippets. */
export const toSqlLiteral = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  return `json('${JSON.stringify(value).replace(/'/g, "''")}')`;
};

/**
 * Paths of every object or array inside a value, in document order. Used to
 * expand or collapse the whole tree at once; `maxDepth` builds the initial
 * partially-expanded view (the root counts as depth 0).
 */
export const collectBranchPaths = (
  value: unknown,
  basePath = '$',
  maxDepth = Number.POSITIVE_INFINITY
): string[] => {
  const paths: string[] = [];

  const walk = (node: unknown, path: string, depth: number) => {
    if (node === null || typeof node !== 'object') return;
    if (depth > maxDepth) return;
    paths.push(path);

    const entries: [string | number, unknown][] = Array.isArray(node)
      ? node.map((item, index) => [index, item])
      : Object.entries(node as Record<string, unknown>);

    for (const [key, child] of entries) {
      walk(child, appendJsonPath(path, key), depth + 1);
    }
  };

  walk(value, basePath, 0);
  return paths;
};

export const describeJsonValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array · ${value.length}`;
  if (typeof value === 'object') return `object · ${Object.keys(value as object).length}`;
  return typeof value;
};
