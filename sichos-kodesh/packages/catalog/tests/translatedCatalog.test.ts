import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { OccasionGroup } from '../src/library/types.js';
import { translateChapterName } from '../src/translate/chapterNameHe.js';
import { GROUP_NAMES_EN, groupNameEn } from '../src/translate/groupNameEn.js';
import { translateOccasionLabel } from '../src/translate/occasionLabelEn.js';
import type { CatalogEntry } from '../src/types.js';

/**
 * The year files the apps bundle (apps/web/src/catalog/data - the phone's
 * copy is identical, which bin/release.ts checks) against the translators:
 * the data must be what the current rules produce, so a change to the
 * rules is shipped by rebuilding the catalog, never left half-applied.
 */
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'web', 'src', 'catalog', 'data');

function bundledEntries(): CatalogEntry[] {
  return readdirSync(dataDir)
    .filter((file) => /^\d+\.json$/.test(file))
    .flatMap((file) => JSON.parse(readFileSync(path.join(dataDir, file), 'utf8')) as CatalogEntry[]);
}

describe('the bundled catalog carries the current translations', () => {
  const entries = bundledEntries();

  it('has every occasion label translated exactly as translateOccasionLabel does it', () => {
    const stale = entries.filter((entry) => entry.occasionLabelEn !== (translateOccasionLabel(entry.occasionLabel) ?? undefined));
    expect(stale.map((entry) => entry.occasionLabel)).toEqual([]);
  });

  it('has every chapter name translated exactly as translateChapterName does it', () => {
    const stale = entries.flatMap((entry) => entry.audio).filter((audio) => audio.chapterNameHe !== ((audio.chapterName && translateChapterName(audio.chapterName)) || undefined));
    expect(stale.map((audio) => audio.chapterName)).toEqual([]);
  });

  it('translates nearly every occasion and chapter the apps show', () => {
    const labels = new Set(entries.map((entry) => entry.occasionLabel));
    const translatedLabels = new Set(entries.filter((entry) => entry.occasionLabelEn).map((entry) => entry.occasionLabel));
    const chapters = new Set(entries.flatMap((entry) => entry.audio.flatMap((audio) => (audio.chapterName ? [audio.chapterName] : []))));
    const translatedChapters = new Set(entries.flatMap((entry) => entry.audio.flatMap((audio) => (audio.chapterNameHe ? [audio.chapterName] : []))));
    expect(translatedLabels.size / labels.size).toBeGreaterThan(0.98);
    expect(translatedChapters.size / chapters.size).toBeGreaterThan(0.99);
  });
});

describe("the phone's bundled moadim and parshiyos carry their English names", () => {
  const metaFile = path.join(dataDir, '..', '..', '..', '..', 'mobile', 'src', 'catalog', 'data', 'library', 'meta.json');
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as { moadim: OccasionGroup[]; parshiyos: OccasionGroup[] };
  const groups = [...meta.moadim, ...meta.parshiyos];

  it('names every group exactly as groupNameEn does', () => {
    const stale = groups.filter((group) => group.nameEn !== (groupNameEn(group) ?? undefined));
    expect(stale.map((group) => group.slug)).toEqual([]);
  });

  it('names all 154, and the table only holds slugs mafteiach uses', () => {
    expect(groups.every((group) => group.nameEn)).toBe(true);
    const slugs = new Set(groups.map((group) => group.slug));
    expect(Object.keys(GROUP_NAMES_EN).filter((slug) => !slugs.has(slug))).toEqual([]);
  });

  it('capitalises a name the occasion rules start in lower case', () => {
    expect(groupNameEn({ slug: 'camps', name: 'מחנות קיץ' })).toBe('The summer camps');
    expect(groupNameEn({ slug: 'shavuos', name: 'חג השבועות' })).toBe('Shavuos');
    expect(groupNameEn({ slug: 'unknown', name: 'שם שאין לו כלל' })).toBeNull();
  });
});
