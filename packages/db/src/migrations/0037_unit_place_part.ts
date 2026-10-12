/**
 * The units of a sefer by volume, from the index alone (`unit_place_part`).
 *
 * A sicha's page lists its sefer's volumes, each with how many units it
 * holds, and the units of its own volume (pathBar.ts, `parts`). Both read the
 * volume from each row's position, so both read every row of unit_place:
 * since each row carries its sicha's lead (migration 0033), a few KB, that is
 * the whole table. Locally 3,642 buffers for one Likkutei Sichos page; on
 * live the first sicha opened in a volume took 2.2 s for this one statement.
 *
 * With the volume (`part`) in an index beside the sefer and the order, the
 * volumes are counted from the index and a volume's units are found by it:
 * 135 buffers for the same page. The read itself changes in its own PR,
 * after this one.
 *
 * Building it holds unit_place against writes, not reads, for the moment it
 * takes; lock_timeout makes it give up, rather than keep an Approve waiting
 * behind a long read, and the next deploy tries again.
 */
export const up = /* sql */ `
SET LOCAL lock_timeout = '3s';
CREATE INDEX unit_place_part ON unit_place (work_id, part, ord, unit_id);
`;
