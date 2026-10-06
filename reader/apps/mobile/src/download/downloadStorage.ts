import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBlobUtil from 'react-native-blob-util';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@chassidushub-reader/app-core';
import type { DownloadTarget } from '@chassidushub-reader/app-core';
import { audioFileNames } from '../offline/placement';

const COMPLETED_STORAGE_KEY = 'chassidushub:mobile-download-ledger';
const PENDING_STORAGE_KEY = 'chassidushub:mobile-pending-downloads';

export type DownloadStatus = 'idle' | 'queued' | 'downloading' | 'downloaded' | 'canceled' | 'error';

export interface TargetDownloadState {
  target: DownloadTarget;
  status: DownloadStatus;
  progress: number;
  localPath?: string;
  error?: string;
}

export interface StoredDownloadRecord {
  key: string;
  hebrewYear: number;
  occasionId: number;
  label: string;
  kind: 'audio' | 'pdf';
  chapterIndex?: number;
  workerFilename?: string;
  driveFileId?: string;
  resourceKey?: string | null;
  section?: DownloadTarget['section'];
  localPath: string;
  downloadedAt: string;
}

export interface DownloadedOccasionSummary {
  entry: CatalogEntry;
  targets: DownloadTarget[];
  audioCount: number;
  pdfCount: number;
}

function isStoredDownloadRecord(value: unknown): value is StoredDownloadRecord {
  return !!value && typeof value === 'object' && typeof (value as StoredDownloadRecord).key === 'string' && typeof (value as StoredDownloadRecord).localPath === 'string';
}

function isDownloadTarget(value: unknown): value is DownloadTarget {
  return !!value && typeof value === 'object' && typeof (value as DownloadTarget).key === 'string' && ((value as DownloadTarget).kind === 'audio' || (value as DownloadTarget).kind === 'pdf');
}

async function readJsonArray<T>(key: string, guard: (value: unknown) => value is T): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

async function writeJsonArray<T>(key: string, items: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Best-effort persistence only.
  }
}

export function fileNameForTarget(target: DownloadTarget): string {
  return target.kind === 'audio' ? (target.workerFilename ?? `${target.key}.mp3`) : `${target.driveFileId ?? target.key}.pdf`;
}

export function localPathForTarget(target: DownloadTarget): string {
  return `${RNBlobUtil.fs.dirs.DocumentDir}/${fileNameForTarget(target)}`;
}

/** Every file a target may be on the phone as: a recording's MP3 and the Opus encodings a pack may have brought instead. */
export function fileNamesForTarget(target: DownloadTarget): string[] {
  const name = fileNameForTarget(target);
  return target.kind === 'audio' ? audioFileNames(name) : [name];
}

export function localPathsForTarget(target: DownloadTarget): string[] {
  return fileNamesForTarget(target).map((name) => `${RNBlobUtil.fs.dirs.DocumentDir}/${name}`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    return await RNBlobUtil.fs.exists(path);
  } catch {
    return false;
  }
}

async function listDocumentFiles(): Promise<Set<string>> {
  try {
    return new Set(await RNBlobUtil.fs.ls(RNBlobUtil.fs.dirs.DocumentDir));
  } catch {
    return new Set();
  }
}

export async function listStoredDownloads(): Promise<StoredDownloadRecord[]> {
  return readJsonArray(COMPLETED_STORAGE_KEY, isStoredDownloadRecord);
}

export async function reconcileStoredDownloads(records?: StoredDownloadRecord[]): Promise<StoredDownloadRecord[]> {
  const existing = records ?? (await listStoredDownloads());
  const kept: StoredDownloadRecord[] = [];
  for (const record of existing) {
    if (await pathExists(record.localPath)) kept.push(record);
  }
  if (kept.length !== existing.length) await writeJsonArray(COMPLETED_STORAGE_KEY, kept);
  return kept;
}

function recordFor(target: DownloadTarget, localPath: string, downloadedAt: string): StoredDownloadRecord {
  return {
    key: target.key,
    hebrewYear: target.hebrewYear,
    occasionId: target.occasionId,
    label: target.label,
    kind: target.kind,
    chapterIndex: target.chapterIndex,
    workerFilename: target.workerFilename,
    driveFileId: target.driveFileId,
    resourceKey: target.resourceKey ?? null,
    section: target.section,
    localPath,
    downloadedAt,
  };
}

export async function upsertStoredDownload(target: DownloadTarget, localPath: string): Promise<StoredDownloadRecord[]> {
  return upsertStoredDownloads([{ target, localPath }]);
}

/** Many at once (an offline pack import): one reconcile and one write, however many files. */
export async function upsertStoredDownloads(items: Array<{ target: DownloadTarget; localPath: string }>): Promise<StoredDownloadRecord[]> {
  const records = await reconcileStoredDownloads();
  if (items.length === 0) return records;
  const now = new Date().toISOString();
  const incoming = new Map(items.map((item) => [item.target.key, recordFor(item.target, item.localPath, now)]));
  const next = [...records.filter((record) => !incoming.has(record.key)), ...incoming.values()];
  await writeJsonArray(COMPLETED_STORAGE_KEY, next);
  return next;
}

export async function listPendingDownloads(): Promise<DownloadTarget[]> {
  return readJsonArray(PENDING_STORAGE_KEY, isDownloadTarget);
}

export async function writePendingDownloads(targets: DownloadTarget[]): Promise<void> {
  await writeJsonArray(PENDING_STORAGE_KEY, targets);
}

export async function clearPendingDownloads(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // Best-effort persistence only.
  }
}

async function unlinkIfExists(path: string): Promise<void> {
  if (await pathExists(path)) {
    try {
      await RNBlobUtil.fs.unlink(path);
    } catch {
      // Best-effort deletion only.
    }
  }
}

export async function deleteEntryDownloads(entry: CatalogEntry): Promise<void> {
  const targets = listDownloadTargets([entry], ALL_CONTENT_TYPES);
  await Promise.all([...new Set(targets.flatMap(localPathsForTarget))].map(unlinkIfExists));
  const records = await listStoredDownloads();
  const next = records.filter((record) => !(record.hebrewYear === entry.hebrewYear && record.occasionId === entry.occasionId));
  await writeJsonArray(COMPLETED_STORAGE_KEY, next);
}

/** Deletes specific files (auto-cleanup's per-target pruning) and drops their completed records, leaving the rest of the occasion alone. */
export async function deleteTargetDownloads(targets: DownloadTarget[]): Promise<void> {
  await Promise.all([...new Set(targets.flatMap(localPathsForTarget))].map(unlinkIfExists));
  const keys = new Set(targets.map((target) => target.key));
  const records = await listStoredDownloads();
  await writeJsonArray(
    COMPLETED_STORAGE_KEY,
    records.filter((record) => !keys.has(record.key)),
  );
}

/** `extraFileNames`: files beyond the farbrengens' own (the phone's library - see src/library/libraryDownloads.ts). */
export async function clearAllDownloadedFiles(entries: CatalogEntry[], extraFileNames: Iterable<string> = []): Promise<void> {
  const targets = listDownloadTargets(entries, ALL_CONTENT_TYPES);
  const paths = new Set(targets.flatMap(localPathsForTarget));
  for (const fileName of extraFileNames) for (const name of audioFileNames(fileName)) paths.add(`${RNBlobUtil.fs.dirs.DocumentDir}/${name}`);
  await Promise.all([...paths].map(unlinkIfExists));
  try {
    await AsyncStorage.removeItem(COMPLETED_STORAGE_KEY);
  } catch {
    // Best-effort persistence only.
  }
  await clearPendingDownloads();
}

export async function getDownloadStorageUsage(entries: CatalogEntry[], extraFileNames: Iterable<string> = []): Promise<number> {
  const fileNames = new Set(listDownloadTargets(entries, ALL_CONTENT_TYPES).flatMap(fileNamesForTarget));
  for (const fileName of extraFileNames) for (const name of audioFileNames(fileName)) fileNames.add(name);
  const files = await listDocumentFiles();
  let total = 0;
  for (const fileName of files) {
    if (!fileNames.has(fileName)) continue;
    try {
      const stat = await RNBlobUtil.fs.stat(`${RNBlobUtil.fs.dirs.DocumentDir}/${fileName}`);
      total += Number(stat.size) || 0;
    } catch {
      // Ignore missing/stale files.
    }
  }
  return total;
}

/** The file a target is on the phone as (its MP3, or an Opus encoding from a pack), or null. */
export async function existingLocalPathForTarget(target: DownloadTarget): Promise<string | null> {
  for (const path of localPathsForTarget(target)) if (await pathExists(path)) return path;
  return null;
}

export async function isTargetDownloaded(target: DownloadTarget): Promise<boolean> {
  return (await existingLocalPathForTarget(target)) !== null;
}

export async function listDownloadedOccasions(entries: CatalogEntry[]): Promise<DownloadedOccasionSummary[]> {
  const files = await listDocumentFiles();
  const summaries: DownloadedOccasionSummary[] = [];
  for (const entry of entries) {
    const targets = listDownloadTargets([entry], ALL_CONTENT_TYPES).filter((target) => fileNamesForTarget(target).some((name) => files.has(name)));
    if (targets.length === 0) continue;
    summaries.push({
      entry,
      targets,
      audioCount: targets.filter((target) => target.kind === 'audio').length,
      pdfCount: targets.filter((target) => target.kind === 'pdf').length,
    });
  }
  return summaries;
}
