import type { CatalogContentsEntry, CatalogEdition, CatalogUnit, CatalogWork, CatalogWorkContents, CatalogWorks, CatalogWorkSource } from '@chassidushub-reader/catalog';
import { isShippable } from '@chassidushub-reader/catalog';
import type { HebrewBooksShelf } from '@chassidushub-reader/hebrewbooks-index';
import { AUTHORS } from './registry/authors.js';
import { WORKS } from './registry/works.js';
import { rightsFor } from './rights.js';
import { placeShelf } from './shelf.js';
import type { ContentsEntry, Edition, ImportedWork, Work, WorkSource } from './types.js';

/**
 * The works as catalog schema 3 carries them (packages/catalog's
 * works/types.ts). It takes the registry, plus the importers' output for
 * the works that have units of their own.
 *
 * - Every source carries the rights decided here, so the phone never
 *   re-derives a licence.
 * - A local-only source (the Igros app) is left out: it may not leave this
 *   machine, not even as a name.
 * - So is the link to a gated collection. A work with nothing left to show
 *   is dropped.
 * - An imported edition points at its work's source by index and keeps
 *   its text object's sha256, which is how the phone finds the text in a
 *   downloaded pack.
 * - With the HebrewBooks shelf, a work whose scans it holds gains a
 *   HebrewBooks source (scans, link-only), and the shelf rides along whole.
 */

function catalogSource(source: WorkSource): CatalogWorkSource {
  const out: CatalogWorkSource = { source: source.source, sourceId: source.sourceId, kind: source.kind, licence: source.licence, rights: rightsFor(source) };
  if (source.language) out.language = source.language;
  if (source.credit) out.credit = source.credit;
  if (source.version) out.version = source.version;
  return out;
}

/** Whether a Sefaria ref belongs to a title: the title itself, or it followed by a section or a node. */
function refOfTitle(ref: string, title: string): boolean {
  return ref === title || ref.startsWith(`${title}, `) || ref.startsWith(`${title} `);
}

/** The index of an edition's source among the work's (kept) sources. */
function sourceIndex(sources: readonly WorkSource[], edition: Edition): number {
  let best = -1;
  for (const [index, source] of sources.entries()) {
    if (source.source !== edition.source || source.language !== edition.language || source.version !== edition.version) continue;
    if (source.source === 'sefaria' && !refOfTitle(edition.sourceId, source.sourceId)) continue;
    if (best < 0 || source.sourceId.length > sources[best]!.sourceId.length) best = index;
  }
  return best;
}

function contentsOf(entries: readonly ContentsEntry[]): CatalogContentsEntry[] {
  return entries.map((entry) => ('unitId' in entry ? { unitId: entry.unitId } : { title: { he: entry.title.he, en: entry.title.en }, entries: contentsOf(entry.entries) }));
}

function workContents(work: Work, kept: readonly WorkSource[], imported: ImportedWork): CatalogWorkContents {
  const units: CatalogUnit[] = imported.units.map((unit) => {
    const refs = new Set(unit.editions.map((e) => e.sourceId));
    const editions: CatalogEdition[] = unit.editions.map((edition) => {
      const source = sourceIndex(kept, edition);
      if (source < 0) throw new Error(`${work.id}/${unit.id}: no source in the registry for ${edition.source} ${edition.language ?? ''} "${edition.version ?? ''}" (${edition.sourceId})`);
      const out: CatalogEdition = { source };
      if (edition.text) {
        out.sha256 = edition.text.sha256;
        out.bytes = edition.text.bytes;
      }
      return out;
    });
    const out: CatalogUnit = { id: unit.id, label: unit.label, editions };
    if (unit.labelEn) out.labelEn = unit.labelEn;
    if (refs.size === 1) out.ref = [...refs][0]!;
    return out;
  });
  return { workId: work.id, contents: contentsOf(imported.contents), units };
}

/** The source a work gains from its scans on the HebrewBooks shelf. */
function hebrewBooksSource(seriesTitle: string): WorkSource {
  return { source: 'hebrewbooks', sourceId: seriesTitle, kind: 'scan', language: 'he', licence: 'site-terms' };
}

/** The catalog's works: the registry's, with the imported ones' contents and units, and the HebrewBooks shelf when given. */
export function buildCatalogWorks(imports: readonly ImportedWork[], hebrewBooks?: HebrewBooksShelf): CatalogWorks {
  const byWork = new Map(imports.map((imported) => [imported.workId, imported]));
  for (const workId of byWork.keys()) if (!WORKS.some((w) => w.id === workId)) throw new Error(`an import names work "${workId}", which the registry does not have`);
  const placed = hebrewBooks ? placeShelf(hebrewBooks, WORKS) : null;
  const works: CatalogWork[] = [];
  const contents: Record<string, CatalogWorkContents> = {};
  for (const work of WORKS) {
    const scans = placed?.byWork.get(work.id);
    const sources = scans ? [...work.sources, hebrewBooksSource(scans[0]!.title)] : work.sources;
    const kept = sources.filter((source) => rightsFor(source) !== 'local-only');
    const collection = work.collection && isShippable(work.collection) ? work.collection : undefined;
    if (kept.length === 0 && !collection) continue;
    const out: CatalogWork = { id: work.id, title: { he: work.title.he, en: work.title.en }, authors: [...work.authors], genre: work.genre, levels: [...work.levels], sources: kept.map(catalogSource) };
    if (collection) out.collection = collection;
    const imported = byWork.get(work.id);
    if (imported) {
      const part = workContents(work, kept, imported);
      contents[work.id] = part;
      out.units = part.units.length;
      out.textBytes = part.units.reduce((sum, unit) => sum + unit.editions.reduce((s, e) => s + (e.bytes ?? 0), 0), 0);
    }
    works.push(out);
  }
  const authors = AUTHORS.map((author) => ({ id: author.id, name: { he: author.name.he, en: author.name.en }, ...(author.rebbe ? { rebbe: author.rebbe } : {}) }));
  return placed ? { authors, works, contents, shelf: placed.shelf } : { authors, works, contents };
}
