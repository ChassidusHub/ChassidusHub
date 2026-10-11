import { lead } from './0033_unit_lead.js';

/**
 * Fills each unit's lead (migration 0033) for the units already there.
 * Only unit_place is written, never entity, and nothing locks it against
 * reads: sicha pages and the search go on reading it while it fills.
 */
export const up = /* sql */ `
UPDATE unit_place p SET lead = ${lead}
FROM entity e JOIN revision r ON r.id = e.main_rev
WHERE e.id = p.unit_id COLLATE "default";
`;
