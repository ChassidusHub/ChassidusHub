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

/** The tree, with what a page looks up in it. */
export class Core {
  /** Every work on each set, the official ones first in the set's order, then its additions in theirs, then the rest. */
  readonly worksOn = new Map<string, SnapshotWork[]>();
  readonly byPath = new Map<string, SnapshotSet | SnapshotWork>();

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
}

/** Where a snapshot's files come from: the Worker's bucket or the API, or the browser's cache. */
export interface Snapshot {
  core(): Promise<Core | null>;
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
 */
export function snapshotFrom({
  manifest: getManifest,
  file: getFile,
  recheckMs = 60_000,
  keep = 24,
  now = Date.now,
}: {
  manifest: () => Promise<Response>;
  file: (name: string) => Promise<Response>;
  recheckMs?: number;
  keep?: number;
  now?: () => number;
}): Snapshot {
  let manifest: Promise<Manifest | null> | null = null;
  let asked = 0;
  let current: Manifest | null = null;
  let tree: Kept<Core> | null = null;
  const files = new Map<string, Kept<unknown>>();

  const json = async <T>(response: Promise<Response>): Promise<T | null> => {
    const answer = await response;
    return answer.ok ? ((await answer.json()) as T) : null;
  };

  const readManifest = (): Promise<Manifest | null> => {
    if (manifest && now() - asked < recheckMs) return manifest;
    asked = now();
    const asking = json<Manifest>(getManifest())
      .then((found) => {
        // A format this site does not know is not read: pages read the API.
        if (found?.format === SNAPSHOT_FORMAT && found.tree?.file) current = found;
        return current;
      })
      .catch(() => current);
    // The first time, a page waits for it; after that, pages keep the one they have while the next is asked.
    if (!current) manifest = asking;
    else void asking.then((found) => (manifest = Promise.resolve(found)));
    return manifest ?? asking;
  };

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

  return {
    async core() {
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
    },
    async units(work) {
      const name = (await readManifest())?.works[work]?.file;
      return name ? read(name, (file) => ((file as UnitsFile).format === SNAPSHOT_FORMAT ? (file as UnitsFile) : null)) : null;
    },
    async year(year) {
      const name = (await readManifest())?.years[String(year)]?.file;
      return name ? read(name, (file) => ((file as YearFile).format === SNAPSHOT_FORMAT ? (file as YearFile).events : null)) : null;
    },
    async hasYear(year) {
      const found = await readManifest();
      return found ? String(year) in found.years : null;
    },
  };
}
