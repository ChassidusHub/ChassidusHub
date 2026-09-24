/**
 * Thin wrapper around the Android `SichosKodeshPacks` native module
 * (android/.../offline/PackModule.kt): streaming reads of packs and ZIPs,
 * hash-verified writes, the Storage Access Framework pickers, and the
 * shared folder. Everything that touches bytes runs natively on one
 * background thread; JS decides what to import.
 *
 * Returns null in Jest, on iOS, or when the module is not linked, so
 * callers can show "not available" instead of crashing.
 */

import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

export const PACK_PROGRESS_EVENT = 'SichosKodeshPackProgress';

/** One entry to write: `dest` is relative to the app's files directory (RNBlobUtil's DocumentDir). */
export interface NativeImportItem {
  entry: string;
  dest: string;
  sha256: string;
  bytes?: number;
}

export interface NativeImportResult {
  entry: string;
  dest: string;
  ok: boolean;
  sha256: string | null;
  bytes: number;
  error?: string;
}

/** A file of a shared ZIP or folder, copied into the staging area and hashed. */
export interface StagedFile {
  /** Its path inside the ZIP or folder, forward slashes. */
  path: string;
  /** Where it is staged, relative to the files directory. */
  staged: string;
  sha256: string;
  bytes: number;
}

export interface FolderFile {
  name: string;
  uri: string;
  bytes: number;
}

export interface DeviceInfo {
  model: string;
  androidVersion: string;
  freeBytes: number;
  filesDir: string;
}

export type ExportZipEntry = { name: string; path: string } | { name: string; text: string };

export interface PackProgress {
  jobId: string;
  bytes: number;
  total: number;
}

export interface PacksNativeModule {
  readEntry(uri: string, name: string, mustBeFirst: boolean, maxBytes: number): Promise<string | null>;
  importEntries(uri: string, jobId: string, items: NativeImportItem[]): Promise<NativeImportResult[]>;
  listEntries(uri: string): Promise<Array<{ path: string; bytes: number }>>;
  stageZip(uri: string, jobId: string): Promise<StagedFile[]>;
  stageFolder(treeUri: string, jobId: string): Promise<StagedFile[]>;
  commitStaged(staged: string, dest: string): Promise<string>;
  clearStaging(): Promise<null>;
  hashFile(path: string): Promise<{ sha256: string; bytes: number }>;
  pickFiles(): Promise<string[] | null>;
  pickFolder(): Promise<string | null>;
  hasFolderAccess(treeUri: string): Promise<boolean>;
  listFolder(treeUri: string, subdir: string): Promise<FolderFile[]>;
  writeFolderText(treeUri: string, subdir: string, name: string, text: string): Promise<string>;
  deleteDocument(uri: string): Promise<boolean>;
  exportZip(treeUri: string, subdir: string, fileName: string, entries: ExportZipEntry[], jobId: string): Promise<string>;
  deviceInfo(): Promise<DeviceInfo>;
  /** One sefer's search index (`dest` relative to the files directory), queried with pack-format's searchIndexQuery. */
  searchIndex(dest: string, match: string, limit: number): Promise<Array<{ unit: string; source: number }>>;
}

export function getPacksNative(): PacksNativeModule | null {
  if (Platform.OS !== 'android') return null;
  return (NativeModules.SichosKodeshPacks as PacksNativeModule | undefined) ?? null;
}

/** The native module, or an error a screen can show. */
export function requirePacksNative(): PacksNativeModule {
  const mod = getPacksNative();
  if (!mod) throw new Error('Offline packs are not available on this device');
  return mod;
}

/** Progress of one native job (`jobId`); returns the unsubscribe function. */
export function subscribePackProgress(jobId: string, listener: (progress: PackProgress) => void): () => void {
  const subscription = DeviceEventEmitter.addListener(PACK_PROGRESS_EVENT, (event: PackProgress) => {
    if (event?.jobId === jobId) listener(event);
  });
  return () => subscription.remove();
}

let jobCounter = 0;

/** A fresh id for one native job, so progress events reach only their own listener. */
export function nextJobId(prefix: string): string {
  jobCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${jobCounter}`;
}
