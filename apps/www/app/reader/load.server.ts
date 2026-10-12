import type { ChassidusHub, ItemView } from '@chassidushub/client';
import { DAILY_WORKS, describeDateKey, isValidDateKey } from '@chassidushub/hebrew';
import type { PageSegment } from '@chassidushub/model';
import type { AppLoadContext } from 'react-router';
import { namesOf } from '../edit/names';
import { nameOf } from '../lib/catalog';
import { clock } from '../listen/common';
import { pdfsOf } from '../lib/pdfs';
import { farbrengenMachine, farbrengenOf, farbrengenViews, farbrengenWords, sichaName } from './farbrengen.server';
import type { Fact, ReaderData, ReaderText } from './types';
import { daybookLayout } from '../views/daybook.layout';
import { letterLayout } from '../views/letters.layout';
import { indexLayout, isIndexWords } from '../views/index.layout';
import { hisvaaduyosLayout, hisvaaduyosParts, saidThere, type FarbrengenSection, type Muga } from '../views/hisvaaduyos.layout';
import { chaptersLayout, simanChips } from '../views/chapters.layout';
import { viewFor } from './views';
import { notesHtml, unmarkedNotes, wordsAddress, wordsHtml, wordsKey, type DrawnWords, type WordsLayout } from './words.server';

/** How each kind of page sets its words beyond the words themselves, by its view (app/views); a kind not named here is drawn as a sicha. */
const layouts: Record<string, WordsLayout> = { letters: letterLayout, daybook: daybookLayout, index: indexLayout, chapters: chaptersLayout, hisvaaduyos: hisvaaduyosLayout };

/** The pseudo-version that reads a chapter beside its translation (views/chapters.tsx): the API gives the original for it. */
export const BOTH = 'both';

/** Whether a reading page is drawn as a letter (app/views/letters.tsx), so it asks for the letters' face with its first bytes. */
export const isLetter = (data: Pick<ReaderData, 'level' | 'view'>) => viewFor(data).kind === 'letters';

/**
 * The view the page's sefer names (RFC 0004, `view`, once /v1/view carries
 * it); until then the one the reader knows its sefer by (`seferViews`), and
 * an index by its words' shape (views/index.layout.ts), since an index's
 * units are volumes or letters, levels other books have too.
 */
function viewNamed(view: ItemView): string | undefined {
  const named = (view as { view?: unknown }).view;
  if (typeof named === 'string' && named) return named;
  const bySefer = viewOf(view);
  if (bySefer) return bySefer;
  if (inFarbrengen(view)) return 'hisvaaduyos';
  if (view.text?.kind === 'words' && isIndexWords((view.text.segments ?? []) as unknown as PageSegment[])) return 'index';
  return undefined;
}

/** The volume a unit is, when its first level is one: an index of one volume names its pages by it. */
const volumeOf = (view: ItemView) => {
  const first = ((view.item.data as { position?: { level?: unknown; value?: unknown }[] }).position ?? [])[0];
  const value = first?.level === 'volume' ? Number(first.value) : NaN;
  return Number.isInteger(value) && value > 0 ? value : undefined;
};

/**
 * The view a sefer names, by its path, until /v1/view carries the sefer's
 * own `view` (RFC 0004, step 3): Hayom Yom is read as a book of days, as the
 * print and the old site set it. Its units' own levels (`unit`) cannot say so.
 */
const seferViews: Record<string, string> = { [DAILY_WORKS.hayomYom]: 'daybook', [DAILY_WORKS.tanya]: 'chapters', '/shulchan-aruch-harav': 'chapters' };
const viewOf = (view: ItemView) => {
  const work = view.pathBar.find((level) => level.kind === 'work')?.chosen.path;
  return work ? seferViews[work] : undefined;
};

/**
 * A unit under a farbrengen (a Sichos Kodesh sicha) is read as a farbrengen,
 * whole or a sicha at a time; a unit that is a farbrengen by its own level (a
 * piece of Toras Menachem) picks the same view by its level (views/hisvaaduyos.tsx).
 */
const inFarbrengen = (view: ItemView) => ((view.item.data as { position?: { level?: unknown }[] }).position ?? []).at(-2)?.level === 'farbrengen';

/** What the unit is by its own level: the last level of its position (`letter`), which picks its view. */
const levelOf = (view: ItemView) => {
  const level = ((view.item.data as { position?: { level?: unknown }[] }).position ?? []).at(-1)?.level;
  return typeof level === 'string' && level ? level : undefined;
};

/**
 * The facts the catalog keeps on a unit, for the corner menu (RFC 0004): its
 * date, place and addressee, each opening a search for what else shares it,
 * and its handwritten copy (an edition with `role: "manuscript"`). A fact not
 * set is left out; a page with none has none.
 */
function withFacts(data: unknown): { facts?: Fact[] } {
  const fields = data as { date?: unknown; place?: unknown; to?: unknown; labelOrigin?: { checked?: unknown }; editions?: { role?: string; url?: string }[] };
  // The labels a machine guessed are the machine's until a person checks them (CLAUDE.md, RFC 0004 `labelOrigin`).
  const machine = fields.labelOrigin && fields.labelOrigin.checked !== true ? { machine: true as const } : {};
  const found = (q: string) => `/search?q=${encodeURIComponent(q)}`;
  const facts: Fact[] = [];
  const date = typeof fields.date === 'string' && isValidDateKey(fields.date) ? describeDateKey(fields.date) : '';
  if (date) facts.push({ kind: 'date', label: 'תאריך', value: date, href: found(date), ...machine });
  const place = nameOf(fields.place);
  if (place) facts.push({ kind: 'place', label: 'מקום', value: place, href: found(place), ...machine });
  const to = nameOf(fields.to);
  if (to) facts.push({ kind: 'to', label: 'אל', value: to, href: found(to), ...machine });
  const manuscript = fields.editions?.find((edition) => edition.role === 'manuscript' && edition.url?.startsWith('https://'));
  if (manuscript) facts.push({ kind: 'manuscript', label: 'כתב יד', value: 'צילום', href: manuscript.url! });
  return facts.length ? { facts } : {};
}

/** The chips a page's view sets under its title (a siman's seifim and editions), when it has any. */
function chipsOf(view: ItemView): { chips?: ReturnType<typeof simanChips> } {
  if (view.text?.kind !== 'words' || kindOf(view) !== 'chapters') return {};
  const chips = simanChips(view, (view.text.segments ?? []) as unknown as PageSegment[]);
  return chips.length ? { chips } : {};
}

const languages: Record<string, string> = { he: 'עברית', en: 'אנגלית', yi: 'אידיש', ru: 'רוסית', fr: 'צרפתית', es: 'ספרדית' };

/** A reading page's title: the unit's own label, else its name in the path bar. */
export const readerTitle = (view: ItemView) => nameOf((view.item.data as { label?: unknown }).label) || nameOf(view.pathBar.at(-1)?.chosen.name);

/** The view a page is drawn with, by its sefer's view, else its words, else its unit's level. */
const kindOf = (view: ItemView) => viewFor({ view: viewNamed(view), level: levelOf(view) }).kind;

/**
 * The words of a translation, to read beside the page's own (`beside`): the
 * same segments, and its notes, given ids of their own (`t…`) so they never
 * stand for the original's notes, in the sheet or in a fix.
 */
function translationOf(view: ItemView | null) {
  if (view?.text?.kind !== 'words' || !view.text.segments?.length) return undefined;
  const id = (note: string) => `t${note}`;
  const renote = (segment: PageSegment): PageSegment => ({
    ...segment,
    text: segment.text?.map((inline) => ('note' in inline ? { ...inline, note: id(inline.note) } : inline)),
    ...(segment.children ? { children: segment.children.map(renote) } : {}),
  });
  return {
    segments: (view.text.segments as unknown as PageSegment[]).map(renote),
    notes: ((view.text.notes ?? []) as unknown as PageSegment[]).map((note) => ({ ...renote(note), id: id(note.id) })),
    language: view.text.language ?? 'en',
  };
}

/**
 * The translation a chapter is read beside (?language=both): the first
 * version in another language, read with the page's own. Null for any other
 * page, or one with no translation.
 */
async function besideOf(view: ItemView, api: ChassidusHub, language?: string): Promise<ItemView | null> {
  if (language !== BOTH || view.text?.kind !== 'words' || kindOf(view) !== 'chapters') return null;
  const other = (view.text.versions ?? []).find((v) => v.language !== view.text?.language);
  return other ? api.itemView({ id: view.item.id, language: other.version }).catch(() => null) : null;
}

/** A page's words drawn as the reader shows them, or null when the view has no words. `beside`: its translation, read beside it. */
export function drawnWords(view: ItemView, title: string, beside?: ItemView | null): DrawnWords | null {
  if (view.text?.kind !== 'words') return null;
  const segments = (view.text.segments ?? []) as unknown as PageSegment[];
  const translation = translationOf(beside ?? null);
  // Beside its translation, the notes under the words are the translation's (Tanya's Hebrew has none of its own).
  const notes = translation ? [...((view.text.notes ?? []) as unknown as PageSegment[]), ...translation.notes] : ((view.text.notes ?? []) as unknown as PageSegment[]);
  const kind = kindOf(view);
  const layout = layouts[kind];
  const unmarked = layout?.unmarkedNotes ? unmarkedNotes(segments, notes) : undefined;
  const here = view.pathBar.at(-1);
  const around = {
    volume: volumeOf(view),
    siblings: here?.choices?.flatMap((c) => (c.path ? [{ path: c.path, label: nameOf(c.name), current: c.path === here.chosen.path }] : [])),
    ...(kind === 'hisvaaduyos' ? { said: saidOf(view) } : {}),
    ...(translation ? { beside: { segments: translation.segments, language: translation.language } } : {}),
  };
  return { body: wordsHtml(segments, notes, title, layout, view.item.data, around), notes: notes.length ? notesHtml(notes, unmarked) : '' };
}

/**
 * A page's words as the reader draws them: a sicha's own, or, on a farbrengen
 * read as one page (farbrengen.server.ts), all its sichos'. The words route
 * draws them the same way, so their address matches.
 */
export async function pageWords(view: ItemView, api: ChassidusHub, language?: string): Promise<{ words: DrawnWords | null; sichos: ItemView[] | null; title: string }> {
  const farbrengen = farbrengenOf(view);
  const sichos = farbrengen ? await farbrengenViews(view, farbrengen.sichos, api, language) : null;
  if (!farbrengen || !sichos) return { words: drawnWords(view, readerTitle(view), await besideOf(view, api, language)), sichos: null, title: readerTitle(view) };
  return { words: farbrengenWords(sichos, farbrengen.label, hisvaaduyosLayout), sichos, title: farbrengen.label };
}

/** The other pieces said at a unit's farbrengen, by the names of the units beside it (views/hisvaaduyos.layout.ts). */
const saidOf = (view: ItemView) => {
  const here = view.pathBar.at(-1);
  if (!here) return [];
  return saidThere({ path: here.chosen.path, name: nameOf(here.chosen.name) }, (here.choices ?? []).map((c) => ({ path: c.path, name: nameOf(c.name) })));
};

const MUGA: readonly string[] = ['mugah', 'bilti-mugah', 'hanacha'];

/**
 * What the hisvaaduyos view shows around a farbrengen's words (views/hisvaaduyos.tsx):
 * whether it is edited (the unit's `muga`, else the print's own line, else
 * what the hanacha's text says of itself), its sections, and the maamar said
 * there. A farbrengen read as one page has a section for each of its sichos.
 */
function farbrengenParts(view: ItemView, sichos: ItemView[] | null): { muga?: Muga; sections?: FarbrengenSection[]; said?: ReturnType<typeof saidOf> } {
  const fields = view.item.data as { muga?: unknown; note?: unknown };
  const segments = view.text?.kind === 'words' ? ((view.text.segments ?? []) as unknown as PageSegment[]) : [];
  const parts = hisvaaduyosParts(segments);
  const says = [view.text?.kind === 'words' ? view.text.title : '', typeof fields.note === 'string' ? fields.note : ''].join(' ');
  const muga = typeof fields.muga === 'string' && MUGA.includes(fields.muga) ? (fields.muga as Muga) : (parts.muga ?? (says.includes('בלתי מוגה') ? (says.includes('הנחה') ? 'hanacha' : 'bilti-mugah') : undefined));
  const letters = sichos?.map((sicha, at) => ({ label: sichaName(sicha, '').split(/\s+/).at(-1) ?? '', id: `u-${sicha.item.id}`, at }));
  const sections = letters ? (letters.every((s) => /^[א-ת]{1,3}$/.test(s.label)) ? letters.map(({ label, id }) => ({ label, id })) : []) : parts.sections;
  const said = saidOf(view);
  return { ...(muga ? { muga } : {}), ...(sections.length > 1 ? { sections } : {}), ...(said.length ? { said } : {}) };
}

/**
 * The reading page's data from the one read of /v1/view. The words are drawn
 * here, on the server, and are never in the page's data: on a whole page they
 * go to `serverOnly`, so a phone gets them once, not twice; a click to the page
 * gets their address instead (`url`), where they are kept for good, so a sicha
 * read once opens again without fetching its words (routes/words.ts).
 * `language` is the version asked for, if any.
 */
export async function readerData(view: ItemView, context: AppLoadContext, origin: string, language?: string): Promise<ReaderData> {
  const page = await pageWords(view, context.api, language);
  const { title, sichos } = page;
  const path = view.item.path ?? `/${view.item.id}`;
  // The sefer and its parts, between the shelves above and the page itself (on a farbrengen's page, the farbrengen is its title).
  const fromWork = view.pathBar.findIndex((level) => level.kind === 'work');
  const middle = (fromWork >= 0 ? view.pathBar.slice(fromWork, sichos ? -2 : -1) : []).map((level) => nameOf(level.chosen.name));
  const text = await shownText(view, context.api, context, path, title, language, page.words, sichos ? farbrengenMachine(sichos) : undefined);
  const level = levelOf(view);
  const named = viewNamed(view);
  // On a farbrengen's page, the farbrengens before and after it, by their own names.
  const neighbour = (n: ItemView['previous']) => (n?.path ? { path: n.path, label: sichos ? nameOf(n.name).replace(/, [^,]*$/, '') : nameOf(n.name) } : null);
  return {
    id: view.item.id,
    path,
    title,
    ...(level ? { level } : {}),
    ...(named ? { view: named } : {}),
    sub: middle.join(' · '),
    ...(middle.length > 1 ? { within: middle.slice(1).join(' · ') } : {}),
    ...withFacts(view.item.data),
    ...chipsOf(view),
    pathBar: view.pathBar,
    previous: neighbour((sichos?.[0] ?? view).previous),
    next: neighbour((sichos?.at(-1) ?? view).next),
    text,
    scan: view.scan?.url ? `${view.scan.url}#page=${view.scan.firstPage}` : null,
    recordings: (view.recordings ?? []).map((r) => ({
      path: r.path ?? `/${r.id}`,
      label: nameOf(r.name) || 'הקלטה',
      ...(r.durationMs ? { duration: clock(r.durationMs) } : {}),
    })),
    pdfs: pdfsOf(view.item.data),
    citation: [...middle, title].join(', '),
    url: `${origin}${path}`,
    rev: (view.item as { rev?: number }).rev ?? 0,
    names: namesOf(view.item.data),
    ...(sichos ? { farbrengen: true as const } : {}),
    ...(viewFor({ view: named, level }).kind === 'hisvaaduyos' ? farbrengenParts(view, sichos) : {}),
    work: fromWork >= 0 && view.pathBar[fromWork]!.chosen.path ? { path: view.pathBar[fromWork]!.chosen.path!, label: nameOf(view.pathBar[fromWork]!.chosen.name) } : null,
  };
}

async function shownText(view: ItemView, api: ChassidusHub, context: AppLoadContext, path: string, title: string, language: string | undefined, drawn: DrawnWords | null, machine?: 'none' | 'some' | 'all'): Promise<ReaderText> {
  const text = view.text;
  if (!text) return { kind: 'none' };
  if (text.kind === 'words' && drawn) {
    const url = wordsAddress(view.item.id, await wordsKey(drawn), language);
    // Without serverOnly (a test drawing the page alone) the words stay in the data.
    const inData = !context.serverOnly;
    if (context.document && context.serverOnly) {
      context.serverOnly.set(`body:${path}`, drawn.body);
      context.serverOnly.set(`notes:${path}`, drawn.notes);
    }
    return {
      kind: 'words',
      body: inData ? drawn.body : null,
      notes: inData ? drawn.notes : null,
      url,
      hasNotes: drawn.notes !== '',
      machine: machine ?? text.machine ?? 'none',
      version: text.version ?? '',
      ...(text.language ? { language: text.language } : {}),
      ...(language === BOTH && drawn.body.includes('class="pair"') ? { paired: true as const } : {}),
      versions: (text.versions ?? []).map((v) => ({ version: v.version, label: v.title ?? languages[v.language] ?? v.language, ...(v.language ? { language: v.language } : {}) })),
      ...(text.credit ? { credit: text.credit } : {}),
      ...(text.url ? { source: text.url } : {}),
    };
  }
  if (text.kind === 'pages' && text.scan && text.firstPage && text.lastPage) {
    const first = text.firstPage;
    const last = text.lastPage;
    const pages = (await api.scanPages({ id: text.scan }).catch(() => null)) as { pages?: { page: number; image: string; width: number; height: number }[] } | null;
    const images = (pages?.pages ?? [])
      .filter((p) => p.page >= first && p.page <= last && p.image)
      .map((p) => ({ page: p.page, src: p.image, width: p.width || 1000, height: p.height || 1414 }));
    // The view gives the whole PDF's address where files are served.
    return { kind: 'pages', first, last, images, pdf: text.url ? `${text.url}#page=${first}` : null };
  }
  if (text.kind === 'withheld') return { kind: 'withheld', reason: text.reason ?? '', ...(text.url ? { source: text.url } : {}) };
  return { kind: 'none' };
}
