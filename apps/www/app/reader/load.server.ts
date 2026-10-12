import type { ChassidusHub, ItemView } from '@chassidushub/client';
import type { PageSegment } from '@chassidushub/model';
import type { AppLoadContext } from 'react-router';
import { namesOf } from '../edit/names';
import { nameOf } from '../lib/catalog';
import { clock } from '../listen/common';
import { pdfsOf } from '../lib/pdfs';
import type { ReaderData, ReaderText } from './types';
import { notesHtml, wordsAddress, wordsHtml, wordsKey, type DrawnWords } from './words.server';
import { farbrengenMachine, farbrengenOf, farbrengenViews, farbrengenWords } from './farbrengen.server';

const languages: Record<string, string> = { he: 'עברית', en: 'אנגלית', yi: 'אידיש', ru: 'רוסית', fr: 'צרפתית', es: 'ספרדית' };

/** A reading page's title: the unit's own label, else its name in the path bar. */
export const readerTitle = (view: ItemView) => nameOf((view.item.data as { label?: unknown }).label) || nameOf(view.pathBar.at(-1)?.chosen.name);

/** A page's words drawn as the reader shows them, or null when the view has no words. */
export function drawnWords(view: ItemView, title: string): DrawnWords | null {
  if (view.text?.kind !== 'words') return null;
  const segments = (view.text.segments ?? []) as unknown as PageSegment[];
  const notes = (view.text.notes ?? []) as unknown as PageSegment[];
  return { body: wordsHtml(segments, notes, title), notes: notes.length ? notesHtml(notes) : '' };
}

/**
 * A page's words as the reader draws them: a sicha's own, or, on a farbrengen
 * read as one page (farbrengen.server.ts), all its sichos'. The words route
 * draws them the same way, so their address matches.
 */
export async function pageWords(view: ItemView, api: ChassidusHub, language?: string): Promise<{ words: DrawnWords | null; sichos: ItemView[] | null; title: string }> {
  const farbrengen = farbrengenOf(view);
  if (!farbrengen) return { words: drawnWords(view, readerTitle(view)), sichos: null, title: readerTitle(view) };
  const sichos = await farbrengenViews(view, farbrengen.sichos, api, language);
  return { words: farbrengenWords(sichos, farbrengen.label), sichos, title: farbrengen.label };
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
  const level = ((view.item.data as { position?: { level?: unknown }[] }).position ?? []).at(-1)?.level;
  // On a farbrengen's page, the farbrengens before and after it, by their own names.
  const neighbour = (n: ItemView['previous']) => (n?.path ? { path: n.path, label: sichos ? nameOf(n.name).replace(/, [^,]*$/, '') : nameOf(n.name) } : null);
  return {
    id: view.item.id,
    path,
    title,
    ...(typeof level === 'string' && level ? { level } : {}),
    sub: middle.join(' · '),
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
      versions: (text.versions ?? []).map((v) => ({ version: v.version, label: v.title ?? languages[v.language] ?? v.language })),
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
