import type { ChassidusHub, ItemView } from '@chassidushub/client';
import type { PageSegment } from '@chassidushub/model';
import type { AppLoadContext } from 'react-router';
import { namesOf } from '../edit/names';
import { nameOf } from '../lib/catalog';
import { clock } from '../listen/common';
import { pdfsOf } from '../lib/pdfs';
import type { ReaderData, ReaderText } from './types';
import { notesHtml, wordsHtml } from './words.server';

const languages: Record<string, string> = { he: 'עברית', en: 'אנגלית', yi: 'אידיש', ru: 'רוסית', fr: 'צרפתית', es: 'ספרדית' };

/**
 * The reading page's data from the one read of /v1/view. The words are drawn
 * here, on the server; on a whole page they go to `serverOnly` and are left
 * out of the data, so a phone gets them once, not twice.
 */
export async function readerData(view: ItemView, context: AppLoadContext, origin: string): Promise<ReaderData> {
  const title = nameOf((view.item.data as { label?: unknown }).label) || nameOf(view.pathBar.at(-1)?.chosen.name);
  const path = view.item.path ?? `/${view.item.id}`;
  // The sefer and its parts, between the shelves above and the page itself.
  const fromWork = view.pathBar.findIndex((level) => level.kind === 'work');
  const middle = (fromWork >= 0 ? view.pathBar.slice(fromWork, -1) : []).map((level) => nameOf(level.chosen.name));
  const text = await shownText(view, context.api, context, path, title);
  const level = ((view.item.data as { position?: { level?: unknown }[] }).position ?? []).at(-1)?.level;
  const neighbour = (n: ItemView['previous']) => (n?.path ? { path: n.path, label: nameOf(n.name) } : null);
  return {
    id: view.item.id,
    path,
    title,
    ...(typeof level === 'string' && level ? { level } : {}),
    sub: middle.join(' · '),
    pathBar: view.pathBar,
    previous: neighbour(view.previous),
    next: neighbour(view.next),
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

async function shownText(view: ItemView, api: ChassidusHub, context: AppLoadContext, path: string, title: string): Promise<ReaderText> {
  const text = view.text;
  if (!text) return { kind: 'none' };
  if (text.kind === 'words') {
    const segments = (text.segments ?? []) as unknown as PageSegment[];
    const notes = (text.notes ?? []) as unknown as PageSegment[];
    let body: string | null = wordsHtml(segments, notes, title);
    let notesDrawn: string | null = notes.length ? notesHtml(notes) : '';
    if (context.document && context.serverOnly) {
      context.serverOnly.set(`body:${path}`, body);
      context.serverOnly.set(`notes:${path}`, notesDrawn);
      body = null;
      notesDrawn = null;
    }
    return {
      kind: 'words',
      body,
      notes: notesDrawn,
      hasNotes: notes.length > 0,
      machine: text.machine ?? 'none',
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
