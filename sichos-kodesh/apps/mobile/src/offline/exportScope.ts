import { gematriya } from '@hebcal/core';
import RNBlobUtil from 'react-native-blob-util';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { mafteiachMonthName, mafteiachMonthNameHebrew, mafteiachMonthToken } from '@sichos-kodesh/catalog';
import type { ObjectRef, PackEntry, PackManifest, PackScope } from '@sichos-kodesh/pack-format';
import { MANIFEST_ENTRY_NAME, PACK_SCHEMA_VERSION } from '@sichos-kodesh/pack-format';
import { catalogStore, getCatalog } from '../catalog/catalogStore';
import type { HeldObject } from './objectStore';
import { documentPath, readHeldObjects, recordHeldObjects } from './objectStore';
import type { ExportZipEntry, PacksNativeModule } from './packsNative';
import { IMPORT_SPACE_MARGIN, objectFileName } from './placement';

/**
 * "Share a month or a year as a file" (docs/offline-plan.md WP4 item 4):
 * what is on this phone for one scope, as a plain stored ZIP in `export/`
 * of the shared folder. Folders are Hebrew (`תשל״ו/תשרי/י״ג - שמחת
 * תורה/`), files keep their upstream names (`JEMSK0562A.mp3`,
 * `<driveFileId>.pdf`), and an unsigned `manifest.json` comes first. So
 * the ZIP bochurim pass on is already our format: another phone imports it
 * by hash or by name (looseImport.ts), and any file manager opens it.
 */

export const EXPORT_DIR = 'export';

export interface ExportChoice {
  hebrewYear: number;
  /** mafteiach month token (`01`..`12`, `06A`/`06B`); the whole year when absent. */
  month?: string;
}

/** Characters no file system takes, and quotes turned into their Hebrew forms (gershayim, geresh). */
export function safeFolderName(text: string): string {
  return text
    .replace(/"/g, '״')
    .replace(/'/g, '׳')
    .replace(/[\\/:*?<>|]/g, ' ')
    .split('')
    .map((ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
}

export function exportScopeOf(choice: ExportChoice): PackScope {
  const yearHe = gematriya(choice.hebrewYear);
  if (!choice.month) return { kind: 'year', collection: 'farbrengens', hebrewYear: choice.hebrewYear, label: { en: String(choice.hebrewYear), he: yearHe } };
  const probe = `${choice.hebrewYear}-${choice.month}-01`;
  return {
    kind: 'month',
    collection: 'farbrengens',
    hebrewYear: choice.hebrewYear,
    month: choice.month,
    label: { en: `${mafteiachMonthName(probe)} ${choice.hebrewYear}`, he: `${mafteiachMonthNameHebrew(probe)} ${yearHe}` },
  };
}

/** `תשל״ו/תשרי/י״ג - שמחת תורה` for one occasion. */
export function occasionFolder(entry: CatalogEntry): string {
  const day = Number(entry.hebrewDate.split('-')[2]);
  const dayHe = Number.isFinite(day) && day > 0 ? gematriya(day) : '';
  const occasion = safeFolderName(dayHe ? `${dayHe} - ${entry.occasionLabel}` : entry.occasionLabel) || String(entry.occasionId);
  return `${gematriya(entry.hebrewYear)}/${safeFolderName(mafteiachMonthNameHebrew(entry.hebrewDate))}/${occasion}`;
}

export function entriesForChoice(entries: CatalogEntry[], choice: ExportChoice): CatalogEntry[] {
  return entries
    .filter((entry) => entry.hebrewYear === choice.hebrewYear && (!choice.month || mafteiachMonthToken(entry.hebrewDate) === choice.month))
    .sort((a, b) => a.hebrewDate.localeCompare(b.hebrewDate) || a.occasionId - b.occasionId);
}

export interface ExportFile {
  /** Path inside the ZIP. */
  name: string;
  /** Relative to the files directory. */
  file: string;
  entry: CatalogEntry;
  ref: Omit<ObjectRef, 'sha256' | 'bytes'>;
}

/** Pure: which of the scope's files the phone has, and where each goes in the ZIP. A file that serves two occasions goes in once. */
export function planExport(entries: CatalogEntry[], existing: ReadonlySet<string>): ExportFile[] {
  const files: ExportFile[] = [];
  const used = new Set<string>();
  const add = (entry: CatalogEntry, file: string | null, ref: ExportFile['ref']) => {
    if (!file || used.has(file) || !existing.has(file)) return;
    used.add(file);
    files.push({ name: `${occasionFolder(entry)}/${file}`, file, entry, ref });
  };
  for (const entry of entries) {
    entry.audio.forEach((chapter, index) => {
      const ref: ExportFile['ref'] = { kind: 'audio', profile: 'src', sourceId: chapter.workerFilename, role: String(index), durationMs: chapter.durationMs };
      if (chapter.chapterName) ref.label = chapter.chapterName;
      add(entry, objectFileName('audio', chapter.workerFilename, 'src'), ref);
    });
    for (const pdf of entry.pdfs) add(entry, objectFileName('pdf', pdf.driveFileId), { kind: 'pdf', sourceId: pdf.driveFileId, role: pdf.section, label: pdf.label });
  }
  return files;
}

/** The unsigned manifest that opens the ZIP: the same shape as a pack's. */
export function exportManifest(scope: PackScope, files: Array<ExportFile & { sha256: string; bytes: number }>, catalogVersion: string, now: Date): PackManifest {
  const entries = new Map<number, PackEntry>();
  const objects: Record<string, number> = {};
  for (const file of files) {
    let entry = entries.get(file.entry.occasionId);
    if (!entry) {
      entry = { collection: 'farbrengens', itemId: String(file.entry.occasionId), hebrewYear: file.entry.hebrewYear, hebrewDate: file.entry.hebrewDate, label: file.entry.occasionLabel, refs: [] };
      entries.set(file.entry.occasionId, entry);
    }
    entry.refs.push({ ...file.ref, sha256: file.sha256, bytes: file.bytes });
    objects[file.sha256] = file.bytes;
  }
  const slug = `${scope.hebrewYear ?? ''}${scope.month ? `-${scope.month}` : ''}`;
  return {
    schema: PACK_SCHEMA_VERSION,
    packId: `export:${slug}:${Object.keys(objects).length}`,
    builtAt: now.toISOString(),
    catalogVersion,
    profile: { audio: 'src' },
    scope,
    entries: [...entries.values()],
    objects,
  };
}

export function exportFileName(scope: PackScope): string {
  return `${safeFolderName(scope.label.he)}.zip`;
}

export interface ExportOutcome {
  fileName: string;
  uri: string;
  files: number;
  bytes: number;
}

/** Hashes what the store does not know yet (natively), writes the ZIP. Throws when there is nothing to share or no room. */
export async function exportChoice(native: PacksNativeModule, treeUri: string, choice: ExportChoice, jobId: string): Promise<ExportOutcome> {
  const entries = entriesForChoice(Object.values(getCatalog()).flat(), choice);
  let onPhone: Set<string>;
  try {
    onPhone = new Set(await RNBlobUtil.fs.ls(RNBlobUtil.fs.dirs.DocumentDir));
  } catch {
    onPhone = new Set();
  }
  const files = planExport(entries, onPhone);
  if (files.length === 0) throw new Error('nothing-to-export');

  const held = await readHeldObjects();
  const byFile = new Map(Object.values(held).map((object) => [object.file, object]));
  const now = new Date();
  const hashed: HeldObject[] = [];
  const withHashes: Array<ExportFile & { sha256: string; bytes: number }> = [];
  for (const file of files) {
    let object = byFile.get(file.file);
    if (!object) {
      const { sha256, bytes } = await native.hashFile(documentPath(file.file));
      object = {
        sha256,
        bytes,
        kind: file.ref.kind,
        ...(file.ref.profile ? { profile: file.ref.profile } : {}),
        sourceId: file.ref.sourceId,
        file: file.file,
        collection: 'farbrengens',
        itemId: String(file.entry.occasionId),
        source: 'download',
        verified: true,
        addedAt: now.toISOString(),
      };
      hashed.push(object);
    }
    withHashes.push({ ...file, sha256: object.sha256, bytes: object.bytes });
  }
  await recordHeldObjects(hashed);

  const bytes = withHashes.reduce((sum, file) => sum + file.bytes, 0);
  const device = await native.deviceInfo();
  if (device.freeBytes < bytes + IMPORT_SPACE_MARGIN) throw new Error('no-space');

  const scope = exportScopeOf(choice);
  const manifest = exportManifest(scope, withHashes, catalogStore.get().version, now);
  const zipEntries: ExportZipEntry[] = [{ name: MANIFEST_ENTRY_NAME, text: JSON.stringify(manifest) }, ...withHashes.map((file) => ({ name: file.name, path: documentPath(file.file) }))];
  const fileName = exportFileName(scope);
  const uri = await native.exportZip(treeUri, EXPORT_DIR, fileName, zipEntries, jobId);
  return { fileName, uri, files: withHashes.length, bytes };
}
