import { parseHebrewNumeral } from '@chassidushub/hebrew';
import type { EntityId } from '@chassidushub/model';
import type { Catalog } from './catalog.js';
import { MAX_OPERATIONS, type OrganizeOperation, type OrganizePlan } from './organize.js';

/**
 * One record per volume. The same volume of a sefer often came in from
 * several places: two scans on HebrewBooks, a PDF in אוצרות הרבי's Drive,
 * later a typed text. Each importer made its own printing, so one volume
 * showed as two or three. Shmuly's rule (2026-10-09): every scan, PDF and
 * text of one volume is one record, with all its sources on it.
 *
 * This finds the printings of each sefer that are the same volume (and the
 * same part, where a year is printed in two: תשמ״ז חלק א and תשמ''ז א) and
 * plans their merge into one: the one people reach by a path, else one
 * from HebrewBooks, is kept, and the others' scans, sources and ids join
 * it (organize.ts `merge`). Each sefer's merges are one Suggestion. A
 * printing whose volume says no number is left alone, as is one of
 * another kind or language than the rest.
 */

export interface PrintingRow {
  id: EntityId;
  work: EntityId;
  path: string | null;
  data: Record<string, unknown>;
}

const QUOTES = /[״׳"'`]/g;
const VALUES: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };

/** A Hebrew numeral as printed (letters from high to low, ט״ו and ט״ז aside), not a word whose letters merely add up. */
function numeral(word: string): number {
  if (word === 'טו' || word === 'טז') return parseHebrewNumeral(word) ?? 0;
  const values = [...word].map((ch) => VALUES[ch]);
  if (values.length === 0 || values.some((v) => v === undefined)) return 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[i - 1]! && !(values[i - 1] === 400 && values[i] === 400)) return 0;
  return values.reduce((a, b) => a! + b!, 0)!;
}

/**
 * A volume as "<number>" or "<number>/<part>", whatever way it was written:
 * "30", "ל (בראשית)", "תשמ״ז - חלק א", "תשמ''ז א", "ח״ב". Null when no
 * number can be read from it.
 */
export function volumeKey(volume: unknown): string | null {
  if (typeof volume !== 'string') return null;
  const partOnly = /^\s*ח[״"']([א-ת])\s*$/.exec(volume); // ח״ב: the second part, of a sefer printed in parts
  if (partOnly) return `part/${numeral(partOnly[1]!)}`;
  const plain = volume.replace(/\([^)]*\)/g, ' ').replace(QUOTES, '').replace(/[-–—,:.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return null;
  const words = plain.split(' ');
  const digits = /^(\d+)$/.exec(words[0]!);
  const number = digits ? Number(digits[1]) : numeral(words[0]!);
  if (!number) return null;
  const rest = words.slice(1).filter((w) => w !== 'חלק' && w !== 'כרך');
  const part = rest.length === 1 ? (/^\d+$/.test(rest[0]!) ? Number(rest[0]) : rest[0]!.length <= 2 ? numeral(rest[0]!) : 0) : 0;
  if (rest.length > 1 || (rest.length === 1 && !part)) return null; // words we cannot read as a part: not sure enough to merge
  return part ? `${number}/${part}` : String(number);
}

function rank(p: PrintingRow): number {
  const sources = Array.isArray(p.data.sources) ? (p.data.sources as Array<{ source?: string }>) : [];
  return (p.path !== null ? 0 : 2) + (sources.some((s) => s.source === 'hebrewbooks') ? 0 : 1);
}

/** The same volume twice or more, by sefer: the printing kept first, then the ones merged into it. */
export function duplicateVolumes(rows: PrintingRow[]): Map<EntityId, PrintingRow[][]> {
  const groups = new Map<string, PrintingRow[]>();
  for (const row of rows) {
    const key = volumeKey(row.data.volume);
    if (key === null) continue;
    const kind = String(row.data.kind ?? '');
    const language = String(row.data.language ?? '');
    const at = `${row.work}\u0000${kind}\u0000${language}\u0000${key}`;
    const group = groups.get(at) ?? [];
    group.push(row);
    groups.set(at, group);
  }
  const out = new Map<EntityId, PrintingRow[][]>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
    const list = out.get(group[0]!.work) ?? [];
    list.push(group);
    out.set(group[0]!.work, list);
  }
  return out;
}

/** Every printing of every sefer (or of one), as main has it. */
export async function loadPrintings(catalog: Catalog, work?: EntityId): Promise<PrintingRow[]> {
  const { rows } = await catalog.db.query<{ id: EntityId; work: EntityId; path: string | null; data: Record<string, unknown> }>(
    `SELECT p.id, x.to_id AS work, p.path, pr.data
       FROM entity_ref x
       JOIN entity p ON p.id = x.from_id AND p.type = 'publication' AND NOT p.deleted AND p.main_rev IS NOT NULL
       JOIN revision pr ON pr.id = p.main_rev
      WHERE x.field = 'work'${work ? ' AND x.to_id = $1' : ''}`,
    work ? [work] : [],
  );
  return rows;
}

/** One plan per sefer (more when a sefer has over MAX_OPERATIONS duplicates), each one Suggestion. */
export async function planPrintingMerges(catalog: Catalog, work?: EntityId): Promise<OrganizePlan[]> {
  const plans: OrganizePlan[] = [];
  for (const groups of duplicateVolumes(await loadPrintings(catalog, work)).values()) {
    const ops: OrganizeOperation[] = groups.flatMap(([keep, ...rest]) => rest.map((dup) => ({ op: 'merge' as const, from: dup.id, into: keep!.id })));
    for (let i = 0; i < ops.length; i += MAX_OPERATIONS) {
      const part = ops.slice(i, i + MAX_OPERATIONS);
      plans.push({
        title: `One record per volume: ${part.length} printing${part.length === 1 ? '' : 's'} merged into the volume they repeat`,
        description: 'The same volume came in from more than one place (HebrewBooks, אוצרות הרבי, a text). Each volume becomes one record, with every scan and source on it.',
        operations: part,
      });
    }
  }
  return plans;
}
