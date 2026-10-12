import { MONTHS, normalizeSearchText, parseHebrewNumeral, parseHebrewYear } from '@chassidushub/hebrew';
import type { EntityId } from '@chassidushub/model';

/**
 * The catalog's health as the Catalog team reads it each night: what still
 * needs a person, counted from the catalog snapshot (docs/catalog-snapshot.md)
 * and never from the database, so it costs the live catalog nothing and
 * changes nothing. Five counts, each with the items behind it:
 *
 * - units with no real label: a sicha, letter or maamar named only ב"ה, a
 *   bare number, a dateline, a generic word ("שיחה"), its sefer's or volume's own name,
 *   or a file name, instead of what it is;
 * - items with no place: sefarim on no shelf and on no sefer, top shelves
 *   that are not a Rebbe's (the tree is fixed to the Rebbeim), empty shelves;
 * - additions that belong to no sefer;
 * - duplicate printings: sefarim with the same name, which should be one
 *   sefer with several printings;
 * - shelves out of order: a shelf whose numbered items (volumes, years) are
 *   listed out of their numbers' order, and sefarim whose volumes are.
 *
 * The shapes below are the parts of tree.json and work-<id>.json this
 * reads; the snapshot holds more.
 */

export const HEALTH_FORMAT = 1;

export interface HealthName {
  he: string;
  en?: string;
}

export interface HealthTree {
  top: EntityId[];
  sets: Record<EntityId, { id: EntityId; path: string | null; name: HealthName; parent?: EntityId; rebbe?: number; sets: EntityId[]; works: EntityId[]; additions: EntityId[] }>;
  works: Record<EntityId, { id: EntityId; path: string | null; title: HealthName; sets: EntityId[]; addition?: { kind: string; to?: EntityId }; additions: EntityId[]; parts: Array<{ value: string; label: HealthName | null; units: number }>; units: number }>;
}

export interface HealthWorkFile {
  work: EntityId;
  parts: Array<{ value: string; label: HealthName | null; items: Array<{ id: EntityId; path: string | null; title: HealthName; kind?: string }> }>;
}

/** Why a unit's name says nothing of what it is. */
export type UnlabelledReason = 'none' | 'bh' | 'number' | 'date' | 'generic' | 'container' | 'file';

export interface HealthItem {
  id: EntityId;
  path: string | null;
  name: string;
}

export interface CatalogHealthReport {
  format: typeof HEALTH_FORMAT;
  /** The snapshot it was counted from. */
  snapshot: { version: string; changedAt?: string; builtAt?: string };
  madeAt: string;
  counts: HealthCounts;
  /** Sefarim whose units' names start with ב"ה or בס"ד, the most first: labelled, but in need of tidying. */
  bhPrefix: Array<HealthItem & { units: number }>;
  unlabelled: {
    byReason: Record<UnlabelledReason, number>;
    /** Each sefer with unlabelled units, the most first. */
    bySefer: Array<HealthItem & { units: number; unlabelled: number; reasons: Partial<Record<UnlabelledReason, number>>; examples: Array<{ path: string | null; name: string; reason: UnlabelledReason }> }>;
  };
  noPlace: {
    /** Sefarim on no shelf, and no addition to a sefer. */
    works: HealthItem[];
    /** Top shelves that are not one of the Rebbeim's. */
    topShelves: HealthItem[];
    /** Shelves with nothing on them. */
    emptyShelves: HealthItem[];
  };
  /** Additions that belong to no sefer. */
  additionsWithoutSefer: Array<HealthItem & { kind: string; shelves: string[] }>;
  /** Sefarim sharing one name, each group a candidate for one sefer with several printings. */
  duplicates: Array<{ name: string; works: Array<HealthItem & { addition?: string; units: number; shelves: string[] }> }>;
  outOfOrder: {
    /** Shelves whose numbered items are not in their numbers' order: the first pair found. */
    shelves: Array<HealthItem & { before: string; after: string }>;
    /** Sefarim whose volumes are not in their numbers' order. */
    volumes: Array<HealthItem & { before: string; after: string }>;
  };
}

export interface HealthCounts {
  shelves: number;
  sefarim: number;
  units: number;
  unlabelledUnits: number;
  unitsStartingWithBh: number;
  sefarimWithNoPlace: number;
  topShelvesNotARebbe: number;
  emptyShelves: number;
  additionsWithoutSefer: number;
  duplicateGroups: number;
  duplicateSefarim: number;
  shelvesOutOfOrder: number;
  sefarimVolumesOutOfOrder: number;
}

// ------------------------------------------------------------------ unit labels

/** ב"ה and its kin, as normalized: what a scan's first line says, not what the unit is. */
const BH = new Set(['בה', 'בס ד', 'בסד', 'בעה', 'בעהית', 'בעזהית', 'בעזה', 'בה בה']);

/** Words that name a kind of unit, or a place in a book, and nothing more. */
const GENERIC = new Set([
  'שיחה', 'שיחות', 'מאמר', 'מאמרים', 'מכתב', 'אגרת', 'אגרות', 'מענה', 'רשימה', 'התוועדות', 'משיחת', 'הנחה', 'השמטות', 'הוספות', 'הערות', 'מפתח', 'פתח דבר', 'שער', 'דף השער', 'שער בלט', 'תוכן', 'תוכן העניינים', 'תוכן הענינים',
  'סימן', 'פרק', 'אות', 'עמ', 'עמוד', 'דף', 'חלק', 'כרך', 'ספר', 'קונטרס', 'תשורה', 'גליון', 'גיליון',
  'sicha', 'sichos', 'maamar', 'letter', 'chapter', 'page', 'part', 'volume', 'section', 'unit', 'untitled', 'unknown',
]);

/** The Hebrew months, as normalized, in every spelling: a name of only a day, a month and a year is a dateline. */
const MONTH_WORDS = new Set(MONTHS.flatMap((m) => [m.he, ...m.aliases].map(normalizeSearchText).filter((w) => /^[א-ת ]+$/.test(w))).flatMap((w) => w.split(' ')).filter((w) => w.length > 1));

const FILE_NAME = /\.(pdf|docx?|rtf|txt|jpe?g|png|tiff?|mp3|m4a|wav)$/i;

/** Short names that read as numerals but are words: the parshiyos נח, לך לך, בא, צו. */
const NOT_NUMERALS = new Set(['נח', 'לך', 'בא', 'צו']);

/** A word that is only a number: digits, or Hebrew letters written as a numeral (קכ"ב, ט', יב), largest letter first. */
function isNumeral(word: string, written: string, counted = false): boolean {
  if (/^\d+[a-z]?$/.test(word)) return true;
  // A thousands letter with its geresh comes first (א'קכו, 1126): the rest is read as the number.
  const thousands = /^[א-ט][׳']./.test(written);
  if (thousands) word = word.slice(1);
  if (!/^[א-ת]{1,4}$/.test(word) || NOT_NUMERALS.has(word)) return false;
  const values = [...word].map((ch) => parseHebrewNumeral(ch) ?? 0);
  // טו and טז are written for 15 and 16; otherwise a numeral's letters never grow.
  if (!/^.?ט[וז]$/.test(word) && values.some((v, i) => i > 0 && v > values[i - 1]!)) return false;
  // A Hebrew word is a numeral when written as one (a geresh or gershayim), when one or two letters, or after a word
  // that counts (סימן קכז, אגרת קכז).
  return counted || thousands || word.length <= 2 || /[׳״"']/.test(written);
}

/**
 * Units whose own level is a place in a book (a chapter, a siman, a mitzvah):
 * a number is their right name. Every other kind (a unit, sicha, maamar,
 * letter, farbrengen) is named by what it says.
 */
const NUMBERED_KINDS = new Set(['chapter', 'siman', 'seif', 'mitzvah', 'shoresh', 'part', 'section', 'volume', 'parsha', 'verse', 'page', 'halacha', 'perek', 'os', 'prayer']);

/**
 * Why a unit's name says nothing of what it is, or null when it does. `sefer`
 * and `volume` are the names of what it is in: a unit named just like them
 * is a part that was never named.
 */
export function unlabelledReason(name: HealthName, sefer?: string, volume?: string | null, kind?: string): UnlabelledReason | null {
  const he = (name.he || '').trim();
  const shown = he || (name.en ?? '').trim();
  if (!shown || shown.startsWith('/') || /^rh-[a-z0-9]+$/.test(shown)) return 'none';
  if (FILE_NAME.test(shown) || /^[\w-]+_[\w-]+$/.test(shown)) return 'file';
  const norm = normalizeSearchText(shown);
  if (!norm) return 'none';
  if (BH.has(norm)) return 'bh';
  const written = shown.split(/\s+/);
  const words = norm.split(' ');
  if ((sefer && norm === normalizeSearchText(sefer)) || (volume && norm === normalizeSearchText(volume))) return 'container';
  if (kind && NUMBERED_KINDS.has(kind)) return null;
  if (words.every((w, i) => isNumeral(w, written[i] ?? w))) return 'number';
  // A dateline: a day, a month and a year (י"ט כסלו תשכ"ב), with ב or ל before the month at most.
  const month = (w: string) => MONTH_WORDS.has(w) || (/^[בל]/.test(w) && MONTH_WORDS.has(w.slice(1)));
  if (words.some(month) && words.every((w, i) => month(w) || w === 'ה' || isNumeral(w, written[i] ?? w, true))) return 'date';
  // A kind of unit or a place, and at most a number after it: "שיחה", "סימן 5", "מכתב קכ"ב", "עמ' 49".
  if (words.length <= 3) {
    const head = words.filter((w, i) => !isNumeral(w, written[i] ?? w, i > 0 && GENERIC.has(words[i - 1]!))).join(' ');
    if (GENERIC.has(head)) return 'generic';
  }
  return null;
}

/** A name that starts with ב"ה or בס"ד, a scan's first line copied in front of what the unit is. */
export function startsWithBh(name: HealthName): boolean {
  return /^(ב["״']+ה|בס["״']+ד|בעזהי["״']+ת)[\s.,:]+\S/.test((name.he || '').trim());
}

// ------------------------------------------------------------------ order

/** Hebrew letters that read as a numeral: at most five, largest first (טו and טז for 15 and 16). */
function numeralLetters(letters: string): boolean {
  if (!/^[א-ת]{1,5}$/.test(letters) || /[ךםןףץ]/.test(letters)) return false;
  const values = [...letters].map((ch) => parseHebrewNumeral(ch) ?? 0);
  return /ט[וז]$/.test(letters) || values.every((v, i) => i === 0 || v <= values[i - 1]!);
}

const COUNTERS = /^(חלק|ח|כרך|ספר|סימן|פרק|גליון|גיליון|קונטרס|מהדורה|חוברת)$/;

/**
 * The numbers an item's name counts by, in the name's order (חלק יב → [12];
 * ה'תשמ"ז, חלק ב → [5747, 2]; 5742), with the rest of the name, or null when
 * it has none. A year counts as its year, written with or without the
 * thousands; a word with gershayim counts only when its letters read as a
 * numeral (not אדמו"ר or מהורש"ב).
 */
export function numberedName(name: string): { stem: string; n: number[] } | null {
  const words = name.trim().split(/\s+/);
  const n: number[] = [];
  const rest: string[] = [];
  words.forEach((word, i) => {
    const bare = word.replace(/[()[\]{},.:;־-]/g, '');
    let value: number | null = null;
    if (/^\d{1,4}$/.test(bare)) value = Number(bare);
    else if (/[׳״"']/.test(bare) && /^[א-ת׳״"']+$/.test(bare)) {
      const letters = bare.replace(/^ה['׳]/, '').replace(/[׳״"']/g, '');
      if (numeralLetters(letters)) value = letters.length >= 3 && letters.startsWith('ת') ? parseHebrewYear(letters) : parseHebrewNumeral(letters);
    } else if (i > 0 && /^[א-ת]{1,3}$/.test(bare) && COUNTERS.test(words[i - 1]!.replace(/[׳״"']/g, '')) && numeralLetters(bare)) {
      value = parseHebrewNumeral(bare);
    }
    if (value !== null && value > 0) n.push(value);
    else rest.push(word);
  });
  return n.length ? { stem: normalizeSearchText(rest.join(' ')), n } : null;
}

/** Compares two lists of numbers the way a reader counts: the first that differs decides. */
function compareNumbers(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/** The first two names in `names` listed out of their numbers' order, among names alike but for the numbers. */
export function firstOutOfOrder(names: string[]): { before: string; after: string } | null {
  const last = new Map<string, { n: number[]; name: string }>();
  for (const name of names) {
    const numbered = numberedName(name);
    if (!numbered) continue;
    const prev = last.get(numbered.stem);
    if (prev && compareNumbers(numbered.n, prev.n) < 0) return { before: prev.name, after: name };
    last.set(numbered.stem, { n: numbered.n, name });
  }
  return null;
}

/** A volume's numbers: its value when that is a number, else its label's. */
function volumeNumbers(part: { value: string; label: HealthName | null }): number[] | null {
  if (/^\d+$/.test(part.value)) return [Number(part.value)];
  return part.label?.he ? (numberedName(part.label.he)?.n ?? null) : null;
}

// ------------------------------------------------------------------ the report

const top = (n: number) => <T>(list: T[]) => list.slice(0, n);

/** Counts the snapshot's health. `workFile` gives a sefer's units file, or null when it has none. */
export async function snapshotHealth(
  snapshot: { version: string; changedAt?: string; builtAt?: string },
  tree: HealthTree,
  workFile: (id: EntityId) => Promise<HealthWorkFile | null>,
  options: { now?: Date; examples?: number } = {},
): Promise<CatalogHealthReport> {
  const examples = options.examples ?? 5;
  const he = (name: HealthName | null | undefined) => name?.he || name?.en || '';
  const shelfNames = (ids: EntityId[]) => ids.map((s) => he(tree.sets[s]?.name)).filter(Boolean);
  const works = Object.values(tree.works);
  const sets = Object.values(tree.sets);

  // Units with no real label, sefer by sefer.
  const byReason: Record<UnlabelledReason, number> = { none: 0, bh: 0, number: 0, date: 0, generic: 0, container: 0, file: 0 };
  const bySefer: CatalogHealthReport['unlabelled']['bySefer'] = [];
  const bhPrefix: CatalogHealthReport['bhPrefix'] = [];
  let units = 0;
  for (const work of works) {
    if (!work.units) continue;
    const file = await workFile(work.id);
    if (!file) continue;
    const row: CatalogHealthReport['unlabelled']['bySefer'][number] = { id: work.id, path: work.path, name: he(work.title), units: 0, unlabelled: 0, reasons: {}, examples: [] };
    let bh = 0;
    for (const part of file.parts) {
      for (const unit of part.items) {
        row.units++;
        if (startsWithBh(unit.title)) bh++;
        const reason = unlabelledReason(unit.title, he(work.title), part.label?.he ?? null, unit.kind);
        if (!reason) continue;
        row.unlabelled++;
        byReason[reason]++;
        row.reasons[reason] = (row.reasons[reason] ?? 0) + 1;
        if (row.examples.length < examples) row.examples.push({ path: unit.path, name: he(unit.title), reason });
      }
    }
    units += row.units;
    if (row.unlabelled) bySefer.push(row);
    if (bh) bhPrefix.push({ id: work.id, path: work.path, name: he(work.title), units: bh });
  }
  bhPrefix.sort((a, b) => b.units - a.units);
  bySefer.sort((a, b) => b.unlabelled - a.unlabelled || (a.path ?? '').localeCompare(b.path ?? ''));

  // Items with no place in the tree.
  const item = (x: { id: EntityId; path: string | null }, name: string): HealthItem => ({ id: x.id, path: x.path, name });
  const noPlaceWorks = works.filter((w) => w.sets.length === 0 && !w.addition?.to).map((w) => item(w, he(w.title)));
  const topShelves = tree.top.map((id) => tree.sets[id]!).filter((s) => s && !s.rebbe).map((s) => item(s, he(s.name)));
  const emptyShelves = sets.filter((s) => !s.sets.length && !s.works.length && !s.additions.length).map((s) => item(s, he(s.name)));
  const additionsWithoutSefer = works.filter((w) => w.addition && !w.addition.to).map((w) => ({ ...item(w, he(w.title)), kind: w.addition!.kind, shelves: shelfNames(w.sets) }));

  // Sefarim sharing one name. The same name on two Rebbeim's shelves (each one's אגרות קודש) is two sefarim, not two printings.
  const rebbeOfSet = (id: EntityId | undefined): number | undefined => {
    for (let set = id ? tree.sets[id] : undefined, seen = 0; set && seen < 50; set = set.parent ? tree.sets[set.parent] : undefined, seen++) if (set.rebbe) return set.rebbe;
    return undefined;
  };
  const rebbeOf = (work: (typeof works)[number]): number | undefined => {
    const to = work.addition?.to ? tree.works[work.addition.to] : undefined;
    return (to ?? work).sets.map(rebbeOfSet).find((r) => r !== undefined);
  };
  const byName = new Map<string, typeof works>();
  for (const work of works) {
    const name = normalizeSearchText(he(work.title));
    const key = name && `${rebbeOf(work) ?? ''} ${name}`;
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), work]);
  }
  const duplicates = [...byName.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      name: he(group[0]!.title),
      works: group.map((w) => ({ ...item(w, he(w.title)), ...(w.addition ? { addition: w.addition.kind } : {}), units: w.units, shelves: shelfNames(w.sets) })),
    }))
    .sort((a, b) => b.works.length - a.works.length || a.name.localeCompare(b.name));

  // Shelves and volumes out of their numbers' order.
  const shelvesOut: CatalogHealthReport['outOfOrder']['shelves'] = [];
  for (const set of sets) {
    const lists = [set.sets.map((s) => he(tree.sets[s]?.name)), set.works.map((w) => he(tree.works[w]?.title)), set.additions.map((w) => he(tree.works[w]?.title))];
    const found = lists.map(firstOutOfOrder).find(Boolean);
    if (found) shelvesOut.push({ ...item(set, he(set.name)), ...found });
  }
  const volumesOut: CatalogHealthReport['outOfOrder']['volumes'] = [];
  for (const work of works) {
    let prev: { n: number[]; name: string } | null = null;
    for (const part of work.parts) {
      const n = volumeNumbers(part);
      if (n === null) continue;
      const name = part.label?.he || part.value;
      if (prev && compareNumbers(n, prev.n) < 0) {
        volumesOut.push({ ...item(work, he(work.title)), before: prev.name, after: name });
        break;
      }
      prev = { n, name };
    }
  }

  const counts: HealthCounts = {
    shelves: sets.length,
    sefarim: works.length,
    units,
    unlabelledUnits: Object.values(byReason).reduce((a, b) => a + b, 0),
    unitsStartingWithBh: bhPrefix.reduce((n, s) => n + s.units, 0),
    sefarimWithNoPlace: noPlaceWorks.length,
    topShelvesNotARebbe: topShelves.length,
    emptyShelves: emptyShelves.length,
    additionsWithoutSefer: additionsWithoutSefer.length,
    duplicateGroups: duplicates.length,
    duplicateSefarim: duplicates.reduce((n, d) => n + d.works.length, 0),
    shelvesOutOfOrder: shelvesOut.length,
    sefarimVolumesOutOfOrder: volumesOut.length,
  };
  return {
    format: HEALTH_FORMAT,
    snapshot,
    madeAt: (options.now ?? new Date()).toISOString(),
    counts,
    bhPrefix,
    unlabelled: { byReason, bySefer },
    noPlace: { works: noPlaceWorks, topShelves, emptyShelves },
    additionsWithoutSefer,
    duplicates,
    outOfOrder: { shelves: shelvesOut, volumes: volumesOut },
  };
}

// ------------------------------------------------------------------ in words

const COUNT_LINES: Array<[keyof HealthCounts, string]> = [
  ['unlabelledUnits', 'Units with no real label'],
  ['unitsStartingWithBh', 'Units named from a scan\'s first line (ב"ה, בס"ד in front)'],
  ['sefarimWithNoPlace', 'Sefarim on no shelf and no sefer'],
  ['topShelvesNotARebbe', "Top shelves that are not a Rebbe's"],
  ['emptyShelves', 'Empty shelves'],
  ['additionsWithoutSefer', 'Additions that belong to no sefer'],
  ['duplicateGroups', 'Names shared by more than one sefer'],
  ['duplicateSefarim', 'Sefarim in those groups'],
  ['shelvesOutOfOrder', 'Shelves out of order'],
  ['sefarimVolumesOutOfOrder', 'Sefarim with volumes out of order'],
];

const REASONS: Record<UnlabelledReason, string> = {
  bh: 'only ב"ה',
  number: 'only a number',
  date: 'only a date (י"ט כסלו תשכ"ב)',
  generic: 'only a kind or a place ("שיחה", "סימן 5")',
  container: "only its sefer's or volume's name",
  file: 'a file name',
  none: 'no name at all',
};

const link = (x: { path: string | null; name: string }, site: string) => (x.path ? `[${x.name || x.path}](${site}${x.path})` : x.name);

/** The report as Markdown for a board issue: the counts with their change since `previous`, then the worst of each. */
export function healthMarkdown(report: CatalogHealthReport, options: { previous?: HealthCounts | null; site?: string; rows?: number } = {}): string {
  const site = options.site ?? 'https://chassidushub.org';
  const rows = top(options.rows ?? 15);
  const prev = options.previous ?? null;
  const change = (key: keyof HealthCounts) => {
    if (!prev || prev[key] === undefined) return '';
    const d = report.counts[key] - prev[key];
    return d === 0 ? '±0' : d > 0 ? `+${d}` : String(d);
  };
  const lines: string[] = [];
  lines.push(`Counted from the catalog snapshot ${report.snapshot.version}${report.snapshot.changedAt ? ` (catalog changed ${report.snapshot.changedAt.slice(0, 16).replace('T', ' ')} UTC)` : ''}, ${report.madeAt.slice(0, 16).replace('T', ' ')} UTC. Read-only: nothing here changes the catalog.`);
  lines.push('');
  lines.push(`${report.counts.shelves} shelves, ${report.counts.sefarim} sefarim, ${report.counts.units} units.`);
  lines.push('');
  lines.push(`| | Now |${prev ? ' Since last |' : ''}`);
  lines.push(`| --- | ---: |${prev ? ' ---: |' : ''}`);
  for (const [key, label] of COUNT_LINES) lines.push(`| ${label} | ${report.counts[key]} |${prev ? ` ${change(key)} |` : ''}`);
  lines.push('');

  lines.push('## Units with no real label');
  lines.push('');
  lines.push(
    Object.entries(report.unlabelled.byReason)
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `${n} ${REASONS[r as UnlabelledReason]}`)
      .join('; ') || 'None.',
  );
  lines.push('');
  if (report.unlabelled.bySefer.length) {
    lines.push('| Sefer | Unlabelled | Of | For example |');
    lines.push('| --- | ---: | ---: | --- |');
    for (const s of rows(report.unlabelled.bySefer)) lines.push(`| ${link(s, site)} | ${s.unlabelled} | ${s.units} | ${s.examples.slice(0, 2).map((e) => link({ path: e.path, name: e.name.replace(/\|/g, '/') }, site)).join(', ')} |`);
    if (report.unlabelled.bySefer.length > (options.rows ?? 15)) lines.push(`\n…and ${report.unlabelled.bySefer.length - (options.rows ?? 15)} more sefarim (the full list is in the run's report.json).`);
    lines.push('');
  }

  if (report.bhPrefix.length) {
    lines.push(`Names that start with ב"ה or בס"ד (labelled, to tidy): ${rows(report.bhPrefix).map((s) => `${link(s, site)} ${s.units}`).join(', ')}.`);
    lines.push('');
  }

  const list = (title: string, items: Array<{ path: string | null; name: string }>, extra?: (x: never) => string) => {
    lines.push(`## ${title} (${items.length})`);
    lines.push('');
    if (!items.length) lines.push('None.');
    for (const x of rows(items)) lines.push(`- ${link(x, site)}${extra ? extra(x as never) : ''}`);
    if (items.length > (options.rows ?? 15)) lines.push(`- …and ${items.length - (options.rows ?? 15)} more`);
    lines.push('');
  };
  list('Sefarim on no shelf and no sefer', report.noPlace.works);
  list("Top shelves that are not a Rebbe's", report.noPlace.topShelves);
  list('Empty shelves', report.noPlace.emptyShelves);
  list('Additions that belong to no sefer', report.additionsWithoutSefer, (x: { kind: string; shelves: string[] }) => ` (${x.kind}${x.shelves.length ? `, on ${x.shelves.join(', ')}` : ''})`);

  lines.push(`## Names shared by more than one sefer (${report.duplicates.length})`);
  lines.push('');
  if (!report.duplicates.length) lines.push('None.');
  for (const d of rows(report.duplicates)) lines.push(`- ${d.name}: ${d.works.map((w) => `${link({ path: w.path, name: w.path ?? w.id }, site)}${w.addition ? ` (addition: ${w.addition})` : ''}`).join(', ')}`);
  if (report.duplicates.length > (options.rows ?? 15)) lines.push(`- …and ${report.duplicates.length - (options.rows ?? 15)} more`);
  lines.push('');

  list('Shelves out of order', report.outOfOrder.shelves, (x: { before: string; after: string }) => `: ${x.before} comes before ${x.after}`);
  list('Sefarim with volumes out of order', report.outOfOrder.volumes, (x: { before: string; after: string }) => `: ${x.before} comes before ${x.after}`);
  return lines.join('\n');
}
