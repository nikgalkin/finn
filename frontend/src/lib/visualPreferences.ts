export const loaderChoices = ['bmo', 'marceline'] as const;

export const logoChoices = [
  'plain',
  'hat-dot',
  'hat-left',
  'mark',
  'face',
  'candle',
] as const;

export type LoaderChoice = (typeof loaderChoices)[number];
export type LogoChoice = (typeof logoChoices)[number];

export type VisualPreferences = {
  loader: LoaderChoice;
  logo: LogoChoice;
  logoGradient: boolean;
};

const loaderStorageKey = 'finn:loader-choice';
const logoStorageKey = 'finn:logo-choice';
const logoGradientStorageKey = 'finn:logo-gradient';
const preferenceEvent = 'finn:visual-preferences-changed';

function readChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  const stored = window.localStorage.getItem(key) as T | null;
  return stored !== null && choices.includes(stored) ? stored : fallback;
}

export function readVisualPreferences(): VisualPreferences {
  const storedLogoGradient = window.localStorage.getItem(logoGradientStorageKey);

  return {
    loader: readChoice(loaderStorageKey, loaderChoices, 'bmo'),
    logo: readChoice(logoStorageKey, logoChoices, 'plain'),
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
