import { createHash } from 'node:crypto';
import { mayShip, type ContentsEntry, type Edition, type ImportedWork, type Licence, type Names, type Unit, type Work, type WorkSource } from '@sichos-kodesh/works';
import type { SefariaClient } from './client.js';
import { hasText, renderUnit, sectionLabel } from './render.js';
import { leaves, outline, slug, type Leaf, type OutlineEntry } from './schema.js';

/**
 * One work's Sefaria texts, as units and editions:
 * - every Sefaria title the registry attaches to the work (Tanya; Torah Ohr
 *   and the Sources and References on it) is walked to its leaves;
 * - each leaf is fetched once per version;
 * - a unit is a section of a leaf (a chapter, a siman, a maamar), or the
 *   whole leaf when it has one level (the title page, a prayer);
 * - a unit exists when any version has text for it, and gets one edition
 *   per version that has.
 *
 * The rights gate decides per edition. An edition that may ship keeps its
 * text, rendered with its credit. Any other stays a link to Sefaria, with no
 * text. When Sefaria reports a licence other than the one the registry
 * records, the edition is treated as unknown (link-only) and the import
 * warns: a licence change is a decision, not something to pick up silently.
 */

export interface ImportReport {
  workId: string;
  titles: string[];
  units: number;
  /** Editions whose text was kept: the gate lets them ship. */
  textEditions: number;
  /** Editions kept as links to Sefaria. */
  linkEditions: number;
  textBytes: number;
  warnings: string[];
}

export interface WorkImport {
  work: ImportedWork;
  /** Each kept text by `<unit id>@<edition key>`. */
  texts: Map<string, string>;
  report: ImportReport;
}

/** How an edition's text file is named next to its unit: `he-kehot-publication-society`. */
export function editionKey(edition: Pick<Edition, 'language' | 'version' | 'source'>): string {
  return `${edition.language ?? 'xx'}-${slug(edition.version ?? edition.source) || 'text'}`;
}

/** Sefaria's licence strings, as the registry's licences. Anything else is unknown. */
export function sefariaLicence(license: string | undefined): Licence {
  const normal = (license ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (normal === 'cc0') return 'cc0';
  if (normal === 'public-domain') return 'public-domain';
  if (normal === 'cc-by') return 'cc-by';
  if (normal === 'cc-by-nc') return 'cc-by-nc';
  return 'unknown';
}

interface Version {
  source: WorkSource;
  language: 'he' | 'en';
  version: string;
}

interface LeafText {
  text: unknown;
  license?: string;
}

async function fetchLeaf(client: SefariaClient, leaf: Leaf, version: Version, warn: (line: string) => void): Promise<LeafText | null> {
  const answer = await client.text(leaf.ref, version.language, version.version);
  const found = answer.versions?.[0];
  if (found) return { text: found.text, license: found.license };
  if (!answer.error) return null;
  // Too big, or a ref Sefaria will not serve whole: ask for its sections one by one.
  if (leaf.depth < 2 || !leaf.sectionSizes) {
    warn(`${leaf.ref} (${version.version}): ${answer.error}`);
    return null;
  }
  const sections: unknown[] = [];
  let license: string | undefined;
  for (const [index, size] of leaf.sectionSizes.entries()) {
    if (size === 0) {
      sections.push([]);
      continue;
    }
    const part = await client.text(`${leaf.ref} ${index + 1}`, version.language, version.version);
    const partVersion = part.versions?.[0];
    sections.push(partVersion?.text ?? []);
    license ??= partVersion?.license;
  }
  return { text: sections, license };
}

/** A companion's short name inside its work: "Sources and References on Torah Ohr" → "Sources and References". */
function companionTitle(title: Names, main: Names): Names {
  const strip = (text: string, suffix: string) => (suffix && text.endsWith(suffix) && text.length > suffix.length ? text.slice(0, -suffix.length) : text);
  return { en: strip(title.en, ` on ${main.en}`), he: strip(title.he, ` על ${main.he}`) };
}

interface PendingUnit {
  unit: Unit;
  ref: string;
  leaf: Leaf;
  /** The unit's text per version, when that version has any. */
  texts: Map<Version, unknown>;
}

function unitsOfLeaf(workId: string, leaf: Leaf, fallback: Names, texts: Map<Version, LeafText>): PendingUnit[] {
  const pending: PendingUnit[] = [];
  const baseLabel = { he: leaf.labels.he.join(', ') || fallback.he, en: leaf.labels.en.join(', ') || fallback.en };
  if (leaf.depth < 2) {
    const found = new Map<Version, unknown>();
    for (const [version, leafText] of texts) if (hasText(leafText.text)) found.set(version, leafText.text);
    if (found.size === 0) return [];
    const id = leaf.path.join('/') || 'all';
    return [{ unit: { id, workId, label: baseLabel.he, labelEn: baseLabel.en, editions: [] }, ref: leaf.ref, leaf, texts: found }];
  }
  const count = Math.max(0, ...[...texts.values()].map((t) => (Array.isArray(t.text) ? t.text.length : 1)));
  for (let index = 0; index < count; index += 1) {
    const found = new Map<Version, unknown>();
    for (const [version, leafText] of texts) {
      const section = Array.isArray(leafText.text) ? leafText.text[index] : index === 0 ? leafText.text : undefined;
      if (hasText(section)) found.set(version, section);
    }
    if (found.size === 0) continue;
    const n = index + 1;
    const he = [leaf.labels.he.join(', '), sectionLabel(leaf.heSectionNames[0], n, 'he')].filter(Boolean).join(', ');
    const en = [leaf.labels.en.join(', '), sectionLabel(leaf.sectionNames[0], n, 'en')].filter(Boolean).join(', ');
    pending.push({ unit: { id: [...leaf.path, String(n)].join('/'), workId, label: he, labelEn: en, editions: [] }, ref: `${leaf.ref} ${n}`, leaf, texts: found });
  }
  return pending;
}

function contentsOf(entries: readonly OutlineEntry[], unitsByLeaf: Map<Leaf, PendingUnit[]>): ContentsEntry[] {
  const out: ContentsEntry[] = [];
  for (const entry of entries) {
    if ('leaf' in entry) {
      for (const pending of unitsByLeaf.get(entry.leaf) ?? []) out.push({ unitId: pending.unit.id });
    } else {
      const inner = contentsOf(entry.entries, unitsByLeaf);
      if (inner.length > 0) out.push({ title: entry.title, entries: inner });
    }
  }
  return out;
}

export async function importWork(work: Work, client: SefariaClient, options: { log?: (line: string) => void } = {}): Promise<WorkImport> {
  const warnings: string[] = [];
  const warn = (line: string) => {
    warnings.push(line);
    options.log?.(`warning: ${line}`);
  };
  const byTitle = new Map<string, Version[]>();
  for (const source of work.sources) {
    if (source.source !== 'sefaria') continue;
    if (source.language !== 'he' && source.language !== 'en') {
      warn(`${source.sourceId}: no Sefaria language for "${source.language ?? ''}"`);
      continue;
    }
    if (!source.version) {
      warn(`${source.sourceId}: the registry names no version`);
      continue;
    }
    const versions = byTitle.get(source.sourceId) ?? [];
    versions.push({ source, language: source.language, version: source.version });
    byTitle.set(source.sourceId, versions);
  }

  const contents: ContentsEntry[] = [];
  const pendingUnits: PendingUnit[] = [];
  let main: Names | null = null;
  for (const [title, versions] of byTitle) {
    const index = await client.index(title);
    const names: Names = { en: index.title, he: index.heTitle || index.title };
    const prefix = main ? { title: companionTitle(names, main), key: '' } : undefined;
    if (prefix) prefix.key = slug(prefix.title.en) || slug(title);
    main ??= names;
    const entries = outline(index, prefix);
    const unitsByLeaf = new Map<Leaf, PendingUnit[]>();
    const licences = new Map<Version, string | undefined>();
    for (const leaf of leaves(entries)) {
      const texts = new Map<Version, LeafText>();
      for (const version of versions) {
        const found = await fetchLeaf(client, leaf, version, warn);
        if (!found) continue;
        texts.set(version, found);
        if (found.license !== undefined && !licences.has(version)) licences.set(version, found.license);
      }
      const units = unitsOfLeaf(work.id, leaf, prefix?.title ?? names, texts);
      unitsByLeaf.set(leaf, units);
      pendingUnits.push(...units);
    }
    contents.push(...contentsOf(entries, unitsByLeaf));
    for (const version of versions) {
      if (!licences.has(version)) warn(`${title} (${version.language}, ${version.version}): Sefaria has no text in this version`);
      const reported = licences.get(version);
      if (reported !== undefined && sefariaLicence(reported) !== version.source.licence) {
        warn(`${title} (${version.language}, ${version.version}): Sefaria now reports "${reported}", the registry has "${version.source.licence}" - kept as a link until the registry is updated`);
        version.source = { ...version.source, licence: 'unknown' };
      }
    }
  }

  const seen = new Set<string>();
  const texts = new Map<string, string>();
  const report: ImportReport = { workId: work.id, titles: [...byTitle.keys()], units: 0, textEditions: 0, linkEditions: 0, textBytes: 0, warnings };
  const units: Unit[] = [];
  for (const pending of pendingUnits) {
    if (seen.has(pending.unit.id)) {
      warn(`${pending.ref}: unit id ${pending.unit.id} is taken; skipped`);
      continue;
    }
    seen.add(pending.unit.id);
    for (const [version, text] of pending.texts) {
      const edition: Edition = { source: 'sefaria', sourceId: pending.ref, kind: 'text', licence: version.source.licence, language: version.language, version: version.version };
      if (version.source.credit) edition.credit = version.source.credit;
      if (mayShip(edition)) {
        const html = renderUnit({
          workId: work.id,
          unitId: pending.unit.id,
          heading: version.language === 'he' ? pending.unit.label : (pending.unit.labelEn ?? pending.unit.label),
          language: version.language,
          ref: pending.ref,
          version: version.version,
          licence: edition.licence,
          credit: edition.credit,
          text,
          sectionNames: (version.language === 'he' ? pending.leaf.heSectionNames : pending.leaf.sectionNames).slice(pending.leaf.depth < 2 ? 0 : 1),
        });
        const bytes = Buffer.byteLength(html, 'utf8');
        edition.text = { sha256: createHash('sha256').update(html, 'utf8').digest('hex'), bytes };
        texts.set(`${pending.unit.id}@${editionKey(edition)}`, html);
        report.textEditions += 1;
        report.textBytes += bytes;
      } else {
        report.linkEditions += 1;
      }
      pending.unit.editions.push(edition);
    }
    units.push(pending.unit);
  }
  report.units = units.length;
  return { work: { workId: work.id, source: 'sefaria', contents, units }, texts, report };
}
