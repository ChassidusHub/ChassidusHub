/**
 * A suggestion's client key (`changeset.client_key`), so sending the same
 * suggestion twice makes it once (issue #270).
 *
 * A caller that adds many items (suggest_items, 600 and more) may be told
 * the call failed while the server goes on and finishes it; it tries again
 * and the review queue gets the same suggestion twice, each one a person's
 * taps to withdraw. With a key of the caller's own, the second try finds
 * the first suggestion by its author and key and goes on with it instead.
 * The key belongs to its author: two people may use the same one.
 *
 * Adding a column with no default writes nothing; the index is built over
 * the few rows that have a key, none yet. lock_timeout makes the migration
 * give up rather than keep suggestions waiting, and the next deploy tries
 * again. How the key is used changes in its own PR, after this one.
 */
export const up = /* sql */ `
SET LOCAL lock_timeout = '3s';
ALTER TABLE changeset ADD COLUMN client_key TEXT;
CREATE UNIQUE INDEX changeset_client_key ON changeset (author, client_key) WHERE client_key IS NOT NULL;
`;
