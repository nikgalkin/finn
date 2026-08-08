export function adjacentFieldIndex(
  currentIndex: number,
  fieldCount: number,
  direction: 1 | -1,
): number | null {
  if (currentIndex < 0 || currentIndex >= fieldCount || fieldCount < 2) return null;
  return (currentIndex + direction + fieldCount) % fieldCount;
}
