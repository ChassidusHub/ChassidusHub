import { CATALOG_API_BASE_URL } from '../catalog/catalogUpdate.js';
import type { FetchLike } from '../catalog/catalogUpdate.js';

/**
 * The phone app's newest release, as the app server keeps it: the release
 * workflow uploads each APK to the pack API Worker (R2), which keeps only
 * the newest version and serves `latest.json` beside the files;
 * api.sk.chassidushub.org passes both through. The phone asks it whether to
 * offer an update, the download site and the station link to its files.
 * Nothing here comes from GitHub.
 *
 *   GET /v1/app/android/latest.json          this LatestAppRelease
 *   GET /v1/app/android/download/<abi>       the newest APK for that ABI
 */

export const APP_RELEASE_BASE_URL = CATALOG_API_BASE_URL;
export const APP_RELEASE_PATH = '/v1/app/android/latest.json';

/** The APKs of a release: one per phone ABI, and one holding both (twice the size). */
export const APP_ABIS = ['arm64-v8a', 'armeabi-v7a', 'universal'] as const;
export type AppAbi = (typeof APP_ABIS)[number];

export function isAppAbi(value: string): value is AppAbi {
  return (APP_ABIS as readonly string[]).includes(value);
}

export interface AppReleaseFile {
  abi: AppAbi;
  /** What it is saved as: `sichos-kodesh-1.13.0-arm64-v8a.apk`. */
  file: string;
  bytes: number;
  sha256: string;
  /** Where it downloads, from the server's origin: `/v1/app/android/download/arm64-v8a`. */
  path: string;
}

export interface LatestAppRelease {
  schema: 1;
  platform: 'android';
  version: string;
  versionCode: number;
  publishedAt: string;
  /** The changelog entry of the version, in both languages. */
  notes: { he: string[]; en: string[] };
  files: AppReleaseFile[];
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

export function isAppVersion(value: string): boolean {
  return VERSION.test(value);
}

/** Negative when `a` is older than `b`, 0 when equal, positive when newer. An unreadable version counts as the oldest. */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION.exec(a);
  const pb = VERSION.exec(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function appDownloadPath(abi: AppAbi): string {
  return `/v1/app/android/download/${abi}`;
}

export function appFileName(version: string, abi: AppAbi): string {
  return `sichos-kodesh-${version}-${abi}.apk`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string') : [];
}

/** A latest.json as served, or null when it is not one (a proxy's error page, an older shape). */
export function parseLatestAppRelease(value: unknown): LatestAppRelease | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.schema !== 1 || v.platform !== 'android' || typeof v.version !== 'string' || !isAppVersion(v.version)) return null;
  if (typeof v.versionCode !== 'number' || typeof v.publishedAt !== 'string' || !Array.isArray(v.files)) return null;
  const files: AppReleaseFile[] = [];
  for (const raw of v.files as unknown[]) {
    if (!raw || typeof raw !== 'object') return null;
    const f = raw as Record<string, unknown>;
    if (typeof f.abi !== 'string' || !isAppAbi(f.abi) || typeof f.file !== 'string' || typeof f.bytes !== 'number' || typeof f.sha256 !== 'string' || typeof f.path !== 'string') return null;
    files.push({ abi: f.abi, file: f.file, bytes: f.bytes, sha256: f.sha256, path: f.path });
  }
  const notes = (v.notes ?? {}) as Record<string, unknown>;
  return { schema: 1, platform: 'android', version: v.version, versionCode: v.versionCode, publishedAt: v.publishedAt, notes: { he: stringList(notes.he), en: stringList(notes.en) }, files };
}

/**
 * The APK for a phone: the first of its ABIs (most preferred first, as
 * Android lists them) the release has a file for, else the universal one.
 */
export function pickAppFile(release: LatestAppRelease, supportedAbis: readonly string[]): AppReleaseFile | null {
  for (const abi of supportedAbis) {
    const file = release.files.find((f) => f.abi === abi);
    if (file) return file;
  }
  return release.files.find((f) => f.abi === 'universal') ?? release.files[0] ?? null;
}

export function appFileUrl(file: Pick<AppReleaseFile, 'path'>, baseUrl: string = APP_RELEASE_BASE_URL): string {
  return `${baseUrl.replace(/\/$/, '')}${file.path}`;
}

/** Asks the server for the newest release; null when it cannot say (offline, nothing published yet). Never throws. */
export async function fetchLatestAppRelease(options: { baseUrl?: string; fetchFn?: FetchLike } = {}): Promise<LatestAppRelease | null> {
  const { baseUrl = APP_RELEASE_BASE_URL, fetchFn = fetch as FetchLike } = options;
  try {
    const response = await fetchFn(`${baseUrl.replace(/\/$/, '')}${APP_RELEASE_PATH}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return parseLatestAppRelease(await response.json());
  } catch {
    return null;
  }
}

/** "Later" on an update's question: which version it was about and when. */
export interface UpdatePromptRecord {
  version: string;
  dismissedAt: number;
}

/** "Later" keeps a version quiet this long; a newer version asks straight away. */
export const UPDATE_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

/** Whether to ask now: a newer release, not put off for it recently. */
export function shouldPromptUpdate(latest: LatestAppRelease | null, currentVersion: string, record: UpdatePromptRecord | null, now: number = Date.now()): boolean {
  if (!latest || compareVersions(latest.version, currentVersion) <= 0) return false;
  if (latest.files.length === 0) return false;
  if (record && record.version === latest.version && now - record.dismissedAt < UPDATE_SNOOZE_MS) return false;
  return true;
}
