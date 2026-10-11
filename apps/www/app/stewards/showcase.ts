/**
 * A showcase: one page the owner makes for the people he meets, at a secret
 * address of its own (`/show/<token>`), picked at `/showcase`: the
 * farbrengens to hear with their words, the sichos with their scans, and the
 * catalog in numbers. Kept in the public bucket as `showcases/<token>.json`,
 * the same files the old site wrote, so every link already handed out keeps
 * working.
 *
 * Its rules (kept from the old site): the token is twenty letters of base32,
 * so it is not guessed; the page and everything a guest asks of it live under
 * `/show/<token>/`, and are never kept by a shared cache or shown to a search
 * engine; a guest is given only the files and transcripts the showcase lists,
 * fixed when it is saved. Only the platform's admin makes them.
 */

/** Where a recording's or scan's bytes are, for a guest to be given them through the showcase. */
export type MediaSource =
  /** A file ChassidusHub serves itself (`/objects/<sha256>`). */
  | { kind: 'object'; sha256: string }
  /** JEM's audio, by its file name. */
  | { kind: 'jem'; file: string }
  /** A Google Drive file (a sicha's PDF, a farbrengen's written original). */
  | { kind: 'drive'; id: string; resourceKey: string | null };

export interface ShowcaseExtras {
  /** The old site's "today's Hayom Yom": kept in the file, never shown (no daily learning on this site). */
  daily: boolean;
  /** The old site's subject index section: kept in the file; the index has its own page. */
  mafteach: boolean;
  /** The old site's models and scores: kept in the file; not shown here. */
  models: boolean;
  /** The catalog in numbers. */
  numbers: boolean;
}

/** A page the old site's reader read (its OCR), saved with a showcase: its words, and its scan's place in `media`. */
export interface ShowcaseReading {
  title: string;
  scan: string | null;
  body: unknown;
  media: number | null;
}

export interface Showcase {
  token: string;
  title: string;
  /** A line under the title: who it is for, or what to look at. */
  note: string;
  lang: 'he' | 'en';
  created: string;
  updated: string;
  /** Farbrengens (event ids), in the order shown. */
  farbrengens: string[];
  /** Sichos (unit ids), in the order shown. */
  sichos: string[];
  extras: ShowcaseExtras;
  /** Every file a guest may be given, by its place in this list (`/show/<token>/m/<n>`). */
  media: MediaSource[];
  /** A recording's or sicha's file: its place in `media`. */
  mediaOf: Record<string, number>;
  /** Recordings whose transcripts a guest may read (`/show/<token>/t/<recording>`). */
  transcripts: string[];
  readings?: ShowcaseReading[];
  /** A farbrengen's original, set beside its words (its place in `media`). */
  originals?: Record<string, number>;
}

export interface ShowcaseStore {
  get(token: string): Promise<Showcase | null>;
  put(showcase: Showcase): Promise<void>;
  remove(token: string): Promise<void>;
  /** Every showcase, the newest first. */
  list(): Promise<Showcase[]>;
}

declare module 'react-router' {
  interface AppLoadContext {
    /** Where showcases are kept (server/worker.ts: the public bucket; server/node.ts: memory). Unset, there are none. */
    showcases?: ShowcaseStore;
  }
}

/** A token's shape: twenty letters and digits of base32 (100 bits). */
export const TOKEN = /^[a-z2-7]{20}$/;

export function newToken(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  return [...crypto.getRandomValues(new Uint8Array(20))].map((b) => alphabet[b & 31]).join('');
}

export const NO_EXTRAS: ShowcaseExtras = { daily: false, mafteach: false, models: false, numbers: false };

const JEM = /^https:\/\/sichos-kodesh-media-proxy\.[\w.-]+\/jem-audio\/([\w-]{1,64}\.(?:mp3|m4a|opus))$/;
const OBJECT = /\/objects\/([0-9a-f]{64})$/;
const DRIVE = /^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,64})/;

/** Where an address says a file's bytes are; null for what a showcase cannot give. */
export function mediaSourceOf(url: string | null | undefined): MediaSource | null {
  if (!url) return null;
  const jem = JEM.exec(url);
  if (jem) return { kind: 'jem', file: jem[1]! };
  const object = OBJECT.exec(url);
  if (object) return { kind: 'object', sha256: object[1]! };
  const drive = DRIVE.exec(url);
  if (drive) return { kind: 'drive', id: drive[1]!, resourceKey: new URL(url).searchParams.get('resourcekey') };
  return null;
}

/** A file's address as the owner would paste it again. */
export function linkOf(source: MediaSource): string {
  if (source.kind === 'drive') return `https://drive.google.com/file/d/${source.id}/view${source.resourceKey ? `?resourcekey=${source.resourceKey}` : ''}`;
  if (source.kind === 'object') return `/objects/${source.sha256}`;
  return source.file;
}

/** JEM's audio files, where Sichos-Kodesh's media proxy fetches them. */
const JEM_CDN = 'https://dtgj2yu3gmlic.cloudfront.net';

/**
 * Where a guest is sent for one of the showcase's files. Files the catalog
 * links go through the API (`api`), so their rights and takedowns hold here
 * as everywhere; a farbrengen's original the owner named opens on Drive.
 */
export function mediaAddress(source: MediaSource, api: string, original: boolean): string {
  if (source.kind === 'object') return `${api}/objects/${source.sha256}`;
  if (source.kind === 'jem') return `${JEM_CDN}/${source.file}`;
  if (original) return linkOf(source);
  return `${api}/v1/drive/${source.id}`;
}

/** A sicha of Likkutei Sichos, by its address: a volume and the page it starts on. */
export const READ_SICHA = /^\/likkutei-sichos\/\d{1,2}\/\d{1,4}$/;

/** A store kept in memory: for the site on Node (local work and the browser tests). */
export function memoryShowcases(): ShowcaseStore {
  const kept = new Map<string, Showcase>();
  return {
    get: async (token) => structuredClone(kept.get(token) ?? null),
    put: async (showcase) => void kept.set(showcase.token, structuredClone(showcase)),
    remove: async (token) => void kept.delete(token),
    list: async () => [...kept.values()].sort((a, b) => b.created.localeCompare(a.created)),
  };
}

/** The little of an R2 bucket the store uses. */
export interface ShowcaseBucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

const PREFIX = 'showcases/';

/** Showcases in the public bucket, one JSON file each, named by a token nobody can guess. */
export function bucketShowcases(bucket: ShowcaseBucket): ShowcaseStore {
  const get = async (token: string): Promise<Showcase | null> => {
    if (!TOKEN.test(token)) return null;
    const object = await bucket.get(`${PREFIX}${token}.json`);
    return object ? (JSON.parse(await object.text()) as Showcase) : null;
  };
  return {
    get,
    put: async (showcase) => void (await bucket.put(`${PREFIX}${showcase.token}.json`, JSON.stringify(showcase), { httpMetadata: { contentType: 'application/json' } })),
    remove: (token) => bucket.delete(`${PREFIX}${token}.json`),
    async list() {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix: PREFIX, ...(cursor ? { cursor } : {}) });
        keys.push(...page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      const all = await Promise.all(keys.map((key) => get(key.slice(PREFIX.length).replace(/\.json$/, ''))));
      return all.filter((s): s is Showcase => s !== null).sort((a, b) => b.created.localeCompare(a.created));
    },
  };
}

/** What a showcase's page may never be: kept by a shared cache, found by a search engine, framed, or named to another site. */
export const PRIVATE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' };
