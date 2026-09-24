import type { ObjectIndexEntry, ObjectsIndex } from './objectsIndex.js';
import { MANIFEST_ENTRY_NAME, isSha256, sha256FromEntryName } from './manifest.js';

/**
 * Identification of loose files: a zip a bochur passed on, a folder copied
 * by hand, our own export. Known by hash first (the objects index), then
 * by name as a fallback, with the folder path giving a scope for files we
 * cannot place otherwise.
 */

export interface FileListing {
  /** Path inside the zip or folder, forward slashes. */
  path: string;
  bytes: number;
  /** Known when the caller hashed the file; identification is by name only without it. */
  sha256?: string;
}

export type Identification =
  | { status: 'known'; sha256: string; entry: ObjectIndexEntry }
  | { status: 'guessed'; kind: 'audio' | 'pdf'; sourceId: string; scope: FolderScope | null }
  | { status: 'manifest' }
  | { status: 'unknown'; scope: FolderScope | null };

export interface FolderScope {
  hebrewYear: number;
  /** mafteiach month token when the folder names one. */
  month?: string;
}

const JEM_FILENAME_RE = /^(JEMSK\d{4}[A-D]?|AR\d{7})\.mp3$/i;
const DRIVE_ID_RE = /(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{25,})(?:[^A-Za-z0-9_-]|$)/;
/** Our export names an object file by its sha256 followed by a readable suffix. */
const EXPORT_NAME_RE = /^([0-9a-f]{64})(?:[-_.].*)?$/i;

const HEBREW_MONTHS: Record<string, string> = {
  'תשרי': '01',
  'חשון': '02',
  'חשוון': '02',
  'מרחשון': '02',
  'מרחשוון': '02',
  'כסלו': '03',
  'טבת': '04',
  'שבט': '05',
  'אדר': '06',
  'אדר א': '06A',
  "אדר א'": '06A',
  'אדר ב': '06B',
  "אדר ב'": '06B',
  'ניסן': '07',
  'אייר': '08',
  'סיון': '09',
  'סיוון': '09',
  'תמוז': '10',
  'אב': '11',
  'מנחם אב': '11',
  'מנחם-אב': '11',
  'אלול': '12',
};

const HEBREW_LETTER_VALUES: Record<string, number> = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
  'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90,
  'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400,
};

/** `תשמ"ח` / `תשמח` / `ה'תשמ"ח` -> 5748. Null when the letters are not a year. */
export function hebrewYearFromGematria(text: string): number | null {
  let cleaned = text.replace(/[׳״'"׳״]/g, '').trim();
  if (cleaned.startsWith("ה")) cleaned = cleaned.slice(1);
  if (!/^[א-ת]{2,5}$/.test(cleaned)) return null;
  let value = 0;
  for (const ch of cleaned) {
    const v = HEBREW_LETTER_VALUES[ch];
    if (!v) return null;
    value += v;
  }
  // The thousands digit is dropped in writing (תשמ"ח = 748); the catalog spans 5690-5760.
  if (value >= 690 && value <= 760) return 5000 + value;
  return null;
}

/** Reads a scope out of a folder path: `5748/01`, `5748-06A`, `תשמ"ח/תשרי`, `5748 תשרי`. */
export function parseFolderScope(path: string): FolderScope | null {
  const parts = path.split('/').slice(0, -1);
  let year: number | null = null;
  let month: string | undefined;
  for (const part of parts) {
    const trimmed = part.trim();
    const numeric = /^(5[6-7]\d\d)(?:[-_ ]+(0[1-9]|1[0-2]|06A|06B))?$/i.exec(trimmed);
    if (numeric) {
      year = Number(numeric[1]);
      if (numeric[2]) month = numeric[2].toUpperCase();
      continue;
    }
    const monthToken = /^(0[1-9]|1[0-2]|06A|06B)$/i.exec(trimmed);
    if (monthToken && year !== null) {
      month = monthToken[1]!.toUpperCase();
      continue;
    }
    for (const token of trimmed.split(/\s+/)) {
      const gematria = hebrewYearFromGematria(token);
      if (gematria) year = gematria;
    }
    const monthName = Object.keys(HEBREW_MONTHS).find((name) => trimmed === name || trimmed.endsWith(` ${name}`) || trimmed.startsWith(`${name} `));
    if (monthName) month = HEBREW_MONTHS[monthName];
  }
  if (year === null) return null;
  return month ? { hebrewYear: year, month } : { hebrewYear: year };
}

export function identifyFile(file: FileListing, index: ObjectsIndex | null): Identification {
  const name = file.path.split('/').pop() ?? file.path;
  if (name === MANIFEST_ENTRY_NAME) return { status: 'manifest' };
  const byEntryName = sha256FromEntryName(file.path.replace(/^.*\/(?=objects\/)/, ''));
  const candidates = [file.sha256, byEntryName, EXPORT_NAME_RE.exec(name)?.[1]?.toLowerCase()].filter(isSha256);
  if (index) {
    for (const sha of candidates) {
      const entry = index.objects[sha];
      if (entry) return { status: 'known', sha256: sha, entry };
    }
  }
  const scope = parseFolderScope(file.path);
  if (JEM_FILENAME_RE.test(name)) return { status: 'guessed', kind: 'audio', sourceId: name.replace(/\.mp3$/i, '').toUpperCase() + '.mp3', scope };
  if (/\.pdf$/i.test(name)) {
    const driveId = DRIVE_ID_RE.exec(name.replace(/\.pdf$/i, ''))?.[1];
    if (driveId) return { status: 'guessed', kind: 'pdf', sourceId: driveId, scope };
  }
  return { status: 'unknown', scope };
}

export interface ImportPlan {
  /** Known objects the phone lacks: store these. */
  store: Array<{ path: string; sha256: string; bytes: number; entry: ObjectIndexEntry }>;
  /** Known objects already held: skip. */
  held: number;
  heldBytes: number;
  /** Named like something we know, but unverifiable by hash: keep only with a scope, as unverified. */
  guessed: Array<{ path: string; kind: 'audio' | 'pdf'; sourceId: string; scope: FolderScope | null; bytes: number }>;
  unknown: Array<{ path: string; bytes: number }>;
  bytesToStore: number;
  hasManifest: boolean;
}

/** Plans an import of loose files against the index and what the phone holds. Pure; the worker executes it. */
export function importPlan(listing: FileListing[], index: ObjectsIndex | null, have: Iterable<string>): ImportPlan {
  const held = have instanceof Set ? (have as Set<string>) : new Set(have);
  const plan: ImportPlan = { store: [], held: 0, heldBytes: 0, guessed: [], unknown: [], bytesToStore: 0, hasManifest: false };
  const seen = new Set<string>();
  for (const file of listing) {
    const id = identifyFile(file, index);
    if (id.status === 'manifest') {
      plan.hasManifest = true;
    } else if (id.status === 'known') {
      if (held.has(id.sha256) || seen.has(id.sha256)) {
        plan.held += 1;
        plan.heldBytes += id.entry.bytes;
      } else {
        seen.add(id.sha256);
        plan.store.push({ path: file.path, sha256: id.sha256, bytes: id.entry.bytes, entry: id.entry });
        plan.bytesToStore += id.entry.bytes;
      }
    } else if (id.status === 'guessed') {
      plan.guessed.push({ path: file.path, kind: id.kind, sourceId: id.sourceId, scope: id.scope, bytes: file.bytes });
    } else {
      plan.unknown.push({ path: file.path, bytes: file.bytes });
    }
  }
  return plan;
}
