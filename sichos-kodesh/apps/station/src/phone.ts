import { copyFile, mkdir, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Delta, DeviceFile, HaveFile, PackIndexEntry, PackIndexFile } from '@sichos-kodesh/pack-format';
import { PACK_EXTENSION, computeDelta, parseDeviceFile, parseHaveFile } from '@sichos-kodesh/pack-format';
import { formatBytes } from './labels.js';

/**
 * A plugged-in phone (the daytime half of WP6). The app writes
 * `state/have.json` (every object it holds) and `state/device.json` (model,
 * free space) into its shared folder after every import; the station reads
 * both, picks the mirror's packs that bring the phone something new and
 * fit its free space, and copies them into `import/`. The app imports them
 * the next time it opens, checks every file, and deletes each pack.
 *
 * `PhoneFolder` is the shared folder (`Documents/SichosKodesh`) however it
 * is reached: a mounted path here (`directoryPhone`), MTP in the Windows
 * shell later.
 */

export const IMPORT_DIR = 'import';
export const STATE_DIR = 'state';
const PARTIAL = '.partial';

export interface PhoneFolder {
  /** A text file under the shared folder, or null when it is not there. */
  readText(relative: string): Promise<string | null>;
  /** File names in a folder; empty when the folder is not there. */
  list(relative: string): Promise<string[]>;
  size(relative: string): Promise<number | null>;
  /** Copies a local file in, creating folders as needed. */
  copyIn(localFile: string, relative: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(relative: string): Promise<void>;
}

/** A shared folder reached as a path: USB storage, a card reader, or a folder synced with the phone. */
export function directoryPhone(root: string): PhoneFolder {
  const at = (relative: string) => path.join(root, ...relative.split('/'));
  return {
    readText: (relative) => readFile(at(relative), 'utf8').catch(() => null),
    list: (relative) => readdir(at(relative)).catch(() => []),
    size: (relative) =>
      stat(at(relative)).then(
        (info) => (info.isFile() ? info.size : null),
        () => null,
      ),
    async copyIn(localFile, relative) {
      await mkdir(path.dirname(at(relative)), { recursive: true });
      await copyFile(localFile, at(relative));
    },
    rename: (from, to) => rename(at(from), at(to)),
    remove: (relative) => unlink(at(relative)),
  };
}

/**
 * Where the shared folder is, given what was plugged in: the folder itself,
 * or a storage root holding `Documents/SichosKodesh`. Null when neither.
 */
export async function findSharedFolder(root: string): Promise<string | null> {
  const isDir = (dir: string) =>
    stat(dir).then(
      (info) => info.isDirectory(),
      () => false,
    );
  if ((await isDir(path.join(root, STATE_DIR))) || (await isDir(path.join(root, IMPORT_DIR)))) return root;
  const nested = path.join(root, 'Documents', 'SichosKodesh');
  return (await isDir(nested)) ? nested : null;
}

export interface PhoneState {
  have: HaveFile | null;
  device: DeviceFile | null;
  /** Packs already sitting in `import/`, waiting for the app. */
  pending: string[];
}

const parseJson = (text: string | null): unknown => {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

export async function readPhoneState(phone: PhoneFolder): Promise<PhoneState> {
  const have = parseHaveFile(parseJson(await phone.readText(`${STATE_DIR}/have.json`)));
  const device = parseDeviceFile(parseJson(await phone.readText(`${STATE_DIR}/device.json`)));
  const pending = (await phone.list(IMPORT_DIR)).filter((name) => name.endsWith(PACK_EXTENSION)).sort();
  return { have, device, pending };
}

export interface PlannedPack {
  entry: PackIndexEntry;
  delta: Delta;
  /** The pack file plus what its import writes. */
  cost: number;
  label: string;
}

export interface PhonePlan {
  copy: PlannedPack[];
  /** Worth copying, but beyond the phone's free space. */
  noRoom: PlannedPack[];
  copyBytes: number;
  newBytes: number;
  /** device.json's free space less the copy, its import and the reserve; null when device.json is missing. */
  freeAfter: number | null;
  /** One line for the station's button, in Hebrew. */
  summary: string;
  warnings: string[];
}

export function packLabel(entry: PackIndexEntry): string {
  const part = entry.part && entry.part.count > 1 ? ` · חלק ${entry.part.index + 1} מתוך ${entry.part.count}` : '';
  return `${entry.scope.label.he}${part}`;
}

/**
 * Which packs to copy, best first: each round takes the pack that brings
 * the most new bytes given what the phone holds and what is already on its
 * way, while it fits. A pack costs its own size plus the objects its
 * import writes, since the app deletes the pack only after importing it.
 */
export function planPhone(index: PackIndexFile, state: PhoneState, options: { reserveBytes: number }): PhonePlan {
  const warnings: string[] = [];
  const held = new Set(state.have?.objects ?? []);
  if (!state.have) warnings.push('state/have.json is missing or unreadable: the app has not written it yet, so every object counts as new.');
  if (!state.device) warnings.push('state/device.json is missing or unreadable: the free space is unknown, so nothing is held back for it.');

  const pending = new Set(state.pending);
  for (const entry of index.packs) if (pending.has(entry.file)) for (const sha of Object.keys(entry.objects)) held.add(sha);

  let budget = state.device ? state.device.freeBytes - options.reserveBytes : Number.POSITIVE_INFINITY;
  let remaining = index.packs.filter((entry) => !pending.has(entry.file));
  const copy: PlannedPack[] = [];
  const noRoom: PlannedPack[] = [];
  for (;;) {
    let best: PlannedPack | null = null;
    for (const entry of remaining) {
      const delta = computeDelta(entry, held);
      if (delta.missing.length === 0) continue;
      if (!best || delta.missingBytes > best.delta.missingBytes) best = { entry, delta, cost: entry.bytes + delta.missingBytes, label: packLabel(entry) };
    }
    if (!best) break;
    const chosen = best;
    remaining = remaining.filter((entry) => entry !== chosen.entry);
    if (chosen.cost <= budget) {
      copy.push(chosen);
      budget -= chosen.cost;
      for (const sha of chosen.delta.missing) held.add(sha);
    } else {
      noRoom.push(chosen);
    }
  }

  const copyBytes = copy.reduce((sum, pack) => sum + pack.entry.bytes, 0);
  const newBytes = copy.reduce((sum, pack) => sum + pack.delta.missingBytes, 0);
  let summary: string;
  if (copy.length > 0) summary = `טען ${copy[0]!.label}${copy.length > 1 ? ` ועוד ${copy.length - 1}` : ''} · ${formatBytes(copyBytes)}`;
  else if (noRoom.length > 0) summary = `אין מקום בטלפון: צריך עוד ${formatBytes(noRoom[0]!.cost - Math.max(0, budget))}`;
  else if (index.packs.length === 0) summary = 'בתחנה עדיין אין חבילות: הריצו sync';
  else summary = state.pending.length > 0 ? 'הטלפון מעודכן · יש חבילות שממתינות לייבוא: פתחו את האפליקציה' : 'הטלפון מעודכן';
  return { copy, noRoom, copyBytes, newBytes, freeAfter: state.device ? budget : null, summary, warnings };
}

export interface LoadReport {
  copied: string[];
  bytes: number;
}

/**
 * Copies the plan's packs into `import/`. Each is written under a
 * `.partial` name and renamed once whole, so the app, which takes only
 * `.skpack` files, never sees a half-copied pack.
 */
export async function loadPhone(plan: PhonePlan, packsDir: string, phone: PhoneFolder, onPack?: (file: string, index: number, count: number) => void): Promise<LoadReport> {
  const report: LoadReport = { copied: [], bytes: 0 };
  for (const [i, pack] of plan.copy.entries()) {
    const file = pack.entry.file;
    onPack?.(file, i, plan.copy.length);
    const partial = `${IMPORT_DIR}/${file}${PARTIAL}`;
    await phone.copyIn(path.join(packsDir, file), partial);
    const copied = await phone.size(partial);
    if (copied !== pack.entry.bytes) {
      await phone.remove(partial).catch(() => undefined);
      throw new Error(`${file}: copied ${copied ?? 0} of ${pack.entry.bytes} bytes`);
    }
    await phone.rename(partial, `${IMPORT_DIR}/${file}`);
    report.copied.push(file);
    report.bytes += pack.entry.bytes;
  }
  return report;
}
