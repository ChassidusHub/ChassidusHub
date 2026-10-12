/**
 * The catalog snapshot: the whole tree (every shelf and sefer, each sefer's
 * units by volume, each Hebrew year's events) as a few files that never
 * change once written, built by the API from main and built again after
 * every write (docs/catalog-snapshot.md, studio/plans/www-instant.md). The
 * site draws its catalog pages from it with no API call: the Worker holds
 * it in memory, and the browser keeps it after the first page, so every
 * catalog click is drawn at once, as in the reader app.
 *
 * A small manifest names the files; each file is named by its hash and is
 * fetched only when a page needs it: the tree (every library page), one
 * sefer's units (only when one of its volumes is opened), one year's events.
 * These are the format's shapes as this site reads them
 * (packages/core/src/catalogSnapshot.ts); fields it does not read are left out.
 */

/** The format this site reads. A manifest of another format is not read, and pages read the API. */
export const SNAPSHOT_FORMAT = 1;

/**
 * The format of the small cut (index.json, and the top, shelf and years files
 * only it names): the same snapshot in a few small files, so a first tap on a
 * slow phone is not left waiting on the whole tree (#265). An index of
 * another format is not read, and the snapshot is read through the manifest.
 */
export const SNAPSHOT_INDEX_FORMAT = 2;

export interface SnapshotName {
  he: string;
  en?: string;
}

export interface SnapshotFile {
  file: string;
}

export interface Manifest {
  format: number;
  version: string;
  tree: SnapshotFile;
  /** Each sefer that has units, by id. */
  works: Record<string, SnapshotFile>;
  /** Each Hebrew year that has events. */
  years: Record<string, SnapshotFile>;
}

export interface SnapshotSet {
  id: string;
  path: string | null;
  rev: number;
  name: SnapshotName;
  slug?: string;
  /** Absent on a top shelf. */
  parent?: string;
  /** The shelves inside it, its official sefarim, and the additions on it that belong to no official sefer on it, each in the catalog's order. */
  sets: string[];
  works: string[];
  additions: string[];
}

export interface SnapshotPart {
  value: string;
  label: SnapshotName | null;
  units: number;
}

export interface SnapshotWork {
  id: string;
  path: string | null;
  rev: number;
  title: SnapshotName;
  /** The shelves it is on. */
  sets: string[];
  addition?: { kind: string; to?: string };
  additions: string[];
  /** Its volumes, in the catalog's order. */
  parts: SnapshotPart[];
  /** What its first level is called (`volume`). */
  level?: string;
  /** How many levels its units' positions have: 1 means /sefer/3 is a unit, not a volume. */
  depth?: number;
}

export interface Tree {
  format: number;
  /** The top shelves: the Rebbeim in their line, then the others. */
  top: string[];
  sets: Record<string, SnapshotSet>;
  works: Record<string, SnapshotWork>;
  /** The small cut's top file, which the tree was made from. */
  topFile?: TopFile;
}

export interface SnapshotUnit {
  id: string;
  path: string | null;
  title: SnapshotName | null;
  /** The last of its position's labels ("עמ׳ 49"), and the level between the volume and it, where there are. */
  place?: string;
  group?: string;
}

export interface UnitsFile {
  format: number;
  work: string;
  parts: Array<SnapshotPart & { items: SnapshotUnit[] }>;
}

export interface SnapshotEvent {
  id: string;
  kind?: string;
  /** Its Hebrew date: 5742-05-10, or 5742-05 / 5742 when not known to the day. */
  date: string;
  title: SnapshotName | null;
  order?: number;
  recordings: number;
}

export interface YearFile {
  format: number;
  year: number;
  events: SnapshotEvent[];
}

/** index.json: the small cut's files by name. */
export interface SnapshotIndex {
  format: number;
  version: string;
  top: string;
  /** Each top shelf's file, by the shelf's id. */
  shelves: Record<string, string>;
  years: string;
}

/** A shelf or a sefer as the top file names it. */
export interface TopEntry {
  id: string;
  path: string | null;
  name: SnapshotName;
  /** A top shelf's revision (#301). */
  rev?: number;
}

/** One of a Rebbe's shelves in the top file: since #301 also its official sefarim, the names of its first 3 shelves inside, and whether it has additions to none of them. */
export interface TopInner extends TopEntry {
  works?: TopEntry[];
  inner?: SnapshotName[];
  loose?: true;
}

/** A top shelf in the top file; a Rebbe's also with the shelves, sefarim and additions (to none of them) on it. */
export interface TopShelf extends TopEntry {
  rebbe?: number;
  sets?: TopInner[];
  works?: TopEntry[];
  additions?: TopEntry[];
}

export interface TopFile {
  format: number;
  /** Every top shelf, in order. */
  top: TopShelf[];
}

/** One top shelf and everything under it, as in the tree; a sefer with units names its file. */
export interface ShelfFile {
  format: number;
  shelf: string;
  sets: Record<string, SnapshotSet>;
  works: Record<string, SnapshotWork & { file?: string }>;
}

export interface YearsFile {
  format: number;
  years: Record<string, { file: string; events: number }>;
}

/**
 * A shelf the top file only names: enough for the library's page and a path
 * bar's choices, not for the shelf's own page. A page that needs more of it
 * waits for its shelf's file (`Core.whole`), or is read from the API.
 */
type NamedOnly = SnapshotSet & { named: true };

/** The tree, with what a page looks up in it. */
export class Core {
  /** Every work on each set, the official ones first in the set's order, then its additions in theirs, then the rest. */
  readonly worksOn = new Map<string, SnapshotWork[]>();
  readonly byPath = new Map<string, SnapshotSet | SnapshotWork>();

  /**
   * `tree` is the whole tree (the manifest's), or as much of it as the small
   * cut has brought: the top file's shelves, named only, and the shelves'
   * files read so far, whole.
   */
  constructor(readonly tree: Tree) {
    for (const set of Object.values(tree.sets)) if (set.path) this.byPath.set(set.path, set);
    for (const work of Object.values(tree.works)) {
      if (work.path) this.byPath.set(work.path, work);
      for (const set of work.sets) {
        const list = this.worksOn.get(set);
        if (list) list.push(work);
        else this.worksOn.set(set, [work]);
      }
    }
    for (const [id, works] of this.worksOn) {
      const set = tree.sets[id];
      const rank = new Map([...(set?.works ?? []), ...(set?.additions ?? [])].map((work, at) => [work, at]));
      works.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || ((a.path ?? '') < (b.path ?? '') ? -1 : 1));
    }
  }

  set(id: string): SnapshotSet | undefined {
    return this.tree.sets[id];
  }

  work(id: string): SnapshotWork | undefined {
    return this.tree.works[id];
  }

  /** The sets inside a set, or the top shelves, in the catalog's order. */
  setsIn(parent: string | undefined): SnapshotSet[] {
    const ids = parent ? (this.tree.sets[parent]?.sets ?? []) : this.tree.top;
    return ids.map((id) => this.tree.sets[id]).filter((set): set is SnapshotSet => !!set);
  }

  isWork(item: SnapshotSet | SnapshotWork): item is SnapshotWork {
    return this.tree.works[item.id] === item;
  }

  /** Whether everything under this shelf is here (its shelf's file has been read), not only its name. */
  whole(id: string): boolean {
    const set = this.tree.sets[id];
    return !!set && !(set as Partial<NamedOnly>).named;
  }

  /** A Rebbe's shelf as the top file has it whole (#301): each of his shelves with its sefarim. Null for any other shelf, or a top file from before. */
  rebbeOnTop(id: string): TopShelf | null {
    const shelf = this.tree.topFile?.top.find((entry) => entry.id === id);
    return shelf?.rebbe && shelf.sets?.every((inner) => inner.works && inner.inner) ? shelf : null;
  }
}

/** The tree as far as the small cut has brought it: the top file's shelves, named only, then each shelf's file read, whole. */
export function treeOf(top: TopFile, shelves: ShelfFile[]): Tree {
  const tree: Tree = { format: SNAPSHOT_FORMAT, top: top.top.map((shelf) => shelf.id), sets: {}, works: {}, topFile: top };
  const named = (entry: TopEntry, parent?: string, inside: string[] = []): NamedOnly => ({
    id: entry.id,
    path: entry.path,
    rev: entry.rev ?? 0,
    name: entry.name,
    ...(parent ? { parent } : {}),
    sets: inside,
    works: [],
    additions: [],
    named: true,
  });
  for (const shelf of top.top) {
    tree.sets[shelf.id] = named(shelf, undefined, (shelf.sets ?? []).map((inner) => inner.id));
    for (const inner of shelf.sets ?? []) tree.sets[inner.id] ??= named(inner, shelf.id);
  }
  for (const file of shelves) {
    Object.assign(tree.sets, file.sets);
    Object.assign(tree.works, file.works);
  }
  return tree;
}

/** Where a snapshot's files come from: the Worker's bucket or the API, or the browser's cache. */
export interface Snapshot {
  core(): Promise<Core | null>;
  /**
   * Reads one top shelf's file into the core (the small cut), so the pages
   * under it are drawn here; true once it is there. False when the snapshot
   * has no small cut, or the file cannot be read.
   */
  shelf(id: string): Promise<boolean>;
  units(work: string): Promise<UnitsFile | null>;
  /** One year's events; null when the snapshot has none for it or cannot be read. */
  year(year: number): Promise<SnapshotEvent[] | null>;
  /** Whether the snapshot knows the year (it lists every year that has events). */
  hasYear(year: number): Promise<boolean | null>;
}

/** Thrown where the snapshot cannot answer (a sicha's words, an old path, a scan): the page is then drawn from the API. */
export class NotLocal extends Error {
  readonly notLocal = true;
  constructor(what: string) {
    super(`not in the catalog snapshot: ${what}`);
  }
}

export const isNotLocal = (error: unknown): boolean => !!(error as { notLocal?: boolean } | null)?.notLocal;

interface Kept<T> {
  file: string;
  value: Promise<T | null>;
}

/**
 * A snapshot read through `manifest` and `file` (a fetch of the manifest, and
 * of a file by its name), each file read once and kept. The manifest is asked
 * again at most every `recheckMs`; until the new one has come, pages keep the
 * one they have. Only the sefarim and years opened last are kept in memory.
 *
 * With `index`, the small cut is read first: the index and the top file (a
 * few kB) make the core at once, and each top shelf's file is added to it
 * when `shelf` asks for it; the manifest and the tree are then never read.
 * A site with no index, or one of a format this site does not know, is read
 * through the manifest as before.
 */
export function snapshotFrom({
  manifest: getManifest,
  index: getIndex,
  file: getFile,
  recheckMs = 60_000,
  keep = 24,
  now = Date.now,
}: {
  manifest: () => Promise<Response>;
  index?: () => Promise<Response>;
  file: (name: string) => Promise<Response>;
  recheckMs?: number;
  keep?: number;
  now?: () => number;
}): Snapshot {
  let tree: Kept<Core> | null = null;
  const files = new Map<string, Kept<unknown>>();

  const json = async <T>(response: Promise<Response>): Promise<T | null> => {
    const answer = await response;
    return answer.ok ? ((await answer.json()) as T) : null;
  };

  /**
   * A small file that changes (the manifest, the index), asked again at most
   * every `recheckMs`. The first time, a page waits for it; after that, pages
   * keep the one they have while the next is asked.
   */
  const rechecked = <T>(ask: () => Promise<T | null>): (() => Promise<T | null>) => {
    let kept: Promise<T | null> | null = null;
    let asked = 0;
    let current: T | null = null;
    return () => {
      if (kept && now() - asked < recheckMs) return kept;
      asked = now();
      const asking = ask()
        .then((found) => (found ? (current = found) : current))
        .catch(() => current);
      if (!current) kept = asking;
      else void asking.then((found) => (kept = Promise.resolve(found)));
      return kept ?? asking;
    };
  };

  // A format this site does not know is not read: pages read the API.
  const readManifest = rechecked(async () => {
    const found = await json<Manifest>(getManifest());
    return found?.format === SNAPSHOT_FORMAT && found.tree?.file ? found : null;
  });
  const readIndex = getIndex
    ? rechecked(async () => {
        const found = await json<SnapshotIndex>(getIndex());
        return found?.format === SNAPSHOT_INDEX_FORMAT && found.top ? found : null;
      })
    : () => Promise.resolve(null);

  /** A file by name, read once; a file that failed is asked again next time. */
  const read = <T>(name: string, made: (value: unknown) => T | null): Promise<T | null> => {
    const kept = files.get(name) as Kept<T> | undefined;
    if (kept) {
      // Most recently used last.
      files.delete(name);
      files.set(name, kept);
      return kept.value;
    }
    const value = json<unknown>(getFile(name)).then((found) => (found ? made(found) : null));
    const entry = { file: name, value: value.catch(() => null) };
    files.set(name, entry);
    while (files.size > keep) files.delete(files.keys().next().value!);
    void entry.value.then((found) => !found && files.get(name) === entry && files.delete(name));
    return entry.value;
  };
  const ofFormat =
    <T extends { format: number }>(format: number) =>
    (file: unknown): T | null =>
      (file as T).format === format ? (file as T) : null;

  // The small cut: the top shelves' files read so far, kept for the visit (the top file and they are the core).
  const shelves = new Map<string, ShelfFile>();
  const reading = new Map<string, Promise<void>>();
  let small: { key: string; core: Core } | null = null;

  /** The core from the small cut: the top file and the shelves' files read so far; null without them. */
  const smallCore = async (index: SnapshotIndex): Promise<Core | null> => {
    const top = await read(index.top, ofFormat<TopFile>(SNAPSHOT_INDEX_FORMAT));
    if (!top) return null;
    const named = new Set(Object.values(index.shelves));
    for (const name of shelves.keys()) if (!named.has(name)) shelves.delete(name);
    const key = [index.top, ...shelves.keys()].join(' ');
    if (small?.key !== key) small = { key, core: new Core(treeOf(top, [...shelves.values()])) };
    return small.core;
  };

  const readYears = async (): Promise<YearsFile | null> => {
    const index = await readIndex();
    return index ? read(index.years, ofFormat<YearsFile>(SNAPSHOT_INDEX_FORMAT)) : null;
  };

  const manifestCore = async (): Promise<Core | null> => {
    const found = await readManifest();
    if (!found) return null;
    if (tree?.file !== found.tree.file) {
      const value = json<Tree>(getFile(found.tree.file))
        .then((part) => (part?.format === SNAPSHOT_FORMAT ? new Core(part) : null))
        .catch(() => null);
      const entry = { file: found.tree.file, value };
      tree = entry;
      void value.then((done) => !done && tree === entry && (tree = null));
    }
    return tree.value;
  };

  return {
    async core() {
      const index = await readIndex();
      return (index && (await smallCore(index))) || manifestCore();
    },
    async shelf(id) {
      const index = await readIndex();
      const name = index?.shelves[id];
      if (!name) return false;
      if (!shelves.has(name)) {
        let asking = reading.get(name);
        if (!asking) {
          asking = json<ShelfFile>(getFile(name))
            .then((found) => void (found?.format === SNAPSHOT_INDEX_FORMAT && shelves.set(name, found)))
            .catch(() => undefined)
            .finally(() => reading.delete(name));
          reading.set(name, asking);
        }
        await asking;
      }
      return shelves.has(name);
    },
    async units(work) {
      const index = await readIndex();
      const name = index ? ((await smallCore(index))?.work(work) as { file?: string } | undefined)?.file : (await readManifest())?.works[work]?.file;
      return name ? read(name, ofFormat<UnitsFile>(SNAPSHOT_FORMAT)) : null;
    },
    async year(year) {
      const years = await readYears();
      const name = years ? years.years[String(year)]?.file : (await readManifest())?.years[String(year)]?.file;
      return name ? ((await read(name, ofFormat<YearFile>(SNAPSHOT_FORMAT)))?.events ?? null) : null;
    },
    async hasYear(year) {
      const years = await readYears();
      if (years) return String(year) in years.years;
      const found = await readManifest();
      return found ? String(year) in found.years : null;
    },
  };
}
