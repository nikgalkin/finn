import type { ReactNode } from 'react';

type SegmentedControlOption<Value extends string> = {
  value: Value;
  label: ReactNode;
  icon?: ReactNode;
};

type SegmentedControlProps<Value extends string> = {
  options: SegmentedControlOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  compact?: boolean;
};

export function SegmentedControl<Value extends string>({ options, value, onChange, compact = false }: SegmentedControlProps<Value>) {
  return (
    <div className={`segmented-control${compact ? ' is-compact' : ''}`}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={`btn segmented-control-option${option.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
