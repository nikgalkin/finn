export const isTextInputTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable || ['TEXTAREA', 'SELECT'].includes(element.tagName)) return true;
  return element.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes((element as HTMLInputElement).type);
};
