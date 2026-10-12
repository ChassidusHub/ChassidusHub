import type { ChassidusHub, ItemView } from '@chassidushub/client';
import type { PageInline, PageSegment } from '@chassidushub/model';
import { nameOf } from '../lib/catalog';
import { notesHtml, wordsHtml, type DrawnWords } from './words.server';

/**
 * A farbrengen whose sichos are separate units (Sichos Kodesh: a unit per
 * sicha, under a `farbrengen` level) is read as one page, all its sichos one
 * after another, each under its own heading (Shmuly, 2026-10-12: "every
 * farbrengen shows all sichos together"). The page is the first sicha's; the
 * others' addresses lead to their place on it (routes/item.tsx).
 *
 * Each sicha stays its own item on the page: its words sit in a section that
 * names it (`data-fix-item`), so a fix goes to the sicha it is in.
 */

/** The sichos of the farbrengen a unit is in, in order, when it is one; else null. */
export function farbrengenOf(view: ItemView): { label: string; sichos: { path: string }[] } | null {
  const position = (view.item.data as { position?: { level?: unknown; label?: unknown }[] }).position ?? [];
  const parent = position.at(-2);
  if (parent?.level !== 'farbrengen') return null;
  const sichos = (view.pathBar.at(-1)?.choices ?? []).flatMap((choice) => (choice.path ? [{ path: choice.path }] : []));
  if (sichos.length < 2) return null;
  return { label: nameOf(parent.label), sichos };
}

/** Every sicha of the farbrengen read at once (the page's own from the view already read); a sicha that cannot be read is left out. */
export async function farbrengenViews(view: ItemView, sichos: { path: string }[], api: ChassidusHub, language?: string): Promise<ItemView[]> {
  const read = await Promise.all(sichos.map((s) => (s.path === view.item.path ? view : api.itemView({ path: s.path, ...(language ? { language } : {}) }).catch(() => null))));
  return read.filter((v): v is ItemView => !!v);
}

/** A sicha's own name on the farbrengen's page: its label without the farbrengen's name before it ("שיחה א"). */
export function sichaName(view: ItemView, farbrengen: string): string {
  const label = nameOf((view.item.data as { label?: unknown }).label) || nameOf(view.pathBar.at(-1)?.chosen.name);
  const prefix = `${farbrengen}, `;
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A sicha's notes and their marks renamed with the sicha's place, so two sichos' note 1 stay two notes on one page. */
function renamed(segments: readonly PageSegment[], at: number): PageSegment[] {
  const inline = (r: PageInline): PageInline => ('note' in r ? { ...r, note: `${at}-${r.note}` } : r);
  const each = (s: PageSegment): PageSegment => ({ ...s, ...(s.text ? { text: s.text.map(inline) } : {}), ...(s.children ? { children: s.children.map(each) } : {}) });
  return segments.map(each);
}
const renamedNotes = (notes: readonly PageSegment[], at: number) => renamed(notes, at).map((n) => ({ ...n, id: `${at}-${n.id}` }));

/** The farbrengen's words, drawn: each sicha in its own section, under its name; the notes of all of them at the end. */
export function farbrengenWords(views: readonly ItemView[], farbrengen: string): DrawnWords | null {
  let body = '';
  let notes = '';
  views.forEach((view, at) => {
    if (view.text?.kind !== 'words') return;
    const name = sichaName(view, farbrengen);
    const ownNotes = renamedNotes((view.text.notes ?? []) as unknown as PageSegment[], at);
    const segments = renamed((view.text.segments ?? []) as unknown as PageSegment[], at);
    const version = view.text.version ? ` data-fix-version="${escape(view.text.version)}"` : '';
    body += `<section class="fsicha" id="u-${escape(view.item.id)}" data-fix-item="${escape(view.item.id)}"${version}><h2 class="fh">${escape(name)}</h2>${wordsHtml(segments, ownNotes, name)}</section>`;
    if (ownNotes.length) notes += notesHtml(ownNotes);
  });
  return body ? { body, notes } : null;
}

/** Whether the words a machine made and nobody checked are all, some or none of the farbrengen's. */
export function farbrengenMachine(views: readonly ItemView[]): 'none' | 'some' | 'all' {
  const marks = views.flatMap((v) => (v.text?.kind === 'words' ? [v.text.machine ?? 'none'] : []));
  if (marks.every((m) => m === 'all')) return 'all';
  if (marks.every((m) => m === 'none')) return 'none';
  return 'some';
}
