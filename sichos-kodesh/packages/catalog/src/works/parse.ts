import type {
  CatalogAuthor,
  CatalogContentsEntry,
  CatalogEdition,
  CatalogUnit,
  CatalogWork,
  CatalogWorkContents,
  CatalogWorks,
  CatalogWorksIndex,
  CatalogWorkSource,
} from './types.js';

/**
 * Validates the works of a fetched or stored release. It checks what every
 * screen relies on: ids, titles, sources, and units whose editions point at
 * a source the work has. One malformed work rejects the whole release,
 * the same rule as the farbrengens and the library.
 */

const RIGHTS = new Set(['ship', 'ship-with-credit', 'link-only', 'local-only']);
const KINDS = new Set(['text', 'scan', 'pdf', 'audio', 'video']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNames(value: unknown): boolean {
  return isRecord(value) && typeof value.he === 'string' && typeof value.en === 'string';
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isAuthor(value: unknown): value is CatalogAuthor {
  return isRecord(value) && typeof value.id === 'string' && isNames(value.name) && (value.rebbe === undefined || typeof value.rebbe === 'number');
}

function isSource(value: unknown): value is CatalogWorkSource {
  if (!isRecord(value)) return false;
  const { source, sourceId, kind, language, licence, rights, credit, version } = value;
  if (typeof source !== 'string' || typeof sourceId !== 'string' || typeof kind !== 'string' || !KINDS.has(kind)) return false;
  if (language !== undefined && language !== 'he' && language !== 'en' && language !== 'yi') return false;
  if (typeof licence !== 'string' || typeof rights !== 'string' || !RIGHTS.has(rights)) return false;
  return isOptionalString(credit) && isOptionalString(version);
}

function isWork(value: unknown): value is CatalogWork {
  if (!isRecord(value)) return false;
  const { id, title, authors, genre, levels, collection, sources, units, textBytes } = value;
  if (typeof id !== 'string' || id.length === 0 || !isNames(title) || typeof genre !== 'string') return false;
  if (!Array.isArray(authors) || !authors.every((a) => typeof a === 'string')) return false;
  if (!Array.isArray(levels) || !levels.every((l) => typeof l === 'string')) return false;
  if (!isOptionalString(collection) || !Array.isArray(sources) || !sources.every(isSource)) return false;
  return (units === undefined || typeof units === 'number') && (textBytes === undefined || typeof textBytes === 'number');
}

function isEdition(value: unknown, sourceCount: number): value is CatalogEdition {
  if (!isRecord(value)) return false;
  const { source, sha256, bytes } = value;
  if (typeof source !== 'number' || !Number.isInteger(source) || source < 0 || source >= sourceCount) return false;
  if (sha256 !== undefined && (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256))) return false;
  return bytes === undefined || typeof bytes === 'number';
}

function isUnit(value: unknown, sourceCount: number): value is CatalogUnit {
  if (!isRecord(value)) return false;
  const { id, label, labelEn, ref, editions } = value;
  if (typeof id !== 'string' || id.length === 0 || typeof label !== 'string') return false;
  if (!isOptionalString(labelEn) || !isOptionalString(ref)) return false;
  return Array.isArray(editions) && editions.every((e) => isEdition(e, sourceCount));
}

function isEntry(value: unknown, unitIds: Set<string>): value is CatalogContentsEntry {
  if (!isRecord(value)) return false;
  if (typeof value.unitId === 'string') return unitIds.has(value.unitId);
  return isNames(value.title) && Array.isArray(value.entries) && value.entries.every((e) => isEntry(e, unitIds));
}

/** One work's contents part, checked against its work (every edition's source must exist). */
export function parseWorkContents(value: unknown, work: Pick<CatalogWork, 'id' | 'sources'>): CatalogWorkContents | null {
  if (!isRecord(value) || value.workId !== work.id || !Array.isArray(value.units) || !Array.isArray(value.contents)) return null;
  if (!value.units.every((u) => isUnit(u, work.sources.length))) return null;
  const unitIds = new Set((value.units as CatalogUnit[]).map((u) => u.id));
  if (unitIds.size !== value.units.length) return null;
  if (!value.contents.every((e) => isEntry(e, unitIds))) return null;
  return value as unknown as CatalogWorkContents;
}

export function parseCatalogWorksIndex(value: unknown): CatalogWorksIndex | null {
  if (!isRecord(value) || !Array.isArray(value.authors) || !Array.isArray(value.works)) return null;
  if (!value.authors.every(isAuthor) || !value.works.every(isWork)) return null;
  const ids = new Set((value.works as CatalogWork[]).map((w) => w.id));
  if (ids.size !== value.works.length) return null;
  return { authors: value.authors as CatalogAuthor[], works: value.works as CatalogWork[] };
}

export function parseCatalogWorks(value: unknown): CatalogWorks | null {
  const index = parseCatalogWorksIndex(value);
  if (!index || !isRecord(value) || !isRecord(value.contents)) return null;
  const byId = new Map(index.works.map((w) => [w.id, w]));
  const contents: Record<string, CatalogWorkContents> = {};
  for (const [workId, part] of Object.entries(value.contents)) {
    const work = byId.get(workId);
    const parsed = work ? parseWorkContents(part, work) : null;
    if (!parsed) return null;
    contents[workId] = parsed;
  }
  return { ...index, contents };
}

/**
 * What in the works may not ship: a local-only source, or a text kept for
 * an edition whose source is link-only. Empty when all is well. The works
 * builder and bin/release.ts both refuse anything else, as a second check
 * behind the rights gate in packages/works.
 */
export function worksRightsProblems(works: CatalogWorks): string[] {
  const problems: string[] = [];
  for (const work of works.works) {
    for (const source of work.sources) if (source.rights === 'local-only') problems.push(`${work.id}: a local-only source (${source.source} ${source.sourceId})`);
    const part = works.contents[work.id];
    for (const unit of part?.units ?? []) {
      for (const edition of unit.editions) {
        const rights = work.sources[edition.source]?.rights;
        if (edition.sha256 && rights !== 'ship' && rights !== 'ship-with-credit') problems.push(`${work.id}/${unit.id}: a text kept for a ${rights ?? 'missing'} source`);
      }
    }
  }
  return problems;
}
