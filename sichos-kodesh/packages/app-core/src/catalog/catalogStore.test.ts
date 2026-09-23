import { describe, expect, it, vi } from 'vitest';
import type { CatalogRelease } from '@sichos-kodesh/catalog';
import { createCatalogStore } from './catalogStore.js';

const entry = { occasionId: 1, hebrewYear: 5711, hebrewDate: '5711-01-09', occasionLabel: 'x', audio: [], pdfs: [] };
const bundled = { 5711: [entry] };

function release(version: string, schemaVersion = 1): CatalogRelease {
  return { schemaVersion, version, releasedAt: '2026-10-01T00:00:00Z', byYear: { 5711: [entry], 5712: [{ ...entry, hebrewYear: 5712, occasionId: 2 }] } };
}

describe('createCatalogStore', () => {
  it('starts with the bundled catalog', () => {
    const store = createCatalogStore(bundled, '1.0.0', 1);
    expect(store.get()).toEqual({ catalog: bundled, version: '1.0.0', releasedAt: null, source: 'bundled' });
  });

  it('applies a newer release of the same schema and tells subscribers', () => {
    const store = createCatalogStore(bundled, '1.0.0', 1);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.apply(release('1.0.1'), 'fetched')).toBe(true);
    expect(store.getCatalog()[5712]).toHaveLength(1);
    expect(store.get()).toMatchObject({ version: '1.0.1', source: 'fetched' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores an older or equal release, and one of another schema', () => {
    const store = createCatalogStore(bundled, '1.0.0', 1);
    expect(store.apply(release('1.0.0'), 'stored')).toBe(false);
    expect(store.apply(release('0.9.0'), 'stored')).toBe(false);
    expect(store.apply(release('2.0.0', 2), 'stored')).toBe(false);
    expect(store.get().source).toBe('bundled');
  });

  it('stops notifying after unsubscribe', () => {
    const store = createCatalogStore(bundled, '1.0.0', 1);
    const listener = vi.fn();
    store.subscribe(listener)();
    store.apply(release('1.0.1'), 'fetched');
    expect(listener).not.toHaveBeenCalled();
  });
});
