export type LoaderChoice = 'bmo' | 'marceline';

export type LogoChoice =
  | 'hat-dot'
  | 'hat-left'
  | 'f-in-hat';

type VisualPreferences = {
  loader: LoaderChoice;
  logo: LogoChoice;
};

const loaderStorageKey = 'finn:loader-choice';
const logoStorageKey = 'finn:logo-choice';
const preferenceEvent = 'finn:visual-preferences-changed';

const loaderChoices = new Set<LoaderChoice>(['bmo', 'marceline']);
const logoChoices = new Set<LogoChoice>([
  'hat-dot',
  'hat-left',
  'f-in-hat',
]);

export function readVisualPreferences(): VisualPreferences {
  const storedLoader = window.localStorage.getItem(loaderStorageKey) as LoaderChoice | null;
  const storedLogo = window.localStorage.getItem(logoStorageKey) as LogoChoice | null;

  return {
    loader: storedLoader && loaderChoices.has(storedLoader) ? storedLoader : 'bmo',
    logo: storedLogo && logoChoices.has(storedLogo) ? storedLogo : 'hat-dot',
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

export function subscribeToVisualPreferences(
  onChange: (preferences: VisualPreferences) => void,
) {
  const handleChange = (event: Event) => {
    onChange((event as CustomEvent<VisualPreferences>).detail);
  };

  window.addEventListener(preferenceEvent, handleChange);
  return () => window.removeEventListener(preferenceEvent, handleChange);
}
