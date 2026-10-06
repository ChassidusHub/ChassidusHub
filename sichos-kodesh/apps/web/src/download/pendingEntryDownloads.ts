const STORAGE_KEY = 'sichos-kodesh:pending-entry-downloads';

export interface PendingEntryDownload {
  hebrewYear: number;
  occasionId: number;
  /** Which ledger rule applies once this job actually settles (see downloadLedger.ts) - preserved across a reload so a resumed job still records/forgets correctly. */
  source: 'auto' | 'manual';
}

function idOf(p: Pick<PendingEntryDownload, 'hebrewYear' | 'occasionId'>): string {
  return `${p.hebrewYear}:${p.occasionId}`;
}

function readAll(): PendingEntryDownload[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingEntryDownload[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: PendingEntryDownload[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Best-effort persistence only.
  }
}

/**
 * Marks one occasion as "a whole-occasion or bulk download job wants this
 * fully fetched" - written *before* `runDownload` starts (see
 * DownloadProvider's `runQueue`), same reasoning as
 * `addPendingChapterDownload`: a page reload mid-download kills every
 * in-flight `fetch()` outright, so without a persisted record there'd be
 * no trace the job had ever been requested, and whatever targets hadn't
 * been reached yet would simply never get fetched unless the user
 * happened to notice and re-tap "Download." `removePendingEntryDownload`
 * only clears it once the occasion is confirmed *fully* cached - if a
 * job settles with something still missing (an error, or the reload
 * itself), the record deliberately stays so the resume-on-open effect
 * retries the remainder next time.
 */
export function addPendingEntryDownload(p: PendingEntryDownload): void {
  const id = idOf(p);
  const list = readAll();
  if (list.some((existing) => idOf(existing) === id)) return;
  writeAll([...list, p]);
}

export function removePendingEntryDownload(p: Pick<PendingEntryDownload, 'hebrewYear' | 'occasionId'>): void {
  writeAll(readAll().filter((existing) => idOf(existing) !== idOf(p)));
}

export function listPendingEntryDownloads(): PendingEntryDownload[] {
  return readAll();
}

/** Used by DownloadSettingsScreen's "Clear downloads" - same reasoning as `clearPendingChapterDownloads`. */
export function clearPendingEntryDownloads(): void {
  writeAll([]);
}
