import type { CSSProperties, ReactNode } from 'react';

export type GraphTooltipRow = {
  key?: string;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  color?: string;
  markerColor?: string;
};

type GraphTooltipProps = {
  title?: ReactNode;
  titleValue?: ReactNode;
  rows?: GraphTooltipRow[];
  children?: ReactNode;
  style?: CSSProperties;
};

export function GraphTooltip({ title, titleValue, rows, children, style }: GraphTooltipProps) {
  return (
    <div className="graph-tooltip" style={style}>
      {(title !== undefined || titleValue !== undefined) && (
        <div className="graph-tooltip-header">
          <strong>{title}</strong>
          {titleValue !== undefined && <strong>{titleValue}</strong>}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="graph-tooltip-rows">
          {rows.map((row, index) => (
            <div key={row.key ?? `${index}`} className={`graph-tooltip-row${row.trailing === undefined ? ' is-two-column' : ''}`}>
              <span className="graph-tooltip-label" style={{ color: row.color }}>
                {row.markerColor && <i style={{ background: row.markerColor }} />}
                {row.label}
              </span>
              <span className="graph-tooltip-value" style={{ color: row.color }}>
                <strong>{row.value}</strong>
                {row.detail !== undefined && <small>{row.detail}</small>}
              </span>
              {row.trailing !== undefined && <strong className="graph-tooltip-trailing">{row.trailing}</strong>}
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

type SimpleGraphTooltipProps = {
  active?: boolean;
  payload?: any[];
  label?: ReactNode;
  formatter?: (value: any, name: any, item: any) => ReactNode | [ReactNode, ReactNode];
  sortByValue?: boolean;
  style?: CSSProperties;
};

export function SimpleGraphTooltip({ active, payload, label, formatter, sortByValue = false, style }: SimpleGraphTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const entries = payload.filter(item => item?.value !== undefined && item?.value !== null);
  if (sortByValue) entries.sort((left, right) => Number(right.value || 0) - Number(left.value || 0));

  const rows = entries.map((item, index) => {
    const formatted = formatter ? formatter(item.value, item.name, item) : item.value;
    const [value, rowLabel] = Array.isArray(formatted) ? formatted : [formatted, item.name];
    return {
      key: `${item.dataKey ?? item.name ?? index}`,
      label: rowLabel,
      value,
      color: item.color,
      markerColor: item.color
    } satisfies GraphTooltipRow;
  });

  return <GraphTooltip title={label} rows={rows} style={style} />;
}
