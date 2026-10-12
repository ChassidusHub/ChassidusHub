/**
 * The page budgets from the build plan, for a phone on a slow connection. A
 * page over any of them fails CI.
 *
 * Sizes are what a browser is sent: each response compressed with Brotli, as
 * Cloudflare sends it. JavaScript counts every script a first visit loads.
 * React and React Router alone are about 104 kB of that (October 2026), so
 * JavaScript is held at 130 kB: the plan's 100 kB for our own code could not
 * be met with the framework the plan chose, and this keeps the screens to
 * about 25 kB between them. A page downloads only its own screen: an
 * item's page reads the reader or the library's screens, not both (#277).
 *
 * Fonts never hold up the first paint (font-display: swap); the fonts that
 * count "before paint" are the ones a page preloads, which arrive with it.
 * Other faces (titles, Torah text) count toward the first visit.
 */
export const budgets = {
  /** Time from asking for the page to its first byte. */
  serverWaitMs: 800,
  /** Everything a first visit downloads. */
  firstVisitBytes: 250_000,
  javascriptBytes: 130_000,
  javascriptFiles: 10,
  preloadedFontBytes: 60_000,
  preloadedFontFiles: 2,
  htmlBytes: 60_000,
  layoutShift: 0.05,
};
