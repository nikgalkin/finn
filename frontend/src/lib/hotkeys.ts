export const isTextInputTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable || ['TEXTAREA', 'SELECT'].includes(element.tagName)) return true;
  return element.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes((element as HTMLInputElement).type);
};

export type NavigationHotkey = {
  code: string;
  shiftKey?: boolean;
  label: string;
  description: string;
  route: string;
};

export const NAVIGATION_HOTKEYS: NavigationHotkey[] = [
  { code: 'KeyN', label: 'N', description: 'New snapshot', route: '/snapshot/new' },
  { code: 'KeyA', label: 'A', description: 'Open assistant', route: '/assistant' },
  { code: 'KeyW', label: 'W', description: 'Open Cash Flow', route: '/flow' },
  { code: 'KeyG', label: 'G', description: 'Open graphs', route: '/graphs' },
  { code: 'KeyF', label: 'F', description: 'Open feed', route: '/feed' },
  { code: 'KeyS', label: 'S', description: 'Open settings', route: '/settings' }
];

export const getNavigationHotkey = (event: KeyboardEvent) => (
  NAVIGATION_HOTKEYS.find(hotkey => hotkey.code === event.code && Boolean(hotkey.shiftKey) === event.shiftKey)
);
