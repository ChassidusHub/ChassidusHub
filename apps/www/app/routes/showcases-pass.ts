import { describeDateKey } from '@chassidushub/hebrew';
import type { ChassidusHub } from '@chassidushub/client';
import { nameOf } from '../lib/catalog';
import { personOf } from '../stewards/person.server';
import { linkOf, mediaSourceOf, newToken, NO_EXTRAS, READ_SICHA, TOKEN, type MediaSource, type Showcase, type ShowcaseReading } from '../stewards/showcase';
import { fromThisSite } from './fix';
import type { Route } from './+types/showcases-pass';

/** One farbrengen or sicha as the editor lists it. */
export interface Pick {
  id: string;
  label: string;
  sub: string;
}

/** What GET /_/showcases answers the owner: the showcases, the one being edited, and what to pick from. */
export interface Showcases {
  list: { token: string; title: string; note: string; updated: string; farbrengens: number; sichos: number }[];
  current: {
    token: string;
    title: string;
    note: string;
    numbers: boolean;
    farbrengens: Pick[];
    sichos: Pick[];
    readings: { title: string }[];
    originals: Record<string, string>;
  } | null;
  /** The farbrengens whose transcripts people checked most, then the longest. */
  best: (Pick & { parts: number; paragraphs: number; checked: number })[];
  /** Likkutei Sichos our reader read and nobody checked yet, the newest first. */
  read: (Pick & { segments: number })[];
}

const MAX_ITEMS = 12;
const ID = /^rh-[0-9a-z]+$/;
const NOT_KEPT = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NOT_KEPT });

type Item = { id: string; type: string; path: string | null; data: Record<string, unknown> };

const pickOf = (item: Item): Pick => {
  const d = item.data as { name?: unknown; title?: unknown; label?: unknown; date?: string };
  let date = '';
  try {
    date = typeof d.date === 'string' ? describeDateKey(d.date) : '';
  } catch {
    date = d.date ?? '';
  }
  return { id: item.id, label: nameOf(d.name ?? d.title ?? d.label, item.id), sub: date || (item.path ?? '') };
};

async function itemsOf(api: ChassidusHub, ids: string[]): Promise<Map<string, Item>> {
  const wanted = [...new Set(ids.filter((id) => ID.test(id)))];
  const found = new Map<string, Item>();
  for (let at = 0; at < wanted.length; at += 50) {
    const { items } = await api.getItems({ ids: wanted.slice(at, at + 50).join(',') }).catch(() => ({ items: [] }));
    for (const item of items as unknown as Item[]) found.set(item.id, item);
  }
  return found;
}

type Transcribed = { recording: string; event?: string; paragraphs?: number; checked?: number };

/**
 * Showcases, for the platform's admin only (the old site's owner): GET lists
 * them, the one asked for (`?edit=`) and what to pick from; POST saves one
 * (`intent: save`) or removes it (`intent: delete`), which closes its address
 * at once. Personal: never kept.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  if (!context.showcases) return json({ error: 'none' }, 404);
  if (!(await personOf(request, context))?.admin) return json({ error: 'owner' }, 403);
  const store = context.showcases;
  const api = context.api;
  const editing = new URL(request.url).searchParams.get('edit') ?? '';
  const [list, transcribed, toCheck] = await Promise.all([
    store.list(),
    api.transcribedRecordings({ limit: 1000 }).then((r) => r.recordings as Transcribed[]).catch(() => [] as Transcribed[]),
    api.machineToCheck({ limit: 200 }).catch(() => null),
  ]);
  const current = TOKEN.test(editing) ? (list.find((s) => s.token === editing) ?? null) : null;
  const byEvent = new Map<string, { parts: number; paragraphs: number; checked: number }>();
  for (const r of transcribed) {
    if (!r.event) continue;
    const sum = byEvent.get(r.event) ?? { parts: 0, paragraphs: 0, checked: 0 };
    byEvent.set(r.event, { parts: sum.parts + 1, paragraphs: sum.paragraphs + (r.paragraphs ?? 0), checked: sum.checked + (r.checked ?? 0) });
  }
  const top = [...byEvent].sort((a, b) => b[1].checked - a[1].checked || b[1].paragraphs - a[1].paragraphs).slice(0, 24);
  const readSichos = (toCheck?.texts ?? []).filter((t) => t.type === 'unit' && READ_SICHA.test(t.path ?? '')).slice(0, 24);
  const items = await itemsOf(api, [...top.map(([id]) => id), ...readSichos.map((t) => t.entity), ...(current ? [...current.farbrengens, ...current.sichos] : [])]);
  const picked = (ids: string[]) => ids.flatMap((id) => (items.get(id) ? [pickOf(items.get(id)!)] : []));
  const answer: Showcases = {
    list: list.map((s) => ({ token: s.token, title: s.title, note: s.note, updated: s.updated, farbrengens: s.farbrengens.length, sichos: s.sichos.length })),
    current: current && {
      token: current.token,
      title: current.title,
      note: current.note,
      numbers: current.extras.numbers,
      farbrengens: picked(current.farbrengens),
      sichos: picked(current.sichos),
      readings: (current.readings ?? []).map((r) => ({ title: r.title })),
      originals: Object.fromEntries(Object.entries(current.originals ?? {}).flatMap(([id, at]) => (current.media[at] ? [[id, linkOf(current.media[at]!)]] : []))),
    },
    best: top.flatMap(([id, sum]) => (items.get(id) ? [{ ...pickOf(items.get(id)!), ...sum }] : [])),
    read: readSichos.flatMap((t) => (items.get(t.entity) ? [{ ...pickOf(items.get(t.entity)!), segments: t.segments ?? 0 }] : [])),
  };
  return json(answer);
}

/** What the editor sends to save. */
interface Save {
  intent: 'save' | 'delete';
  token?: string;
  title?: string;
  note?: string;
  farbrengens?: string[];
  sichos?: string[];
  numbers?: boolean;
  /** A farbrengen's original, by its Drive link. */
  originals?: Record<string, string>;
  /** Readings kept from before, by their place; the others are dropped. */
  keepReadings?: number[];
}

const idsOf = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).filter((id): id is string => typeof id === 'string' && ID.test(id)))].slice(0, MAX_ITEMS);

export async function action({ request, context }: Route.ActionArgs) {
  if (!fromThisSite(request)) return json({ error: 'refused' }, 403);
  if (!context.showcases) return json({ error: 'none' }, 404);
  if (!(await personOf(request, context))?.admin) return json({ error: 'owner', message: 'only the owner makes showcases' }, 403);
  const store = context.showcases;
  const api = context.api;
  const input = ((await request.json().catch(() => null)) ?? {}) as Save;
  const existing = input.token && TOKEN.test(input.token) ? await store.get(input.token) : null;
  if (input.intent === 'delete') {
    if (existing) await store.remove(existing.token);
    return json({ ok: true });
  }

  const farbrengens = idsOf(input.farbrengens);
  const sichos = idsOf(input.sichos);
  // What a guest may be given, fixed now: each farbrengen's recordings, each sicha's own scan.
  const [linked, units, transcribed] = await Promise.all([
    farbrengens.length ? api.linkedOfEach({ ids: farbrengens.join(','), field: 'event', type: 'recording', limit: 80 }).then((r) => r.linked as unknown as Record<string, Item[]>) : ({} as Record<string, Item[]>),
    itemsOf(api, sichos),
    api.transcribedRecordings({ limit: 1000 }).then((r) => r.recordings as Transcribed[]),
  ]);
  const recordings = farbrengens.flatMap((id) => linked[id] ?? []);
  const shas = recordings.map((r) => String((r.data as { file?: string }).file ?? '')).filter((sha) => /^[0-9a-f]{64}$/.test(sha));
  const files = new Map<string, string>();
  if (shas.length) {
    const { items } = (await api.getFiles({ ids: shas.join(',') }).catch(() => ({ items: [] }))) as unknown as { items: { sha256: string; url: string | null }[] };
    for (const f of items) if (f.url) files.set(f.sha256, f.url);
  }
  const media: MediaSource[] = [];
  const mediaOf: Record<string, number> = {};
  const keep = (id: string, source: MediaSource | null) => {
    if (source) mediaOf[id] = media.push(source) - 1;
  };
  for (const r of recordings) {
    const d = r.data as { file?: string; url?: string };
    keep(r.id, mediaSourceOf((d.file ? files.get(d.file) : null) ?? d.url));
  }
  for (const id of sichos) {
    const editions = ((units.get(id)?.data as { editions?: { url?: string; kind?: string; role?: string }[] } | undefined)?.editions ?? []).filter((e) => e.kind === 'pdf');
    keep(id, mediaSourceOf((editions.find((e) => e.role === 'sicha') ?? editions.find((e) => !e.role))?.url));
  }
  const originals: Record<string, number> = {};
  for (const id of farbrengens) {
    const source = mediaSourceOf(String(input.originals?.[id] ?? '').trim());
    if (source && source.kind !== 'jem') originals[id] = media.push(source) - 1;
  }
  // The pages the old site's reader read, those kept: their scans move to this list's new places.
  const readings: ShowcaseReading[] = [];
  for (const [at, reading] of (existing?.readings ?? []).entries()) {
    if (!(input.keepReadings ?? []).includes(at)) continue;
    const source = reading.media !== null ? (existing!.media[reading.media] ?? null) : null;
    readings.push({ ...reading, media: source ? media.push(source) - 1 : null });
  }
  const withWords = new Set(transcribed.map((t) => t.recording));
  const now = new Date().toISOString();
  const showcase: Showcase = {
    token: existing?.token ?? newToken(),
    title: String(input.title ?? '').trim().slice(0, 120) || 'ChassidusHub',
    note: String(input.note ?? '').trim().slice(0, 240),
    lang: 'he',
    created: existing?.created ?? now,
    updated: now,
    farbrengens,
    sichos,
    extras: { ...NO_EXTRAS, ...existing?.extras, numbers: input.numbers !== false },
    media,
    mediaOf,
    transcripts: recordings.filter((r) => withWords.has(r.id) && mediaOf[r.id] !== undefined).map((r) => r.id),
    readings,
    originals,
  };
  await store.put(showcase);
  return json({ ok: true, token: showcase.token });
}
