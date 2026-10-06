import { describe, expect, it } from 'vitest';
import { teshurosSetId, TESHUROS_SET } from '@chassidushub/core';
import { chassidushubSetsImporter, runImport } from '@chassidushub/importers';
import { freshCatalog } from '../../core/tests/helpers.js';

describe('the sets ChassidusHub keeps itself', () => {
  it('makes the Teshuros set at /teshuros, with the id uploads look for, once', async () => {
    const { catalog } = await freshCatalog();
    const first = await runImport(catalog, chassidushubSetsImporter(), { approveAs: 'steward' });
    expect(first.created).toBe(1);
    const set = await catalog.get(await teshurosSetId());
    expect(set).toMatchObject({ type: 'set', path: TESHUROS_SET.path, data: { slug: 'teshuros', policy: 'moderated', name: { he: 'תשורות' } } });
    expect((await runImport(catalog, chassidushubSetsImporter(), { approveAs: 'steward' })).unchanged).toBe(1);
  });
});
