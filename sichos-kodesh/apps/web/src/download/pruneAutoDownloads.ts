import { getCatalog } from '../catalog/catalogStore';
import type { DownloadSettings, RetentionPeriod } from '../settings/useDownloadSettings';
import { getOccasionProgress, isOccasionFinished, readProgressMap } from '../player/progressStore';
import { listAutoDownloads, forgetAutoDownload } from './downloadLedger';
import { MEDIA_CACHE_NAME } from './cacheName';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const RETENTION_MS: Record<Exclude<RetentionPeriod, 'never'>, number> = {
  '2w': 2 * WEEK_MS,
  '4w': 4 * WEEK_MS,
  '8w': 8 * WEEK_MS,
  '12w': 12 * WEEK_MS,
};

/**
 * Deletes auto-downloaded files (see downloadLedger.ts) that are both past
 * `settings.retentionPeriod` and not protected - never anything a manual
 * download/tap ever touched (those are never tracked in the ledger at all,
 * so they're structurally outside this function's reach), and never
 * anything the user has actually opened *since* it was last (re-)claimed
 * by the auto-sync (`progress.lastVisitedAt > entry.cachedAt` - the same
 * `lastVisitedAt` FarbrengenScreen's own `useRecordVisit` already
 * maintains for the home page's Continue section, reused here rather than
 * adding a second "was this opened" tracker). `keepFinishedContent`
 * extends that same protection to a finished occasion even if it was
 * never re-opened after finishing - the natural end state of having
 * actually used it, not evidence it's now safe to reclaim.
 *
 * Run once per app open (see useDownloadRetention.ts), never on a timer -
 * same reasoning as this app's connectivity checks (connectivity.ts): a
 * real, discrete moment worth checking, not a background poll.
 */
export async function pruneAutoDownloads(settings: DownloadSettings): Promise<void> {
  if (settings.retentionPeriod === 'never') return;
  const cutoff = Date.now() - RETENTION_MS[settings.retentionPeriod];
  const stale = listAutoDownloads().filter((entry) => entry.cachedAt < cutoff);
  if (stale.length === 0) return;

  const progressMap = readProgressMap();
  const cache = await caches.open(MEDIA_CACHE_NAME);
  for (const entry of stale) {
    const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);
    if (progress && progress.lastVisitedAt > entry.cachedAt) continue; // Opened since - keep.
    if (settings.keepFinishedContent) {
      const catalogEntry = (getCatalog()[entry.hebrewYear] ?? []).find((e) => e.occasionId === entry.occasionId);
      if (catalogEntry && isOccasionFinished(progress, catalogEntry)) continue;
    }
    await cache.delete(entry.url);
    forgetAutoDownload(entry.url);
  }
}
