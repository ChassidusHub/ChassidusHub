/**
 * Where each sicha, letter or chapter sits in its sefer, kept beside the
 * item so a page finds its neighbours without unpacking anyone's words.
 *
 *   unit_place   one row per unit on main: its sefer (`work_id`), its
 *                place in the sefer's order (`ord`), its volume (`part`,
 *                the first level of its position), the whole position
 *                with its labels, its label and its path.
 *
 * A sicha's page lists the sichos beside it, the volumes of its sefer and
 * the units before and after it. Each of those read every unit of the
 * sefer and its latest version whole, words and all, to learn its order
 * and its place: for Likkutei Sichos that unpacked thousands of sichos,
 * five to seventeen seconds the first time a sicha was opened. This row
 * holds just those few facts, in the sefer's order (`unit_place_order`).
 *
 * Kept by the database itself: whenever main moves (Catalog.updateMain
 * points `entity.main_rev` at a new version), a trigger writes the rows of
 * the units changed, so nothing that writes the catalog can leave it
 * behind. Its function lives in `auth`, like auth.catalog_write_check
 * (migration 0028), because an import replaces the tables in `public`
 * whole and leaves `auth` alone.
 */
export const up = /* sql */ `
CREATE TABLE unit_place (
  unit_id TEXT COLLATE "C" PRIMARY KEY,
  work_id TEXT NOT NULL,
  ord TEXT COLLATE "C" NOT NULL,
  part TEXT,
  position JSONB,
  label JSONB,
  path TEXT
);
CREATE INDEX unit_place_order ON unit_place (work_id, ord, unit_id);

CREATE FUNCTION auth.unit_place_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.unit_place p USING changed c WHERE p.unit_id = c.id;
  INSERT INTO public.unit_place (unit_id, work_id, ord, part, position, label, path)
  SELECT c.id, r.data->>'work', coalesce(r.data->>'order', ''), r.data->'position'->0->>'value', r.data->'position', r.data->'label', c.path
  FROM changed c JOIN public.revision r ON r.id = c.main_rev
  WHERE c.type = 'unit' AND NOT c.deleted AND jsonb_typeof(r.data->'work') = 'string';
  RETURN NULL;
END $$;
CREATE TRIGGER unit_place_refresh AFTER UPDATE ON entity REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT EXECUTE FUNCTION auth.unit_place_refresh();

INSERT INTO unit_place (unit_id, work_id, ord, part, position, label, path)
SELECT e.id, r.data->>'work', coalesce(r.data->>'order', ''), r.data->'position'->0->>'value', r.data->'position', r.data->'label', e.path
FROM entity e JOIN revision r ON r.id = e.main_rev
WHERE e.type = 'unit' AND NOT e.deleted AND jsonb_typeof(r.data->'work') = 'string';
`;
