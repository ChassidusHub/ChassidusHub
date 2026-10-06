import type { GapResolutionContext, OccasionResolution } from './types.js';

/**
 * Resolves a single occasion to the Hebrew year whose recording should be
 * served, applying (in order): manual override, the user's chosen source
 * year, then — only under the 'nearestKviusYear' strategy — the nearest
 * other kvius-matched year (by distance from the source year) that
 * actually has a recording. Returns a 'gap' when nothing resolves, which
 * callers surface as "no recording available" rather than silently
 * skipping.
 */
export function resolveOccasion(occasionKey: string, ctx: GapResolutionContext): OccasionResolution {
  const manualYear = ctx.manualOverrides?.[occasionKey];
  if (manualYear !== undefined) {
    return ctx.hasRecording(manualYear, occasionKey)
      ? { status: 'manual', resolvedYear: manualYear }
      : { status: 'gap', resolvedYear: null };
  }

  if (ctx.hasRecording(ctx.sourceYear, occasionKey)) {
    return { status: 'primary', resolvedYear: ctx.sourceYear };
  }

  if (ctx.gapStrategy === 'nearestKviusYear') {
    const fallbackCandidates = [...new Set(ctx.candidateYears)]
      .filter((year) => year !== ctx.sourceYear)
      .sort((a, b) => Math.abs(a - ctx.sourceYear) - Math.abs(b - ctx.sourceYear) || a - b);
    for (const year of fallbackCandidates) {
      if (ctx.hasRecording(year, occasionKey)) {
        return { status: 'fallback', resolvedYear: year };
      }
    }
  }

  return { status: 'gap', resolvedYear: null };
}
