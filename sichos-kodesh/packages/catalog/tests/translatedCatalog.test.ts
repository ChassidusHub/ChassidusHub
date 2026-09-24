import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { translateChapterName } from '../src/translate/chapterNameHe.js';
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
