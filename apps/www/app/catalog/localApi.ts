import type { ChassidusHub, Item, PathChoice, PathLevel } from '@chassidushub/client';
import { rebbeFromTop } from '../library/load';
import { Core, NotLocal, type Snapshot, type SnapshotName, type SnapshotSet, type SnapshotWork } from './snapshot';

/**
 * The API's catalog reads, answered from the catalog snapshot: the reads the
 * library's and listening's pages make (app/library/load.ts,
 * app/listen/events.ts), with the answers the API gives, so those pages are
 * drawn by the same code from either. Anything else, and anything the
 * snapshot does not hold (a sicha, a path that moved, a scan's printings,
 * events by day across the years), throws NotLocal, and the page is drawn
 * from the API instead. So does a shelf the small cut has only named, until
 * its top shelf's file is read (snapshot.ts, `Core.whole`). Which recordings
 * can be followed is not in the snapshot (it changes with every checked
 * transcript): that one read goes to `api`, and is kept for a few minutes.
 */

/** How many choices one level of the path bar lists at most, as the API's (packages/core/src/pathBar.ts). */
const PATH_CHOICES_MAX = 500;

/** The catalog's order as the API's items carry it (`order`), for the pages that sort by it: the snapshot's lists are in that order already. */
const orderAt = (at: number) => String(at).padStart(6, '0');

export const setItem = (set: SnapshotSet, at: number) => ({
  id: set.id,
  type: 'set',
  path: set.path,
  rev: set.rev,
  data: { name: set.name, order: orderAt(at), ...(set.parent ? { parent: set.parent } : {}), ...(set.slug ? { slug: set.slug } : {}) },
});

const workItem = (work: SnapshotWork, at = 0) => ({
  id: work.id,
  type: 'work',
  path: work.path,
  rev: work.rev,
  data: { title: work.title, sets: work.sets, order: orderAt(at), ...(work.addition ? { addition: work.addition } : {}) },
});

const choice = (item: { id: string; path: string | null }, name: SnapshotName | null): PathChoice => ({ id: item.id, path: item.path, name: name as PathChoice['name'] });

/**
 * The path bar of a set or a work, as the API works it out: the shelves from
 * the top of the tree down to the set (a work's shelf is its first set inside
 * another, else its first set), each with the other sets beside it, then the
 * work with the other official sefarim on its shelf.
 */
export function shelvesOf(core: Core, from: { set: SnapshotSet } | { work: SnapshotWork }): PathLevel[] {
  let start: SnapshotSet | undefined;
  if ('set' in from) start = from.set;
  else {
    const on = from.work.sets.map((id) => core.set(id)).filter((set): set is SnapshotSet => !!set);
    start = on.find((set) => set.parent) ?? on[0];
  }
  if (!start) return [];
  const chain: SnapshotSet[] = [start];
  for (let at: SnapshotSet | undefined = start; at?.parent && chain.length <= 8; ) {
    at = core.set(at.parent);
    if (at) chain.push(at);
  }
  const levels: PathLevel[] = chain.reverse().map((chosen) => {
    const beside = core.setsIn(chosen.parent).slice(0, PATH_CHOICES_MAX);
    return { kind: 'set', chosen: choice(chosen, chosen.name), choices: beside.map((set) => choice(set, set.name)) };
  });
  if ('work' in from) {
    const work = from.work;
    const official = start.works.map((id) => core.work(id)).filter((w): w is SnapshotWork => !!w);
    // An addition's own page lists it beside the official sefarim, as the API does.
    const beside = official.some((w) => w.id === work.id) ? official : [...official, work];
    levels.push({ kind: 'work', chosen: choice(work, work.title), choices: beside.slice(0, PATH_CHOICES_MAX).map((w) => choice(w, w.title)) });
  }
  return levels;
}

/** A Rebbe's page at `path`, drawn from the top file alone (library/load.ts, `rebbeFromTop`); null for any other path, or a top file without his shelves' sefarim. */
export function rebbeOnTop(core: Core, path: string) {
  const found = core.byPath.get(path);
  if (!found || core.isWork(found)) return null;
  const set = found as SnapshotSet;
  const shelf = core.rebbeOnTop(set.id);
  return shelf ? rebbeFromTop(setItem(set, 0) as unknown as Item, shelvesOf(core, { set }), shelf) : null;
}

/** An API error by its status, as the API client throws them (pages read `status`). */
const notFound = () => Object.assign(new Error('not found'), { status: 404 });

/** Whether a path of two words names a volume of a sefer the snapshot holds, rather than an item. */
function isVolume(core: Core, path: string): boolean {
  const words = path.split('/').filter(Boolean);
  if (words.length !== 2) return false;
  const work = core.byPath.get(`/${words[0]}`);
  return !!work && core.isWork(work) && (work.depth ?? 2) > 1 && work.parts.some((part) => part.value === words[1]);
}

/** The API's reads the catalog pages make, answered from `snapshot`; every other read throws NotLocal. */
export function localApi(snapshot: Snapshot, api: ChassidusHub): ChassidusHub {
  const core = async () => {
    const found = await snapshot.core();
    if (!found) throw new NotLocal('the snapshot');
    return found;
  };
  let transcribed: { at: number; answer: Promise<unknown> } | null = null;
  const reads = {
    baseUrl: api.baseUrl,
    async listItems({ type }: { type?: string }) {
      if (type !== 'set') throw new NotLocal(`items of type ${type}`);
      const found = await core();
      const items: ReturnType<typeof setItem>[] = [];
      const walk = (sets: SnapshotSet[]) =>
        sets.forEach((set, at) => {
          items.push(setItem(set, at));
          walk(found.setsIn(set.id));
        });
      walk(found.setsIn(undefined));
      return { items, next: null };
    },
    async listLinked({ id, field, type, limit = 50 }: { id: string; field: string; type?: string; limit?: number }) {
      if ((type && type !== 'work') || (field !== 'sets' && field !== 'addition.to')) throw new NotLocal(`linked ${type ?? ''} by ${field}`);
      const found = await core();
      // A shelf the small cut has only named: what is on it is in its shelf's file, not read yet.
      if (field === 'sets' ? !found.whole(id) : !found.work(id)) throw new NotLocal(`what is on ${id}`);
      const works = field === 'sets' ? (found.worksOn.get(id) ?? []) : (found.work(id)?.additions ?? []).map((w) => found.work(w)).filter((w): w is SnapshotWork => !!w);
      return { items: works.slice(0, limit).map(workItem), total: works.length, next: null };
    },
    async itemView({ path, id, language }: { path?: string; id?: string; language?: string }) {
      if (language) throw new NotLocal('another language');
      const found = await core();
      const item = id ? (found.set(id) ?? found.work(id)) : path ? found.byPath.get(path) : undefined;
      if (!item) {
        // A volume is no item: the API answers 404 for it, and the page reads its sefer.
        if (path && isVolume(found, path)) throw notFound();
        // A sicha, or a path that moved: the API knows.
        throw new NotLocal(path ?? id ?? '');
      }
      const work = found.isWork(item) ? item : null;
      const set = work ? null : (item as SnapshotSet);
      if (set && !found.whole(set.id)) throw new NotLocal(`the shelf ${set.id}`);
      return {
        item: work ? workItem(work) : setItem(set!, 0),
        pathBar: work ? shelvesOf(found, { work }) : shelvesOf(found, { set: set! }),
        previous: null,
        next: null,
        text: null,
        scan: null,
        recordings: [],
      };
    },
    async workOutline({ id }: { id: string }) {
      const work = (await core()).work(id);
      if (!work) throw new NotLocal(`outline of ${id}`);
      return { parts: work.parts };
    },
    async workPart({ id, part, limit = 1000 }: { id: string; part: string; limit?: number }) {
      const [found, units] = await Promise.all([core(), snapshot.units(id)]);
      const work = found.work(id);
      if (!work) throw new NotLocal(`units of ${id}`);
      // A sefer with no units has no file.
      if (!units && work.parts.length) throw new NotLocal(`units of ${id}`);
      const here = units?.parts.find((p) => p.value === part);
      const items = (here?.items ?? []).slice(0, Math.min(Math.max(limit, 1), 2000));
      // Each unit's place, as a position the volume's page reads: the volume, the heading inside it, the place.
      const volume = { level: work.level, value: part, label: here?.label ?? null };
      return {
        items: items.map((unit) => ({
          id: unit.id,
          type: 'unit',
          path: unit.path,
          rev: 0,
          data: { label: unit.title, work: id, position: [volume, ...(unit.group ? [{ label: unit.group }] : []), { label: unit.place ?? '' }] },
        })),
      };
    },
    async listEvents({ within, day }: { within?: string; day?: string }) {
      // Events by day are in every year's file: the API answers that in one read.
      if (day || !within || !/^\d{4}$/.test(within)) throw new NotLocal('events by day');
      const year = Number(within);
      const known = await snapshot.hasYear(year);
      if (known === null) throw new NotLocal('the snapshot');
      const events = known ? await snapshot.year(year) : [];
      if (!events) throw new NotLocal(`events of ${year}`);
      return { items: events.map((event) => ({ id: event.id, data: { date: event.date, kind: event.kind, title: event.title, order: event.order }, recordings: event.recordings })), next: null };
    },
    transcribedRecordings(query: Parameters<ChassidusHub['transcribedRecordings']>[0]) {
      if (!transcribed || Date.now() - transcribed.at > 300_000) {
        const answer = api.transcribedRecordings(query);
        transcribed = { at: Date.now(), answer };
        answer.catch(() => (transcribed = null));
      }
      return transcribed.answer;
    },
  };
  return new Proxy(reads, {
    get(target, name) {
      if (name in target) return target[name as keyof typeof target];
      if (name === 'then') return undefined;
      return () => Promise.reject(new NotLocal(String(name)));
    },
  }) as unknown as ChassidusHub;
}
