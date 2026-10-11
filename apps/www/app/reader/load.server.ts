import type { ChassidusHub, ItemView, PathLevel as ApiLevel } from '@chassidushub/client';
import type { PageSegment } from '@chassidushub/model';
import type { AppLoadContext } from 'react-router';
import type { PathStep } from '../path';
import type { ReaderData, ReaderText } from './types';
import { notesHtml, wordsHtml } from './words.server';

/** A name in Hebrew, else in whatever language it has. */
export const nameOf = (name: unknown): string => {
  if (typeof name === 'string') return name;
  const names = (name ?? {}) as Record<string, unknown>;
  return String(names.he ?? names.en ?? Object.values(names)[0] ?? '');
};

/** A page's own names, Hebrew and English, as Edit shows them. */
function namesOf(label: unknown): { he: string; en: string } {
  const names = (typeof label === 'string' ? { he: label } : (label ?? {})) as Record<string, unknown>;
  return { he: typeof names.he === 'string' ? names.he : '', en: typeof names.en === 'string' ? names.en : '' };
}

/** What the menu at each level of the path is called. */
function titleOf(level: ApiLevel, above: string, first: boolean): string {
  if (level.kind === 'set') return first ? 'רבותינו נשיאינו' : `המדפים של ${above}`;
  if (level.kind === 'work') return `הספרים ב${above}`;
  if (level.kind === 'part') return `חלקי ${above}`;
  return `ב${above}`;
}

/** The API's path bar, as the page's path bar draws it: names in Hebrew, the page's own choice marked. */
export function pathSteps(bar: ApiLevel[]): PathStep[] {
  let above = '';
  return bar.map((level, at) => {
    const chosen = level.chosen.path ?? level.chosen.id ?? '';
    const step: PathStep = {
      key: `${level.kind}-${at}`,
      title: titleOf(level, above, at === 0),
      label: nameOf(level.chosen.name),
      choices: level.choices.map((choice) => ({
        path: choice.path,
        label: nameOf(choice.name),
        ...((choice.path ?? choice.id) === chosen ? { current: true } : {}),
      })),
    };
    above = step.label;
    return step;
  });
}

const languages: Record<string, string> = { he: 'עברית', en: 'אנגלית', yi: 'אידיש', ru: 'רוסית', fr: 'צרפתית', es: 'ספרדית' };

/**
 * The reading page's data from the one read of /v1/view. The words are drawn
 * here, on the server; on a whole page they go to `serverOnly` and are left
 * out of the data, so a phone gets them once, not twice.
 */
export async function readerData(view: ItemView, context: AppLoadContext, origin: string): Promise<ReaderData> {
  const title = nameOf((view.item.data as { label?: unknown }).label) || nameOf(view.pathBar.at(-1)?.chosen.name);
  const path = view.item.path ?? `/${view.item.id}`;
  const steps = pathSteps(view.pathBar);
  // The sefer and its parts, between the shelves above and the page itself.
  const fromWork = view.pathBar.findIndex((level) => level.kind === 'work');
  const middle = (fromWork >= 0 ? view.pathBar.slice(fromWork, -1) : []).map((level) => nameOf(level.chosen.name));
  const text = await shownText(view, context.api, context, path, title);
  const neighbour = (n: ItemView['previous']) => (n?.path ? { path: n.path, label: nameOf(n.name) } : null);
  return {
    id: view.item.id,
    path,
    title,
    sub: middle.join(' · '),
    pathBar: steps,
    previous: neighbour(view.previous),
    next: neighbour(view.next),
    text,
    citation: [...middle, title].join(', '),
    url: `${origin}${path}`,
    rev: (view.item as { rev?: number }).rev ?? 0,
    names: namesOf((view.item.data as { label?: unknown }).label),
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
    const [pages, file] = await Promise.all([
      api.scanPages({ id: text.scan }).catch(() => null) as Promise<{ pages?: { page: number; image: string; width: number; height: number }[] } | null>,
      text.file ? api.getFile({ sha256: text.file }).catch(() => null) : Promise.resolve(null),
    ]);
    const images = (pages?.pages ?? [])
      .filter((p) => p.page >= first && p.page <= last && p.image)
      .map((p) => ({ page: p.page, src: p.image, width: p.width || 1000, height: p.height || 1414 }));
    const pdf = (file as { url?: string | null } | null)?.url ?? null;
    return { kind: 'pages', first, last, images, pdf: pdf ? `${pdf}#page=${first}` : null };
  }
  if (text.kind === 'withheld') return { kind: 'withheld', reason: text.reason ?? '', ...(text.url ? { source: text.url } : {}) };
  return { kind: 'none' };
}
