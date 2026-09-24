import { copyFile, mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FetchFn } from './api.js';

/**
 * The app itself, for a phone that does not have it yet: the station keeps
 * the latest GitHub Release's phone APKs in `<mirror>/apk/` and copies one
 * into the phone's `Download/` folder, where its file manager installs it.
 */

export const APK_DIR = 'apk';
export const DEFAULT_REPO = 'shmuky/Sichos-Kodesh';
/** The two per-ABI APKs; the universal one is both in one, twice the size. */
export const APK_ABIS = ['arm64-v8a', 'armeabi-v7a'] as const;
export type ApkAbi = (typeof APK_ABIS)[number];

interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

export interface ApkReport {
  tag: string;
  downloaded: string[];
  kept: string[];
}

export async function syncApk(root: string, fetchFn: FetchFn = (url) => fetch(url), repo = DEFAULT_REPO): Promise<ApkReport> {
  const response = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`);
  if (!response.ok) throw new Error(`latest release of ${repo}: HTTP ${response.status}`);
  const release = (await response.json()) as { tag_name: string; assets: ReleaseAsset[] };
  const dir = path.join(root, APK_DIR);
  await mkdir(dir, { recursive: true });
  const report: ApkReport = { tag: release.tag_name, downloaded: [], kept: [] };
  const wanted = release.assets.filter((asset) => APK_ABIS.some((abi) => asset.name.endsWith(`-${abi}.apk`)));
  for (const asset of wanted) {
    const target = path.join(dir, asset.name);
    const size = await stat(target).then(
      (info) => info.size,
      () => null,
    );
    if (size === asset.size) {
      report.kept.push(asset.name);
      continue;
    }
    const download = await fetchFn(asset.browser_download_url);
    if (!download.ok) throw new Error(`${asset.name}: HTTP ${download.status}`);
    const bytes = new Uint8Array(await download.arrayBuffer());
    if (bytes.length !== asset.size) throw new Error(`${asset.name}: got ${bytes.length} of ${asset.size} bytes`);
    await writeFile(`${target}.partial`, bytes);
    await rename(`${target}.partial`, target);
    report.downloaded.push(asset.name);
  }
  // Older versions go once the new ones are in.
  const keep = new Set(wanted.map((asset) => asset.name));
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
