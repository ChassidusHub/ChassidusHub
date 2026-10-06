import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { gematriya } from '@hebcal/core';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { mafteiachDay, mafteiachMonthNameHebrew, mafteiachMonthToken } from '@chassidushub-reader/catalog';
import { translateChapterName } from '@chassidushub-reader/catalog/translate';
import { entryStream, readEntry, readZipDirectory } from '@chassidushub-reader/pack-builder';
import type { PackEntry, PackIndexFile } from '@chassidushub-reader/pack-format';
import { MANIFEST_ENTRY_NAME, objectEntryName, parsePackManifest, parseScope } from '@chassidushub-reader/pack-format';
import { safeName } from './labels.js';
import { mirrorPaths } from './mirror.js';

/**
 * Player mode (WP6's "dumb-player mode"): the mirror's recordings as plain
 * MP3 files for a player with no app, in folders any player sorts right:
 *
 *   ChassidusHub/5736 תשל״ו/01 תשרי/13 י״ג - שמחת תורה/01 שיחה א׳.mp3
 *
 * The numbers lead so a player that sorts by name plays them in order
 * (Hebrew numerals do not sort: ט״ו comes before י״ג). Only MP3 packs
 * (`src`, `mp3-32`) serve; an Opus pack is skipped and reported. A file
 * already there with the right size is left alone, so a second run adds
 * only what is new.
 */

export const PLAYER_ROOT = 'ChassidusHub';
const MP3_PROFILES = new Set(['src', 'mp3-32']);

export interface PlayerReport {
  written: number;
  kept: number;
  bytes: number;
  /** Packs skipped because their audio is not MP3. */
  notMp3: string[];
}

export interface PlayerOptions {
  root: string;
  index: PackIndexFile;
  /** Where the player is mounted; the files go under `<out>/ChassidusHub/`. */
  out: string;
  /** Only these scopes (`5736`, `5736-01`); every pack when absent. */
  scopes?: string[];
  onFile?: (relative: string) => void;
}

/** The folder of one occasion, relative to the player's root. */
export function occasionFolder(entry: Pick<PackEntry, 'hebrewYear' | 'hebrewDate' | 'label' | 'itemId'>): string {
  const year = entry.hebrewYear ?? Number(entry.hebrewDate?.slice(0, 4));
  const date = entry.hebrewDate ?? `${year}-01-01`;
  const token = mafteiachMonthToken(date);
  const day = mafteiachDay(date);
  const occasion = safeName(entry.label ?? entry.itemId) || entry.itemId;
  const dayHe = gematriya(day);
  // A label that is itself the date ("ו׳ תשרי") is not repeated after it.
  const name = occasion.startsWith(`${dayHe} `) ? occasion : `${dayHe} - ${occasion}`;
  return [PLAYER_ROOT, `${year} ${gematriya(year)}`, `${token} ${mafteiachMonthNameHebrew(date)}`, safeName(`${String(day).padStart(2, '0')} ${name}`)].join('/');
}

/** Hebrew chapter names by recording (the catalog's `chapterNameHe`), from the mirror's catalog years. */
async function chapterNames(root: string, years: Set<number>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const year of years) {
    let entries: CatalogEntry[] = [];
    try {
      entries = JSON.parse(await readFile(mirrorPaths(root).catalog(year), 'utf8')) as CatalogEntry[];
    } catch {
      continue;
    }
    for (const entry of entries) for (const audio of entry.audio) if (audio.chapterNameHe) names.set(audio.workerFilename, audio.chapterNameHe);
  }
  return names;
}

/** Whether an occasion falls in one of the scopes (every occasion when none are given). */
function inScopes(entry: PackEntry, scopes: string[] | undefined): boolean {
  if (!scopes || scopes.length === 0) return true;
  if (!entry.hebrewDate) return false;
  const year = entry.hebrewYear ?? Number(entry.hebrewDate.slice(0, 4));
  return scopes.some((spec) => {
    const wanted = parseScope(spec);
    return wanted.year === year && (!wanted.month || wanted.month === mafteiachMonthToken(entry.hebrewDate!));
  });
}

export async function writePlayerFolders(options: PlayerOptions): Promise<PlayerReport> {
  const report: PlayerReport = { written: 0, kept: 0, bytes: 0, notMp3: [] };
  const packsDir = mirrorPaths(options.root).packs;
  const years = new Set(options.index.packs.map((pack) => pack.scope.hebrewYear).filter((y): y is number => y !== undefined));
  const names = await chapterNames(options.root, years);
  const written = new Set<string>();

  for (const pack of options.index.packs) {
    if (!MP3_PROFILES.has(pack.profile)) {
      report.notMp3.push(pack.file);
      continue;
    }
    const file = path.join(packsDir, pack.file);
    const zip = await readZipDirectory(file);
    const byName = new Map(zip.map((entry) => [entry.name, entry]));
    const manifestEntry = byName.get(MANIFEST_ENTRY_NAME);
    const manifest = manifestEntry ? parsePackManifest(JSON.parse((await readEntry(file, manifestEntry)).toString('utf8'))) : null;
    if (!manifest) continue;

    for (const entry of manifest.entries) {
      if (!inScopes(entry, options.scopes)) continue;
      const audio = entry.refs.filter((ref) => ref.kind === 'audio').sort((a, b) => Number(a.role ?? 0) - Number(b.role ?? 0));
      if (audio.length === 0) continue;
      const folder = occasionFolder(entry);
      for (const [i, ref] of audio.entries()) {
        const number = Number.isInteger(Number(ref.role)) ? Number(ref.role) + 1 : i + 1;
        // The catalog's Hebrew name; else the same rules applied here, for an archive published before them.
        const title = names.get(ref.sourceId) ?? (ref.label ? (translateChapterName(ref.label) ?? ref.label) : `קטע ${number}`);
        const relative = `${folder}/${safeName(`${String(number).padStart(2, '0')} ${title}`)}.mp3`;
        if (written.has(relative)) continue;
        written.add(relative);
        const zipEntry = byName.get(objectEntryName(ref.sha256));
        if (!zipEntry) continue;
        const target = path.join(options.out, ...relative.split('/'));
        const existing = await stat(target).then(
          (info) => info.size,
          () => null,
        );
        if (existing === zipEntry.size) {
          report.kept += 1;
          continue;
        }
        await mkdir(path.dirname(target), { recursive: true });
        await pipeline(entryStream(file, zipEntry), createWriteStream(`${target}.partial`));
        await rename(`${target}.partial`, target);
        report.written += 1;
        report.bytes += zipEntry.size;
        options.onFile?.(relative);
      }
    }
  }
  return report;
}
