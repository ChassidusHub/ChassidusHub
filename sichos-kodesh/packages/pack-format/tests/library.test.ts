import { describe, expect, it } from 'vitest';
import type { LibraryCollection, LibraryItemBase } from '@sichos-kodesh/catalog';
import { parseLibraryScopeSpec, resolveLibraryScope, sizeLibrarySelection } from '../src/library.js';
import type { ObjectsIndex } from '../src/objectsIndex.js';

// Invented ids and hashes: nothing here is a real maamar.
const sha = (n: number) => String(n).repeat(64).slice(0, 64);
const MAAMORIM: LibraryCollection<LibraryItemBase> = {
  items: [
    { id: '1', label: 'באתי לגני', hebrewYear: 5711, refs: [{ kind: 'pdf', sourceId: 'DRIVE_MUGAH_1', role: 'mugah' }, { kind: 'audio', sourceId: 'JEM0001.mp3', role: '0', durationMs: 60000 }] },
    { id: '2', label: 'להבין', hebrewYear: 5711, refs: [{ kind: 'pdf', sourceId: 'DRIVE_MUGAH_2', role: 'mugah' }] },
    { id: '3', label: 'ויהי', hebrewYear: 5712, refs: [{ kind: 'pdf', sourceId: 'DRIVE_NOT_YET' }] },
  ],
  groups: {
    year: [
      { slug: '5711', name: 'תשי"א', itemIds: ['1', '2'] },
      { slug: '5712', name: 'תשי"ב', itemIds: ['3'] },
    ],
    moad: [{ slug: '22_shevat%20', name: 'כ"ב שבט', nameEn: '22 Shevat', itemIds: ['2'] }],
  },
};
const INDEX: ObjectsIndex = {
  schema: 1,
  version: '1.0.0',
  builtAt: '2026-09-25T00:00:00Z',
  objects: {
    [sha(1)]: { kind: 'pdf', bytes: 100, sourceId: 'DRIVE_MUGAH_1', collection: 'maamorim', itemId: '1' },
    [sha(2)]: { kind: 'pdf', bytes: 200, sourceId: 'DRIVE_MUGAH_2', collection: 'maamorim', itemId: '2' },
    [sha(3)]: { kind: 'audio', profile: 'src', bytes: 3000, sourceId: 'JEM0001.mp3', collection: 'maamorim', itemId: '1' },
    [sha(4)]: { kind: 'audio', profile: 'opus16', bytes: 700, sourceId: 'JEM0001.mp3', collection: 'maamorim', itemId: '1' },
  },
};

describe('library scopes', () => {
  it('reads a whole collection or one group of an axis, and leaves farbrengen scopes alone', () => {
    expect(parseLibraryScopeSpec('reshimos')).toEqual({ collection: 'reshimos' });
    expect(parseLibraryScopeSpec('maamorim:year:5711')).toEqual({ collection: 'maamorim', axis: 'year', group: '5711' });
    expect(parseLibraryScopeSpec('5736-01')).toBeNull();
    expect(parseLibraryScopeSpec('jemEvents')).toBeNull();
    expect(() => parseLibraryScopeSpec('maamorim:year')).toThrow();
  });

  it('resolves a group to its items, a label and a file-safe slug', () => {
    const year = resolveLibraryScope({ collection: 'maamorim', axis: 'year', group: '5711' }, MAAMORIM);
    expect(year.items.map((i) => i.id)).toEqual(['1', '2']);
    expect(year.scope).toEqual({ kind: 'year', collection: 'maamorim', hebrewYear: 5711, label: { he: 'מאמרים, תשי"א', en: 'Maamorim, 5711' } });
    expect(year.slug).toBe('maamorim-year-5711');
    const moad = resolveLibraryScope({ collection: 'maamorim', axis: 'moad', group: '22_shevat%20' }, MAAMORIM);
    expect(moad.slug).toBe('maamorim-moad-22-shevat');
    expect(moad.scope).toMatchObject({ kind: 'custom', label: { en: 'Maamorim, 22 Shevat' } });
    expect(() => resolveLibraryScope({ collection: 'maamorim', axis: 'volume', group: '1' }, MAAMORIM)).toThrow(/no "volume" axis/);
    expect(() => resolveLibraryScope({ collection: 'maamorim', axis: 'year', group: '5799' }, MAAMORIM)).toThrow(/no year "5799"/);
  });

  it('sizes every PDF and the recordings in the profile asked for, counting what is not archived yet', () => {
    const all = resolveLibraryScope({ collection: 'maamorim' }, MAAMORIM);
    const src = sizeLibrarySelection('maamorim', all.items, INDEX, 'src');
    expect(src.bytes).toBe(100 + 200 + 3000);
    expect(src.missing).toBe(1);
    expect(src.entries.map((e) => e.itemId)).toEqual(['1', '2']);
    expect(src.entries[0]).toMatchObject({ collection: 'maamorim', hebrewYear: 5711, label: 'באתי לגני' });
    expect(src.entries[0]!.refs[1]).toMatchObject({ kind: 'audio', profile: 'src', role: '0', durationMs: 60000, sha256: sha(3) });
    const opus = sizeLibrarySelection('maamorim', all.items, INDEX, 'opus16');
    expect(opus.bytes).toBe(100 + 200 + 700);
    const opus24 = sizeLibrarySelection('maamorim', all.items, INDEX, 'opus24');
    expect(opus24.missing).toBe(2);
  });
});
