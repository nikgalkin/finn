import { AppSelect } from './AppSelect';
import type { AppSelectOption } from './AppSelect';

type MonthSelectProps = {
  ariaLabel: string;
  value: string;
  options: AppSelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function MonthSelect({ ariaLabel, value, options, placeholder, onChange, disabled }: MonthSelectProps) {
  return (
    <AppSelect
      ariaLabel={ariaLabel}
      value={value}
      options={options}
      placeholder={placeholder}
      onChange={onChange}
      disabled={disabled}
      searchable
      searchPlaceholder="Find month…"
      width="100px"
      dropdownWidth={156}
      height="28px"
      textAlign="center"
    />
  );
}
