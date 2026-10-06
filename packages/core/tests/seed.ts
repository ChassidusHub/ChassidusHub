import type { Db } from '@chassidushub/db';
import { Catalog } from '@chassidushub/core';

export const catalog = (db: Db) => new Catalog(db, { now: () => new Date('2026-09-28T12:00:00Z') });

/**
 * Builds the starting catalog of the tests on an empty database (helpers.ts):
 * a steward, a keeper, two contributors and a bot, and one moderated set kept
 * by the keeper.
 */
export async function seedCatalog(db: Db) {
  const c = catalog(db);
  await c.init();
  await c.createAccount({ id: 'steward', displayName: 'Steward' });
  await c.db.query("UPDATE account SET is_steward = TRUE WHERE id = 'steward'");
  await c.createAccount({ id: 'keeper', displayName: 'Set keeper' });
  await c.createAccount({ id: 'mendy', displayName: 'Mendy' });
  await c.createAccount({ id: 'chaim', displayName: 'Chaim' });
  await c.createAccount({ id: 'bot:mafteiach', displayName: 'mafteiach importer', isBot: true });

  const setup = await c.createChangeset('steward', { title: 'Set up Farbrengens' });
  const set = await c.putRevision(setup.id, 'steward', {
    type: 'set',
    data: { name: { he: 'התוועדויות', en: 'Farbrengens' }, slug: 'farbrengens', policy: 'moderated', keepers: ['keeper'] },
    path: '/farbrengens',
  });
  await c.submit(setup.id, 'steward');
  await c.merge(setup.id, 'steward');
  return { db, catalog: c, set };
}
