import { COUNTRIES, getCountryDisplayName } from '../../lib/countries';
import { AppSelect, type AppSelectOption } from './AppSelect';

type CountrySelectProps = {
  id: string;
  value?: string;
  onChange: (value: string) => void;
};

const countryOptions: AppSelectOption[] = [
  {
    value: '',
    label: 'No country',
    description: 'Leave the organization location unset'
  },
  ...COUNTRIES.map(country => ({
    value: country.alpha3,
    label: getCountryDisplayName(country),
    meta: country.alpha3,
    keywords: [country.alpha3]
  }))
];

export function CountrySelect({ id, value = '', onChange }: CountrySelectProps) {
  return (
    <div className="settings-country-select" style={{ width: '220px', flex: '0 0 220px' }}>
      <AppSelect
        id={id}
        name={id}
        ariaLabel="Organization country"
        value={value.trim().toUpperCase()}
        onChange={onChange}
        options={countryOptions}
        placeholder="Select country"
        searchable
        searchPlaceholder="Find country or code…"
        width="220px"
        dropdownWidth={300}
        dropdownClassName="country-select-dropdown"
        height="36px"
        textAlign="left"
      />
    </div>
  );
}
