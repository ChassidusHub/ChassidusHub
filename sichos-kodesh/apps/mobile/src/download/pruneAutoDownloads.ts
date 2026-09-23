import { ALL_CONTENT_TYPES, listDownloadTargets } from '@sichos-kodesh/app-core';
import catalog from '../catalog/data';
import { getOccasionProgress, isOccasionFinished, readProgressMap } from '../player/progressStore';
import type { DownloadSettings, RetentionPeriod } from './downloadSettings';
import { forgetAutoDownload, listAutoDownloads } from './downloadLedger';
import { deleteTargetDownloads } from './downloadStorage';

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
 * download ever touched (never in the ledger to begin with), never anything
 * opened since it was last auto-claimed (`lastVisitedAt > cachedAt`), and,
 * with `keepFinishedContent`, never a finished occasion. Run once per app
 * open (see useDownloadRetention.ts), never on a timer.
 */
export async function pruneAutoDownloads(settings: DownloadSettings): Promise<void> {
  if (settings.retentionPeriod === 'never') return;
  const cutoff = Date.now() - RETENTION_MS[settings.retentionPeriod];
  const stale = listAutoDownloads().filter((entry) => entry.cachedAt < cutoff);
  if (stale.length === 0) return;

  const progressMap = readProgressMap();
  for (const entry of stale) {
    const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);
    if (progress && progress.lastVisitedAt > entry.cachedAt) continue; // Opened since - keep.
    const catalogEntry = (catalog[entry.hebrewYear] ?? []).find((e) => e.occasionId === entry.occasionId);
    if (settings.keepFinishedContent && catalogEntry && isOccasionFinished(progress, catalogEntry)) continue;
    const target = catalogEntry ? listDownloadTargets([catalogEntry], ALL_CONTENT_TYPES).find((item) => item.key === entry.targetKey) : undefined;
    if (target) await deleteTargetDownloads([target]);
    forgetAutoDownload(entry.targetKey);
  }
}
