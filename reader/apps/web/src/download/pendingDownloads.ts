const STORAGE_KEY = 'chassidushub:pending-chapter-downloads';

export interface PendingChapterDownload {
  hebrewYear: number;
  occasionId: number;
  chapterIndex: number;
}

function idOf(p: PendingChapterDownload): string {
  return `${p.hebrewYear}:${p.occasionId}:${p.chapterIndex}`;
}

function readAll(): PendingChapterDownload[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PendingChapterDownload[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: PendingChapterDownload[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Best-effort persistence only.
  }
}

/**
 * Marks one chapter as "the user asked for this, still in flight" - written
 * *before* the actual fetch starts, so a page reload mid-download (which
 * kills that in-progress `fetch()` outright - there's no way for a plain
 * page-driven download to survive a navigation) still leaves a record of
 * what was wanted. `removePendingChapterDownload` clears it once the job
 * actually settles (done or error) in the same session; `resumeAll` is what
 * turns a leftover entry from an interrupted session into a fresh retry.
 */
export function addPendingChapterDownload(p: PendingChapterDownload): void {
  const id = idOf(p);
  const list = readAll();
  if (list.some((existing) => idOf(existing) === id)) return;
  writeAll([...list, p]);
}

export function removePendingChapterDownload(p: PendingChapterDownload): void {
  const id = idOf(p);
  writeAll(readAll().filter((existing) => idOf(existing) !== id));
}

export function listPendingChapterDownloads(): PendingChapterDownload[] {
  return readAll();
}

/** Used by DownloadSettingsScreen's "Clear downloads" - without this, a chapter download that happened to still be pending at the moment of clearing would silently come back on the next app open (see `addPendingChapterDownload`'s own comment). */
export function clearPendingChapterDownloads(): void {
  writeAll([]);
}
