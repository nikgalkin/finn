export type LoaderChoice = 'bmo' | 'marceline';

export type LogoChoice =
  | 'plain'
  | 'hat-dot'
  | 'hat-left'
  | 'f-in-hat';

type VisualPreferences = {
  loader: LoaderChoice;
  logo: LogoChoice;
  logoGradient: boolean;
};

const loaderStorageKey = 'finn:loader-choice';
const logoStorageKey = 'finn:logo-choice';
const logoGradientStorageKey = 'finn:logo-gradient';
const preferenceEvent = 'finn:visual-preferences-changed';

const loaderChoices = new Set<LoaderChoice>(['bmo', 'marceline']);
const logoChoices = new Set<LogoChoice>([
  'plain',
  'hat-dot',
  'hat-left',
  'f-in-hat',
]);

export function readVisualPreferences(): VisualPreferences {
  const storedLoader = window.localStorage.getItem(loaderStorageKey) as LoaderChoice | null;
  const storedLogo = window.localStorage.getItem(logoStorageKey) as LogoChoice | null;
  const storedLogoGradient = window.localStorage.getItem(logoGradientStorageKey);

  return {
    loader: storedLoader && loaderChoices.has(storedLoader) ? storedLoader : 'bmo',
    logo: storedLogo && logoChoices.has(storedLogo) ? storedLogo : 'plain',
    logoGradient: storedLogoGradient === null ? true : storedLogoGradient === 'true',
  };
}

function announcePreferenceChange() {
  window.dispatchEvent(new CustomEvent<VisualPreferences>(
    preferenceEvent,
    { detail: readVisualPreferences() },
  ));
}

export function selectLoader(loader: LoaderChoice) {
  window.localStorage.setItem(loaderStorageKey, loader);
  announcePreferenceChange();
}

export function selectLogo(logo: LogoChoice) {
  window.localStorage.setItem(logoStorageKey, logo);
  announcePreferenceChange();
}

export function selectLogoGradient(enabled: boolean) {
  window.localStorage.setItem(logoGradientStorageKey, String(enabled));
  announcePreferenceChange();
}

export function subscribeToVisualPreferences(
  onChange: (preferences: VisualPreferences) => void,
) {
  const handleChange = (event: Event) => {
    onChange((event as CustomEvent<VisualPreferences>).detail);
  };

  window.addEventListener(preferenceEvent, handleChange);
  return () => window.removeEventListener(preferenceEvent, handleChange);
}
