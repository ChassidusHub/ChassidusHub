/**
 * Your changes, not sent yet (the redesign's tray, docs/plans/redesign.md):
 * every block a person changes on a page in Edit adds an operation to their
 * draft for that page, and the draft is sent as one Suggestion. Kept here so
 * a draft started on a phone is there on the computer.
 *
 * One row per person and page (`place`, the page's permanent id). `ops` is
 * the list as the site sends it, small, and never read by the database.
 * Kept with the person in `auth`, as reading places are (migration 0014),
 * because a rebuild of the catalog replaces `public` whole.
 */
export const up = `
CREATE TABLE auth.draft (
  account_id TEXT NOT NULL,
  place TEXT NOT NULL CHECK (length(place) BETWEEN 1 AND 100),
  title TEXT,
  ops JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, place)
);
CREATE INDEX draft_recent ON auth.draft (account_id, updated_at DESC);
`;
