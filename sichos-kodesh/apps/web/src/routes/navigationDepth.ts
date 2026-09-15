const STORAGE_KEY = 'sichos-kodesh:nav-depth';

/**
 * How many real, in-app "back" steps are available in this browser tab
 * right now - kept in `sessionStorage` (survives a reload, cleared on a
 * fresh tab) rather than read from `window.history.state`'s own `idx`,
 * which turned out not to reliably reflect the true depth after a reload
 * (a real reported bug: the back button looped instead of ever reaching
 * home). We control exactly when this changes (see
 * `useTrackNavigationDepth`), so it stays correct across a reload by
 * construction instead of depending on the browser/React Router to have
 * preserved their own internal counter.
 */
export function getNavigationDepth(): number {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function setNavigationDepth(depth: number): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(Math.max(0, depth)));
  } catch {
    // Best-effort only - worst case, BackLink falls back to its fixed URL more often than strictly necessary.
  }
}

export function adjustNavigationDepth(delta: number): void {
  setNavigationDepth(getNavigationDepth() + delta);
}
