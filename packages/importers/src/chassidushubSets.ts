import { TESHUROS_SET } from '@chassidushub/core';
import type { Importer } from './importer.js';

/**
 * The sets ChassidusHub keeps itself, not read from any source: today the
 * Teshuros set (the plan, sections 1 and 8), where teshuros people add
 * are gathered. Its scans are served with credit to the families, who can
 * ask for one to be taken down (docs/rights.md). Made like any import, so
 * a rebuilt catalog has it too, with the same id.
 */
export function chassidushubSetsImporter(): Importer {
  return {
    id: 'chassidushub-sets',
    bot: { id: 'bot:chassidushub-sets', displayName: 'ChassidusHub sets' },
    *records() {
      yield {
        key: TESHUROS_SET.key,
        type: 'set',
        path: TESHUROS_SET.path,
        data: { name: TESHUROS_SET.name, slug: 'teshuros', description: TESHUROS_SET.description, policy: 'moderated', keepers: [] },
      };
    },
  };
}
