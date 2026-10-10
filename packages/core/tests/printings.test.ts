import { beforeEach, describe, expect, it } from 'vitest';
import { applyOrganize, planPrintingMerges, volumeKey, type Catalog } from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog } from './helpers.js';

/**
 * One record per volume (printings.ts): the same volume of a sefer from
 * HebrewBooks and from אוצרות הרבי's Drive becomes one printing, with both
 * sources on it.
 */

describe('volumeKey', () => {
  it('reads a volume however it was written', () => {
    expect(volumeKey('א (בראשית - שמות - ויקרא)')).toBe('1');
    expect(volumeKey('1')).toBe('1');
    expect(volumeKey('ל')).toBe('30');
    expect(volumeKey('תשמ״ז - חלק א')).toBe('747/1');
    expect(volumeKey("תשמ''ז א")).toBe('747/1');
    expect(volumeKey("תשמ''ז ב")).toBe('747/2');
    expect(volumeKey('ח״ב')).toBe('part/2');
  });
  it('leaves alone what is no number', () => {
    expect(volumeKey('בראשית')).toBeNull();
    expect(volumeKey('תורה אור')).toBeNull();
    expect(volumeKey(undefined)).toBeNull();
    expect(volumeKey('א מהדורה חדשה')).toBeNull();
  });
});

describe('merging printings', () => {
  let catalog: Catalog;
  let work: EntityId;
  const printing = (volume: string, source: Record<string, string>) => ({ kind: 'book-volume', title: { he: `ספר השיחות ${volume}` }, work, volume, sources: [source] });

  beforeEach(async () => {
    const fresh = await freshCatalog();
    catalog = fresh.catalog;
    work = await add(catalog, 'mendy', 'steward', 'work', { title: { he: 'ספר השיחות' }, slug: 'sefer-hasichos', authors: [], genre: 'sichos', levels: ['year'], sets: [fresh.set] }, '/sefer-hasichos');
  });

  it('joins the same volume from two places into one, and leaves the other part alone', async () => {
    const hebrewbooks = await add(catalog, 'mendy', 'steward', 'publication', printing('תשמ״ז - חלק א', { source: 'hebrewbooks', url: 'https://hebrewbooks.org/15973' }), '/hebrewbooks/15973');
    const drive = await add(catalog, 'mendy', 'steward', 'publication', printing("תשמ''ז א", { source: 'other', note: 'אוצרות הרבי', url: 'https://drive.google.com/file/d/a/view' }));
    const second = await add(catalog, 'mendy', 'steward', 'publication', printing("תשמ''ז ב", { source: 'other', note: 'אוצרות הרבי', url: 'https://drive.google.com/file/d/b/view' }));

    const plans = await planPrintingMerges(catalog);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.operations).toEqual([{ op: 'merge', from: drive, into: hebrewbooks }]);

    const { suggestion } = await applyOrganize(catalog, 'mendy', plans[0]!);
    await catalog.merge(suggestion.id, 'steward');
    const kept = (await catalog.get(hebrewbooks))!.data as Record<string, any>;
    expect(kept.sources.map((s: { url: string }) => s.url)).toEqual(['https://hebrewbooks.org/15973', 'https://drive.google.com/file/d/a/view']);
    expect(await catalog.get(drive)).toBeNull();
    expect(await catalog.get(second)).not.toBeNull();
    expect(await planPrintingMerges(catalog)).toEqual([]);
  });
});
