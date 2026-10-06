import type { CatalogLibrary, LibraryItemBase } from '@chassidushub-reader/catalog';

const { catalogStore } = require('../catalog/catalogStore') as typeof import('../catalog/catalogStore');
const model = require('@chassidushub-reader/app-core') as typeof import('@chassidushub-reader/app-core');

const library = (): CatalogLibrary => catalogStore.getLibrary()!;

describe('the bundled library', () => {
  it('has every axis the browsers offer, with items behind every group', () => {
    for (const collection of model.LIBRARY_ORDER) {
      for (const axis of model.COLLECTION_AXES[collection]) {
        const groups = model.axisGroups(library(), collection, axis);
        expect(groups.length).toBeGreaterThan(0);
        for (const group of groups) expect(model.groupItems(library(), collection, group).length).toBe(group.itemIds.length);
      }
    }
  });

  it('keeps the disputed "חלק מ" at the end of the volumes, apart from the 39', () => {
    const volumes = model.axisGroups(library(), 'likkuteiSichos', 'volume');
    expect(volumes.at(-1)!.slug).toBe('40');
    expect(model.groupDisplayName('likkuteiSichos', 'volume', volumes.at(-1)!, 'en')).toContain('מילואים');
    expect(model.groupDisplayName('likkuteiSichos', 'volume', volumes[0]!, 'en')).toBe('Volume 1');
    expect(model.groupDisplayName('likkuteiSichos', 'volume', volumes[0]!, 'he')).toBe('חלק א');
  });

  it('names year groups in the interface language', () => {
    const year = model.axisGroups(library(), 'maamorim', 'year')[0]!;
    expect(model.groupDisplayName('maamorim', 'year', year, 'en')).toBe(year.slug);
    expect(model.groupDisplayName('maamorim', 'year', year, 'he')).toMatch(/^ת/);
  });

  it('lists the farbrengens of a moed from the catalog, oldest first', () => {
    const roshHashanah = library().moadim.find((group) => group.slug === 'rosh_hashanah')!;
    const entries = model.occasionGroupEntries(catalogStore.getCatalog(), roshHashanah);
    expect(entries.length).toBeGreaterThan(10);
    for (let i = 1; i < entries.length; i += 1) expect(entries[i]!.hebrewYear).toBeGreaterThanOrEqual(entries[i - 1]!.hebrewYear);
  });
});

describe('items', () => {
  const jemItem = (): LibraryItemBase => library().collections.jemEvents.items.find((item) => item.refs.some((ref) => ref.kind === 'audio'))!;

  it('turns an item\'s recordings into a playlist under an id no occasion has', () => {
    const item = jemItem();
    const audio = model.itemAudio(item);
    expect(audio.length).toBe(item.refs.filter((ref) => ref.kind === 'audio').length);
    const id = model.playlistOccasionId('jemEvents', item);
    expect(id).toBeLessThan(0);
    expect(model.playlistOccasionId('jemEvents', item)).toBe(id);
    expect(model.playlistOccasionId('maamorim', item)).not.toBe(id);
  });

  it('describes an item in one line', () => {
    const maamar = library().collections.maamorim.items.find((item) => item.hebrewDate)!;
    expect(model.itemSubtitle('maamorim', maamar, 'he')).toContain((maamar as unknown as { occasionLabel: string }).occasionLabel);
    const event = jemItem();
    expect(model.itemSubtitle('jemEvents', event, 'en')).toContain((event as unknown as { type: string }).type);
  });

  it('finds the farbrengen a maamar was said at', () => {
    const maamar = library().collections.maamorim.items.find((item) => item.occasionId && model.linkedOccasion(catalogStore.getCatalog(), item));
    expect(maamar).toBeDefined();
    expect(model.linkedOccasion(catalogStore.getCatalog(), maamar!)!.occasionId).toBe(maamar!.occasionId);
  });

  it('formats durations the way the rows show them', () => {
    expect(model.formatDuration(139000)).toBe('2′');
    expect(model.formatDuration(95 * 60000)).toBe('1:35');
  });
});
