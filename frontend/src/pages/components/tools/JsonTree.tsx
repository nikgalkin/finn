import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { appendJsonPath, collectBranchPaths, describeJsonValue } from '../../../lib/sqlJson';

/** Depth kept open when a value is first shown: the root and its direct children. */
const INITIAL_OPEN_DEPTH = 1;

type JsonNodeProps = {
  label: string | null;
  value: unknown;
  path: string;
  depth: number;
  selectedPath: string | null;
  openPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string, value: unknown) => void;
};

const isBranch = (value: unknown) => value !== null && typeof value === 'object';

function JsonNode({
  label,
  value,
  path,
  depth,
  selectedPath,
  openPaths,
  onToggle,
  onSelect
}: JsonNodeProps) {
  const entries = useMemo<[string | number, unknown][]>(() => {
    if (!isBranch(value)) return [];
    if (Array.isArray(value)) return value.map((item, index) => [index, item]);
    return Object.entries(value as Record<string, unknown>);
  }, [value]);

  const selected = selectedPath === path;

  if (!isBranch(value)) {
    const type = value === null ? 'null' : typeof value;
    return (
      <button
        type="button"
        className={`json-node json-leaf${selected ? ' is-selected' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(path, value)}
      >
        {label !== null && <span className="json-key">{label}</span>}
        <span className={`json-value is-${type}`}>
          {typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </button>
    );
  }

  const open = openPaths.has(path);

  return (
    <div className="json-branch">
      <div className={`json-node${selected ? ' is-selected' : ''}`} style={{ paddingLeft: `${depth * 12}px` }}>
        <button
          type="button"
          className="json-toggle"
          aria-label={open ? 'Collapse' : 'Expand'}
          onClick={() => onToggle(path)}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button type="button" className="json-branch-label" onClick={() => onSelect(path, value)}>
          {label !== null && <span className="json-key">{label}</span>}
          <span className="json-meta">{describeJsonValue(value)}</span>
        </button>
      </div>
      {open && entries.map(([key, child]) => (
        <JsonNode
          key={String(key)}
          label={String(key)}
          value={child}
          path={appendJsonPath(path, key)}
          depth={depth + 1}
          selectedPath={selectedPath}
          openPaths={openPaths}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

type JsonTreeProps = {
  value: unknown;
  selectedPath: string | null;
  onSelect: (path: string, value: unknown) => void;
};

export function JsonTree({ value, selectedPath, onSelect }: JsonTreeProps) {
  // Open state lives here rather than in each node, so the whole tree can be
  // expanded or collapsed at once.
  const [openPaths, setOpenPaths] = useState<Set<string>>(
    () => new Set(collectBranchPaths(value, '$', INITIAL_OPEN_DEPTH))
  );

  useEffect(() => {
    setOpenPaths(new Set(collectBranchPaths(value, '$', INITIAL_OPEN_DEPTH)));
  }, [value]);

  const allBranches = useMemo(() => collectBranchPaths(value), [value]);

  const toggle = (path: string) => {
    setOpenPaths(current => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const nothingToToggle = allBranches.length <= 1;

  return (
    <>
      <div className="json-tree-toolbar">
        <button
          type="button"
          className="btn"
          onClick={() => setOpenPaths(new Set(allBranches))}
          disabled={nothingToToggle || openPaths.size === allBranches.length}
        >
          <ChevronsUpDown size={12} /> Expand all
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setOpenPaths(new Set())}
          disabled={openPaths.size === 0}
        >
          <ChevronsDownUp size={12} /> Collapse all
        </button>
      </div>
      <JsonNode
        label={null}
        value={value}
        path="$"
        depth={0}
        selectedPath={selectedPath}
        openPaths={openPaths}
        onToggle={toggle}
        onSelect={onSelect}
      />
    </>
  );
}
