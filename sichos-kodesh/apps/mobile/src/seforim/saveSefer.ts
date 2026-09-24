import { useSyncExternalStore } from 'react';
import RNBlobUtil from 'react-native-blob-util';
import type { CatalogEdition, CatalogUnit, CatalogWork, CatalogWorkContents } from '@sichos-kodesh/catalog';
import { SEARCH_INDEX_FORMAT, SEARCH_INDEX_SQL, normalizeSearchText, textObjectWords } from '@sichos-kodesh/pack-format';
import { catalogStore } from '../catalog/catalogStore';
import { documentPath } from '../offline/objectStore';
import type { PacksNativeModule } from '../offline/packsNative';
import { forgetSaved, getSavedState, recordSaved, savedDir, savedIndexPath, savedTextPath } from './savedStore';
import { mayRead } from './seforimModel';
import { TextLoadError, fetchFromSefaria, type TextProblem } from './seforimText';

/**
 * Saving a sefer on the phone: every unit, in every edition that may be
 * read, fetched from Sefaria and rendered exactly as the reader renders it
 * online, then a search index built from those texts in the packs' own
 * layout (pack-format's SEARCH_INDEX_SQL and normalising) - so reading
 * and searching it need no internet.
 *
 * A few units at a time; a unit already saved is not fetched again, so a
 * stopped saving continues where it stopped. A unit Sefaria does not serve
 * is left out and the rest go on: the sefer is then saved in part, with
 * its index over what was saved, and "continue" tries the missing ones
 * again. One saving per sefer; the state below is what the work screen
 * shows while it runs.
 */

export type SaveJob = { state: 'saving'; done: number; total: number } | { state: 'indexing'; total: number } | { state: 'stopped'; problem: TextProblem | 'cancelled' | 'failed'; done: number; total: number };

const CONCURRENCY = 3;

let jobs: Readonly<Record<string, SaveJob>> = {};
const cancelled = new Set<string>();
/** The savings running now, so a removal can wait for one to stop. */
const running = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function setJob(workId: string, job: SaveJob | null): void {
  const next = { ...jobs };
  if (job) next[workId] = job;
  else delete next[workId];
  jobs = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => jobs;

export function useSaveJobs(): Readonly<Record<string, SaveJob>> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function getSaveJob(workId: string): SaveJob | undefined {
  return jobs[workId];
}

export interface SavePart {
  unit: CatalogUnit;
  edition: CatalogEdition;
}

/** What saving a sefer fetches: each unit in each edition that may be read, in the sefer's order. */
export function saveParts(work: CatalogWork, contents: CatalogWorkContents): SavePart[] {
  return contents.units.flatMap((unit) => unit.editions.filter((edition) => mayRead(work.sources[edition.source])).map((edition) => ({ unit, edition })));
}

/** About how many bytes saving the sefer takes: its texts, as the catalog counts them. */
export function saveBytes(work: CatalogWork, contents: CatalogWorkContents): number {
  return saveParts(work, contents).reduce((sum, part) => sum + (part.edition.bytes ?? 0), 0);
}

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

async function ensureDir(relative: string): Promise<void> {
  const path = documentPath(relative);
  if (!(await RNBlobUtil.fs.exists(path))) await RNBlobUtil.fs.mkdir(path).catch(() => undefined);
}

type FetchLike = Parameters<typeof fetchFromSefaria>[3];

/**
 * Saves the sefer; resolves when it is saved and indexed, or stopped.
 * Never throws: a failure ends as a `stopped` job, with the texts saved
 * so far kept for the next try.
 */
export function saveSefer(native: PacksNativeModule, work: CatalogWork, contents: CatalogWorkContents, fetchFn?: FetchLike): Promise<void> {
  const already = running.get(work.id);
  if (already) return already;
  const job = runSave(native, work, contents, fetchFn).finally(() => running.delete(work.id));
  running.set(work.id, job);
  return job;
}

async function runSave(native: PacksNativeModule, work: CatalogWork, contents: CatalogWorkContents, fetchFn?: FetchLike): Promise<void> {
  cancelled.delete(work.id);
  const parts = saveParts(work, contents);
  const total = parts.length;
  if (total === 0) return;
  const catalog = catalogStore.get().version;
  let done = 0;
  let bytes = 0;
  const skipped = new Set<SavePart>();
  let index: string | null = null;
  // An object, not a `let`: the workers set it, and the code after them reads it.
  const stop: { problem: TextProblem | 'cancelled' | 'failed' | null } = { problem: null };
  setJob(work.id, { state: 'saving', done, total });

  try {
    await ensureDir('texts');
    await ensureDir('texts/saved');
    await ensureDir(savedDir(work.id));
    // Saved texts are read before the record says the sefer is saved in full.
    const before = (await getSavedState()).seforim[work.id];
    index = before?.index ?? null;
    recordSaved(work.id, { units: before?.units ?? 0, bytes: before?.bytes ?? 0, complete: false, index, catalog });

    let next = 0;
    const worker = async () => {
      while (stop.problem === null && next < parts.length) {
        if (cancelled.has(work.id)) {
          stop.problem = 'cancelled';
          return;
        }
        const { unit, edition } = parts[next]!;
        next += 1;
        const part = parts[next - 1]!;
        const path = documentPath(savedTextPath(work.id, unit.id, edition.source));
        if (await RNBlobUtil.fs.exists(path)) {
          const stat = await RNBlobUtil.fs.stat(path);
          bytes += Number(stat.size) || 0;
        } else {
          let html: string;
          try {
            html = await fetchFromSefaria(work, unit, edition, fetchFn);
          } catch (error) {
            // One unit Sefaria does not serve is left out; no connection stops the saving.
            if (error instanceof TextLoadError && error.problem === 'unavailable') {
              skipped.add(part);
              continue;
            }
            throw error;
          }
          // Written beside its place and moved in whole, so a saving cut short never leaves half a text that looks saved.
          await RNBlobUtil.fs.writeFile(`${path}.part`, html, 'utf8');
          await RNBlobUtil.fs.mv(`${path}.part`, path);
          bytes += utf8Bytes(html);
        }
        done += 1;
        if (stop.problem === null) setJob(work.id, { state: 'saving', done, total });
      }
    };
    await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        worker().catch((error: unknown) => {
          stop.problem ??= error instanceof TextLoadError ? error.problem : 'failed';
        }),
      ),
    );
    if (stop.problem === null && done === 0) stop.problem = 'unavailable';
    if (stop.problem !== null) {
      recordSaved(work.id, { units: done, bytes, complete: false, index, catalog });
      setJob(work.id, { state: 'stopped', problem: stop.problem, done, total });
      return;
    }

    setJob(work.id, { state: 'indexing', total });
    await ensureDir('indexes');
    const rowsFile = `indexes/saved_${work.id}.rows`;
    await RNBlobUtil.fs.writeFile(documentPath(rowsFile), '', 'utf8');
    let lines: string[] = [];
    for (const part of parts) {
      if (skipped.has(part)) continue;
      const { unit, edition } = part;
      const html = String(await RNBlobUtil.fs.readFile(documentPath(savedTextPath(work.id, unit.id, edition.source)), 'utf8'));
      const language = work.sources[edition.source]?.language;
      const title = language === 'en' ? (unit.labelEn ?? unit.label) : unit.label;
      lines.push(JSON.stringify({ unit: unit.id, source: edition.source, title: normalizeSearchText(title), body: textObjectWords(html) }));
      if (lines.length >= 50) {
        await RNBlobUtil.fs.appendFile(documentPath(rowsFile), `${lines.join('\n')}\n`, 'utf8');
        lines = [];
      }
    }
    if (lines.length > 0) await RNBlobUtil.fs.appendFile(documentPath(rowsFile), `${lines.join('\n')}\n`, 'utf8');
    index = savedIndexPath(work.id);
    await native.buildSearchIndex(rowsFile, index, SEARCH_INDEX_SQL, { format: String(SEARCH_INDEX_FORMAT), work: work.id, catalog });
    recordSaved(work.id, { units: done, bytes, complete: skipped.size === 0, index, catalog });
    setJob(work.id, skipped.size === 0 ? null : { state: 'stopped', problem: 'unavailable', done, total });
  } catch {
    recordSaved(work.id, { units: done, bytes, complete: false, index, catalog });
    setJob(work.id, { state: 'stopped', problem: 'failed', done, total });
  }
}

/** Stops a saving that is running; what it saved stays. */
export function cancelSave(workId: string): void {
  if (jobs[workId]?.state === 'saving') cancelled.add(workId);
}

/** Removes a saved sefer: its texts, its index and its record. A saving that is running is stopped first. */
export async function removeSavedSefer(workId: string): Promise<void> {
  cancelled.add(workId);
  await running.get(workId);
  await RNBlobUtil.fs.unlink(documentPath(savedDir(workId))).catch(() => undefined);
  await RNBlobUtil.fs.unlink(documentPath(savedIndexPath(workId))).catch(() => undefined);
  forgetSaved(workId);
  setJob(workId, null);
}

/** For tests. */
export function resetSaveJobs(): void {
  jobs = {};
  cancelled.clear();
  running.clear();
}
