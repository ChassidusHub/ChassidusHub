import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PackScope, VerifyResult } from '@chassidushub-reader/pack-format';
import { PACK_EXTENSION } from '@chassidushub-reader/pack-format';
import type { ExportChoice } from './exportScope';
import { exportChoice } from './exportScope';
import { importLoose } from './looseImport';
import { importPack, readPackManifest } from './packImport';
import type { PacksNativeModule } from './packsNative';
import { getPacksNative, nextJobId, subscribePackProgress } from './packsNative';
import { writeStateFiles } from './stateFiles';

/**
 * Settings > Offline's engine: the shared folder, imports (picked files, a
 * picked folder, and everything the station or a friend dropped into
 * `import/`), exports, and the state files. One job at a time, in order.
 * The status (what runs now, with bytes, and the last few results) is a
 * small external store the screens read with `useOfflineStatus`.
 */

const FOLDER_KEY = 'chassidushub:offline-folder';
const PROCESSED_KEY = 'chassidushub:offline-processed-imports';
const STATE_WRITTEN_KEY = 'chassidushub:offline-state-written';
const LAST_IMPORT_KEY = 'chassidushub:offline-last-import';

export const IMPORT_DIR = 'import';
/** have.json is rewritten after every import, and otherwise at most this often. */
const STATE_REFRESH_MS = 6 * 60 * 60 * 1000;
/** App resumes closer together than this do not rescan the folder. */
const SCAN_THROTTLE_MS = 20 * 1000;
const MAX_REPORTS = 6;

export type OfflineActivity = { kind: 'import' | 'export'; name: string; bytes: number; total: number } | { kind: 'state' };

export type OfflineReport =
  | { kind: 'pack'; name: string; scope: PackScope; part?: { index: number; count: number }; added: number; addedBytes: number; present: number; unsupported: number; failed: number; catalogApplied?: string; at: number }
  | {
      kind: 'shared';
      name: string;
      added: number;
      addedBytes: number;
      present: number;
      unsupported: number;
      mismatched: number;
      unrecognized: number;
      failed: number;
      /** Set when the file had a pack manifest that was not trusted. */
      untrusted?: Exclude<VerifyResult, { ok: true }>['reason'];
      at: number;
    }
  | { kind: 'export'; fileName: string; files: number; bytes: number; at: number }
  | { kind: 'error'; name: string; code: 'no-space' | 'unavailable' | 'no-folder' | 'nothing-to-export' | 'failed'; needed?: number; free?: number; message?: string; at: number };

export interface OfflineStatus {
  activity: OfflineActivity | null;
  reports: OfflineReport[];
  /** Bumped whenever imported files changed what is on the phone (the download state refreshes on it). */
  filesVersion: number;
  folder: string | null;
}

let status: OfflineStatus = { activity: null, reports: [], filesVersion: 0, folder: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<OfflineStatus>): void {
  status = { ...status, ...patch };
  for (const listener of listeners) listener();
}

function report(next: OfflineReport): OfflineReport {
  setStatus({ reports: [next, ...status.reports].slice(0, MAX_REPORTS) });
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOfflineStatus(): OfflineStatus {
  return status;
}

export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(subscribe, getOfflineStatus, getOfflineStatus);
}

let queue: Promise<unknown> = Promise.resolve();

/** Jobs run one after another; each gets the native module or reports it missing. */
function enqueue<T>(job: (native: PacksNativeModule) => Promise<T>, unavailable: T): Promise<T> {
  const run = queue.then(async () => {
    const native = getPacksNative();
    if (!native) {
      report({ kind: 'error', name: '', code: 'unavailable', at: Date.now() });
      return unavailable;
    }
    try {
      return await job(native);
    } finally {
      setStatus({ activity: null });
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

// ── The shared folder ─────────────────────────────────────────────────────────

/** The folder the user picked, while the app still holds its grant. */
export async function getOfflineFolder(): Promise<string | null> {
  const native = getPacksNative();
  let folder: string | null = null;
  try {
    folder = await AsyncStorage.getItem(FOLDER_KEY);
  } catch {
    folder = null;
  }
  if (folder && native && !(await native.hasFolderAccess(folder).catch(() => false))) folder = null;
  if (folder !== status.folder) setStatus({ folder });
  return folder;
}

/** The system folder picker; suggests Documents/ChassidusHub in the screen's help text. */
export async function chooseOfflineFolder(): Promise<string | null> {
  const native = getPacksNative();
  if (!native) {
    report({ kind: 'error', name: '', code: 'unavailable', at: Date.now() });
    return null;
  }
  const picked = await native.pickFolder();
  if (!picked) return status.folder;
  await AsyncStorage.setItem(FOLDER_KEY, picked).catch(() => undefined);
  setStatus({ folder: picked });
  return picked;
}

export async function forgetOfflineFolder(): Promise<void> {
  await AsyncStorage.removeItem(FOLDER_KEY).catch(() => undefined);
  setStatus({ folder: null });
}

// ── Imports ───────────────────────────────────────────────────────────────────

/** The last path segment of a content URI, decoded: `primary:Download/5736-01-tishrei-src.skpack` -> the file name. */
export function displayNameOfUri(uri: string): string {
  const last = uri.split('/').pop() ?? uri;
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    decoded = last;
  }
  return decoded.split(/[/:]/).pop() || decoded;
}

async function markImported(): Promise<void> {
  await AsyncStorage.setItem(LAST_IMPORT_KEY, new Date().toISOString()).catch(() => undefined);
}

async function lastImportAt(): Promise<string | undefined> {
  try {
    return (await AsyncStorage.getItem(LAST_IMPORT_KEY)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Imports one file: a signed pack as a pack, anything else as a shared ZIP. Resolves the report, and whether the file may be deleted. */
async function importOne(native: PacksNativeModule, uri: string, name: string): Promise<{ report: OfflineReport; done: boolean }> {
  const jobId = nextJobId('import');
  setStatus({ activity: { kind: 'import', name, bytes: 0, total: 0 } });
  const unsubscribe = subscribePackProgress(jobId, (progress) => setStatus({ activity: { kind: 'import', name, bytes: progress.bytes, total: progress.total } }));
  try {
    const head = await readPackManifest(native, uri);
    if (head?.verify.ok) {
      const outcome = await importPack(native, uri, jobId, head);
      if (outcome.status === 'no-space') {
        return { report: report({ kind: 'error', name, code: 'no-space', needed: outcome.needed, free: outcome.free, at: Date.now() }), done: false };
      }
      if (outcome.status === 'imported') {
        if (outcome.added > 0 || outcome.catalogApplied) setStatus({ filesVersion: status.filesVersion + 1 });
        await markImported();
        const { manifest } = outcome;
        return {
          report: report({
            kind: 'pack',
            name,
            scope: manifest.scope,
            ...(manifest.part ? { part: { index: manifest.part.index, count: manifest.part.count } } : {}),
            added: outcome.added,
            addedBytes: outcome.addedBytes,
            present: outcome.present,
            unsupported: outcome.unsupported,
            failed: outcome.failed,
            ...(outcome.catalogApplied ? { catalogApplied: outcome.catalogApplied } : {}),
            at: Date.now(),
          }),
          done: outcome.failed === 0,
        };
      }
    }
    const loose = await importLoose(native, { kind: 'zip', uri }, jobId, head?.manifest);
    if (loose.added > 0) setStatus({ filesVersion: status.filesVersion + 1 });
    if (loose.added > 0) await markImported();
    const untrusted = head && !head.verify.ok ? head.verify.reason : undefined;
    return {
      report: report({ kind: 'shared', name, ...loose, ...(untrusted ? { untrusted } : {}), at: Date.now() }),
      done: loose.failed === 0 && loose.unrecognized === 0 && loose.mismatched === 0,
    };
  } catch (error) {
    return { report: report({ kind: 'error', name, code: 'failed', message: error instanceof Error ? error.message : String(error), at: Date.now() }), done: false };
  } finally {
    unsubscribe();
  }
}

/** "Import files": the system picker, then each file in turn. */
export function importPickedFiles(): Promise<OfflineReport[]> {
  return enqueue(async (native) => {
    const uris = await native.pickFiles();
    const reports: OfflineReport[] = [];
    for (const uri of uris ?? []) reports.push((await importOne(native, uri, displayNameOfUri(uri))).report);
    await refreshStateAfterImport(native, reports);
    return reports;
  }, []);
}

/** "Import a folder": every file under a picked folder, identified by hash and name. */
export function importPickedFolder(): Promise<OfflineReport | null> {
  return enqueue(async (native) => {
    const treeUri = await native.pickFolder();
    if (!treeUri) return null;
    const name = displayNameOfUri(treeUri);
    const jobId = nextJobId('folder');
    setStatus({ activity: { kind: 'import', name, bytes: 0, total: 0 } });
    const unsubscribe = subscribePackProgress(jobId, (progress) => setStatus({ activity: { kind: 'import', name, bytes: progress.bytes, total: progress.total } }));
    try {
      const loose = await importLoose(native, { kind: 'folder', treeUri }, jobId);
      if (loose.added > 0) {
        setStatus({ filesVersion: status.filesVersion + 1 });
        await markImported();
      }
      const result = report({ kind: 'shared', name, ...loose, at: Date.now() });
      await refreshStateAfterImport(native, [result]);
      return result;
    } catch (error) {
      return report({ kind: 'error', name, code: 'failed', message: error instanceof Error ? error.message : String(error), at: Date.now() });
    } finally {
      unsubscribe();
    }
  }, null);
}

async function readProcessed(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(PROCESSED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Whether a file in `import/` is one this app imports. */
export function isImportableName(name: string): boolean {
  return name.toLowerCase().endsWith(PACK_EXTENSION) || name.toLowerCase().endsWith('.zip');
}

let lastScanAt = 0;

/**
 * Imports everything in `import/` of the shared folder. A file that
 * imported cleanly is deleted (the station copies packs there for exactly
 * this); a file that left something behind is kept and not retried until
 * it changes. Runs on app resume and from Settings.
 */
export function scanImportFolder(options: { force?: boolean } = {}): Promise<OfflineReport[]> {
  const now = Date.now();
  if (!options.force && now - lastScanAt < SCAN_THROTTLE_MS) return Promise.resolve([]);
  lastScanAt = now;
  return enqueue(async (native) => {
    const folder = await getOfflineFolder();
    if (!folder) {
      if (options.force) report({ kind: 'error', name: '', code: 'no-folder', at: Date.now() });
      return [];
    }
    const files = (await native.listFolder(folder, IMPORT_DIR).catch(() => [])).filter((file) => isImportableName(file.name));
    const processed = await readProcessed();
    const reports: OfflineReport[] = [];
    for (const file of files) {
      const key = `${file.name}:${file.bytes}`;
      if (!options.force && processed[key]) continue;
      const { report: result, done } = await importOne(native, file.uri, file.name);
      reports.push(result);
      if (done) await native.deleteDocument(file.uri).catch(() => false);
      else processed[key] = Date.now();
    }
    await AsyncStorage.setItem(PROCESSED_KEY, JSON.stringify(processed)).catch(() => undefined);
    await refreshStateAfterImport(native, reports, folder);
    return reports;
  }, []);
}

async function refreshStateAfterImport(native: PacksNativeModule, reports: OfflineReport[], knownFolder?: string): Promise<void> {
  const folder = knownFolder ?? (await getOfflineFolder());
  if (!folder) return;
  const imported = reports.some((r) => (r.kind === 'pack' || r.kind === 'shared') && r.added > 0);
  let writtenAt = 0;
  try {
    writtenAt = Number(await AsyncStorage.getItem(STATE_WRITTEN_KEY)) || 0;
  } catch {
    writtenAt = 0;
  }
  if (!imported && Date.now() - writtenAt < STATE_REFRESH_MS) return;
  setStatus({ activity: { kind: 'state' } });
  try {
    await writeStateFiles(native, folder, await lastImportAt());
    await AsyncStorage.setItem(STATE_WRITTEN_KEY, String(Date.now())).catch(() => undefined);
  } catch {
    // The folder may be gone or read-only; the next run tries again.
  }
}

/** Settings' "Update the station file" row: writes have.json and device.json now. */
export function writeStateNow(): Promise<boolean> {
  return enqueue(async (native) => {
    const folder = await getOfflineFolder();
    if (!folder) {
      report({ kind: 'error', name: '', code: 'no-folder', at: Date.now() });
      return false;
    }
    setStatus({ activity: { kind: 'state' } });
    await writeStateFiles(native, folder, await lastImportAt());
    await AsyncStorage.setItem(STATE_WRITTEN_KEY, String(Date.now())).catch(() => undefined);
    return true;
  }, false);
}

// ── Export ────────────────────────────────────────────────────────────────────

export function exportToFolder(choice: ExportChoice, name: string): Promise<OfflineReport> {
  return enqueue(
    async (native) => {
      const folder = await getOfflineFolder();
      if (!folder) return report({ kind: 'error', name, code: 'no-folder', at: Date.now() });
      const jobId = nextJobId('export');
      setStatus({ activity: { kind: 'export', name, bytes: 0, total: 0 } });
      const unsubscribe = subscribePackProgress(jobId, (progress) => setStatus({ activity: { kind: 'export', name, bytes: progress.bytes, total: progress.total } }));
      try {
        const outcome = await exportChoice(native, folder, choice, jobId);
        return report({ kind: 'export', fileName: outcome.fileName, files: outcome.files, bytes: outcome.bytes, at: Date.now() });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = message === 'nothing-to-export' ? 'nothing-to-export' : message === 'no-space' ? 'no-space' : 'failed';
        return report({ kind: 'error', name, code, ...(code === 'failed' ? { message } : {}), at: Date.now() });
      } finally {
        unsubscribe();
      }
    },
    { kind: 'error', name, code: 'unavailable', at: Date.now() },
  );
}
