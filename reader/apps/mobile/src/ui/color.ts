/** `#rrggbb` + alpha (0-1) -> `rgba()` - the web's `color-mix(in srgb, var(--accent) 14%, transparent)` for a tinted circle button. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
