/**
 * A unit's id in unit_place in the same collation as entity's (#214).
 *
 * unit_place.unit_id was made `COLLATE "C"` (migration 0030), entity.id is
 * the database's default. Postgres can only use one column's index to join
 * the two when both sides agree, so every join had to say which side's
 * collation it meant (`e.id = p.unit_id COLLATE "default"`), and one that
 * forgot read every row of entity (the speed audit's pitfall). With both in
 * the default collation, a plain `e.id = p.unit_id` uses either key.
 *
 * Only the indexes that hold unit_id are rebuilt (its key and
 * unit_place_order); the table itself is not rewritten. That holds unit_place
 * against reads for the moment it takes: about 0.2 s for 69,000 rows locally,
 * analyze included.
 * lock_timeout makes it give up, rather than keep readers waiting behind it,
 * if a long read holds the table when it starts; the next deploy tries again.
 *
 * Changing a column's type forgets what the planner knew of its values, and
 * without that it joined unit_place to entity by reading all of entity
 * (locally 6,700 buffers instead of 1,270 for a sefer's sichos), so the
 * column is analyzed again at once rather than when autovacuum gets to it.
 * Only that column: the lock is held until this commits, and the whole table
 * (its leads' tsvectors) took 0.66 s to analyze; the column takes 0.04 s.
 */
export const up = /* sql */ `
SET LOCAL lock_timeout = '3s';
ALTER TABLE unit_place ALTER COLUMN unit_id TYPE TEXT COLLATE "default";
ANALYZE unit_place (unit_id);
`;
