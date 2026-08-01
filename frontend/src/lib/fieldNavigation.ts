export function adjacentFieldIndex(
  currentIndex: number,
  fieldCount: number,
  direction: 1 | -1,
): number | null {
  if (currentIndex < 0 || currentIndex >= fieldCount) return null;
  const nextIndex = currentIndex + direction;
  return nextIndex >= 0 && nextIndex < fieldCount ? nextIndex : null;
}
