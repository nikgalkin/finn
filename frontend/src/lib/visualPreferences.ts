export const loaderChoices = ['standard', 'bmo', 'marceline'] as const;

export const logoChoices = [
  'plain',
  'hat-dot',
  'mark',
  'face',
  'candle',
] as const;

export const netWorthCardChoices = [
  'classic',
  'split',
] as const;

export const netWorthStripChoices = [
  'allocation',
  'flow',
  'history',
  'goal',
] as const;

export type LoaderChoice = (typeof loaderChoices)[number];
export type LogoChoice = (typeof logoChoices)[number];
export type NetWorthCardChoice = (typeof netWorthCardChoices)[number];
export type NetWorthStripChoice = (typeof netWorthStripChoices)[number];

export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

type VisualPreferences = {
  loader: LoaderChoice;
  logo: LogoChoice;
  logoGradient: boolean;
  netWorthCard: NetWorthCardChoice;
  netWorthStrip: NetWorthStripChoice;
};

const loaderStorageKey = 'finn:loader-choice';
const logoStorageKey = 'finn:logo-choice';
const logoGradientStorageKey = 'finn:logo-gradient';
const netWorthCardStorageKey = 'finn:net-worth-card';
const netWorthStripStorageKey = 'finn:net-worth-strip';
const preferenceEvent = 'finn:visual-preferences-changed';

const browserStorage = (): PreferenceStorage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const safelyRead = (storage: PreferenceStorage | null, key: string): string | null => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const safelyWrite = (storage: PreferenceStorage | null, key: string, value: string) => {
  try {
    storage?.setItem(key, value);
  } catch {
    return;
  }
};

function readChoice<T extends string>(
  storage: PreferenceStorage | null,
  key: string,
  choices: readonly T[],
  fallback: T,
): T {
  const stored = safelyRead(storage, key) as T | null;
  return stored !== null && choices.includes(stored) ? stored : fallback;
}

export function readVisualPreferences(
  storage: PreferenceStorage | null = browserStorage(),
): VisualPreferences {
  const storedLogoGradient = safelyRead(storage, logoGradientStorageKey);

  return {
    loader: readChoice(storage, loaderStorageKey, loaderChoices, 'bmo'),
    logo: readChoice(storage, logoStorageKey, logoChoices, 'plain'),
    logoGradient: storedLogoGradient === null ? true : storedLogoGradient === 'true',
    netWorthCard: readChoice(storage, netWorthCardStorageKey, netWorthCardChoices, 'classic'),
    netWorthStrip: readChoice(storage, netWorthStripStorageKey, netWorthStripChoices, 'allocation'),
  };
}

function announcePreferenceChange() {
  window.dispatchEvent(new CustomEvent<VisualPreferences>(
    preferenceEvent,
    { detail: readVisualPreferences() },
  ));
}

export function selectLoader(loader: LoaderChoice) {
  safelyWrite(browserStorage(), loaderStorageKey, loader);
  announcePreferenceChange();
}

export function selectLogo(logo: LogoChoice) {
  safelyWrite(browserStorage(), logoStorageKey, logo);
  announcePreferenceChange();
}

export function selectNetWorthCard(netWorthCard: NetWorthCardChoice) {
  safelyWrite(browserStorage(), netWorthCardStorageKey, netWorthCard);
  announcePreferenceChange();
}

export function selectNetWorthStrip(netWorthStrip: NetWorthStripChoice) {
  safelyWrite(browserStorage(), netWorthStripStorageKey, netWorthStrip);
  announcePreferenceChange();
}

export function selectLogoGradient(enabled: boolean) {
  safelyWrite(browserStorage(), logoGradientStorageKey, String(enabled));
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
