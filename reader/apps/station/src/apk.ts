import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_RELEASE_BASE_URL, APP_RELEASE_PATH, parseLatestAppRelease } from '@chassidushub-reader/app-core';
import type { FetchFn } from './api.js';

/**
 * The app itself, for a phone that does not have it yet: the station keeps
 * the newest release's phone APKs in `<mirror>/apk/` and copies one into the
 * phone's `Download/` folder, where its file manager installs it. They come
 * from the app server (packs.chassidushub.org/v1/app/android/, app-core's
 * appRelease.ts), each checked against its sha256.
 */

export const APK_DIR = 'apk';
/** The two per-ABI APKs; the universal one is both in one, twice the size. */
export const APK_ABIS = ['arm64-v8a', 'armeabi-v7a'] as const;
export type ApkAbi = (typeof APK_ABIS)[number];

export interface ApkReport {
  version: string;
  downloaded: string[];
  kept: string[];
}

export async function syncApk(root: string, fetchFn: FetchFn = (url) => fetch(url), server: string = APP_RELEASE_BASE_URL): Promise<ApkReport> {
  const base = server.replace(/\/$/, '');
  const response = await fetchFn(`${base}${APP_RELEASE_PATH}`);
  if (!response.ok) throw new Error(`the app server's newest release: HTTP ${response.status}`);
  const release = parseLatestAppRelease(await response.json());
  if (!release) throw new Error("the app server's latest.json is unreadable");
  const dir = path.join(root, APK_DIR);
  await mkdir(dir, { recursive: true });
  const report: ApkReport = { version: release.version, downloaded: [], kept: [] };
  const wanted = release.files.filter((file) => (APK_ABIS as readonly string[]).includes(file.abi));
  for (const file of wanted) {
    const target = path.join(dir, file.file);
    const size = await stat(target).then(
      (info) => info.size,
      () => null,
    );
    if (size === file.bytes) {
      report.kept.push(file.file);
      continue;
    }
    const download = await fetchFn(`${base}${file.path}`);
    if (!download.ok) throw new Error(`${file.file}: HTTP ${download.status}`);
    const bytes = new Uint8Array(await download.arrayBuffer());
    if (bytes.length !== file.bytes) throw new Error(`${file.file}: got ${bytes.length} of ${file.bytes} bytes`);
    if (file.sha256 && createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`${file.file}: the bytes do not match its sha256`);
    await writeFile(`${target}.partial`, bytes);
    await rename(`${target}.partial`, target);
    report.downloaded.push(file.file);
  }
  // Older versions go once the new ones are in.
  const keep = new Set(wanted.map((file) => file.file));
  for (const name of await readdir(dir)) if (name.endsWith('.apk') && !keep.has(name)) await unlink(path.join(dir, name));
  return report;
}

/** The mirrored APK for one ABI, or null before `syncApk` found one. */
export async function mirroredApk(root: string, abi: ApkAbi = 'arm64-v8a'): Promise<string | null> {
  const dir = path.join(root, APK_DIR);
  const names = await readdir(dir).catch(() => [] as string[]);
  const name = names.find((n) => n.endsWith(`-${abi}.apk`));
  return name ? path.join(dir, name) : null;
}

/** Copies the APK into `<storage>/Download/`, returning where it went. */
export async function copyApkTo(root: string, storageRoot: string, abi: ApkAbi = 'arm64-v8a'): Promise<string> {
  const apk = await mirroredApk(root, abi);
  if (!apk) throw new Error(`no ${abi} APK in the mirror yet: run sk-station apk first`);
  const target = path.join(storageRoot, 'Download', path.basename(apk));
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(apk, target);
  return target;
}
