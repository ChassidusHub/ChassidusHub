/**
 * The reader's text size: steps of 2 px from the design's size, kept in this
 * browser. root.tsx sets the step before the first paint, so the words never
 * jump to another size after they are drawn.
 */
export const SIZE_MIN = -2;
export const SIZE_MAX = 5;

export function readSize(): number {
  try {
    const step = Number(localStorage.getItem('size'));
    return Number.isInteger(step) ? Math.max(SIZE_MIN, Math.min(SIZE_MAX, step)) : 0;
  } catch {
    return 0;
  }
}

export function setSize(step: number): number {
  const kept = Math.max(SIZE_MIN, Math.min(SIZE_MAX, step));
  document.documentElement.style.setProperty('--torah-step', String(kept));
  try {
    localStorage.setItem('size', String(kept));
  } catch {
    // A private window may refuse: the size still holds for this visit.
  }
  return kept;
}
