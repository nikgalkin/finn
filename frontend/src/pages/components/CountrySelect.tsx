import { COUNTRIES, getCountryByAlpha3, getCountryDisplayName } from '../../lib/countries';
import { SearchableSelect } from './graphs/SearchableSelect';

type CountrySelectProps = {
  id: string;
  value?: string;
  onChange: (value: string) => void;
};

const EMPTY_COUNTRY_OPTION = '— No country —';
const countryOptions = COUNTRIES.map(country => `${country.alpha3} · ${getCountryDisplayName(country)}`);
const countriesByOption = new Map(countryOptions.map((option, index) => [option, COUNTRIES[index]]));

export function CountrySelect({ id, value = '', onChange }: CountrySelectProps) {
  const country = getCountryByAlpha3(value);
  const selectedOption = country
    ? `${country.alpha3} · ${getCountryDisplayName(country)}`
    : value.trim().toUpperCase();

  return (
    <div style={{ width: '220px', flex: '0 0 220px' }}>
      <SearchableSelect
        id={id}
        ariaLabel="Organization country"
        value={selectedOption}
        onChange={option => onChange(option === EMPTY_COUNTRY_OPTION ? '' : countriesByOption.get(option)?.alpha3 || '')}
        options={[...countryOptions, EMPTY_COUNTRY_OPTION]}
        placeholder="Select country"
        width="220px"
        dropdownWidth="300px"
        height="36px"
        textAlign="left"
        portal
      />
    </div>
  );
}
