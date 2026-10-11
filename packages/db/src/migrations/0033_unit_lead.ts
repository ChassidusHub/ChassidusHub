/**
 * Each sicha's lead: the few words a search ranks it on (`unit_place.lead`),
 * its name and the start of its words, as searched (niqqud, gershayim and
 * quotes dropped, lower case; the same as normalizedSql in
 * packages/core/src/searchText.ts).
 *
 * A search ranked the sichos it found on all their words. A sicha's words
 * are some 80 KB, so ranking the forty a common word finds read 3 MB the
 * first time, more than a second of a two and a half second search
 * (issue #182). The lead is a few hundred words: the sicha that opens on
 * what was searched, or is named for it, still comes first, and the
 * ranking reads a fraction of that.
 *
 * Its name (`label`) and the first words of its first version, up to
 * LEAD_CHARS characters, cut at a space; never its footnotes. Kept by the
 * trigger of migration 0030 like the rest of the row, so it follows every
 * change to the sicha. Migration 0034 fills it for the units already
 * there, in a transaction of its own: adding the column locks unit_place
 * against reads, and only until this one commits.
 */
const LEAD_CHARS = 1500;

const normal = (expr: string) =>
  `btrim(regexp_replace(lower(regexp_replace(coalesce(${expr}, ''), '[֑-ׇ׳״"''\`‘’“”]', '', 'g')), '[^0-9a-zÀ-ɏא-תװ-ײ]+', ' ', 'g'))`;

/** The first words of a version's segments, as one string, from the revision `r`. */
const opening = `(SELECT string_agg(t #>> '{}', ' ') FROM (SELECT t FROM jsonb_path_query(r.data, 'lax $.body.versions[0].segments[0 to 19].** ? (@.type() == "object").text ? (@.type() == "string")') t LIMIT 40) s)`;

const words = `coalesce(r.data->'label'->>'he', '') || ' ' || coalesce(r.data->'label'->>'en', '') || ' ' || coalesce(${opening}, '')`;

/**
 * The lead of the revision `r`, as a tsvector: cut to LEAD_CHARS before it
 * is normalized (a paragraph can be long, and the regular expressions read
 * all of it), and the last word dropped when it was cut through.
 */
export const lead = `to_tsvector('simple'::regconfig, (SELECT CASE WHEN length(a) <= ${LEAD_CHARS} THEN ${normal('a')} ELSE regexp_replace(${normal('a')}, '\\S*$', '') END FROM (SELECT left(${words}, ${LEAD_CHARS + 1}) AS a OFFSET 0) cut))`;

export const up = /* sql */ `
ALTER TABLE unit_place ADD COLUMN lead TSVECTOR;

CREATE OR REPLACE FUNCTION auth.unit_place_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.unit_place p USING changed c WHERE p.unit_id = c.id;
  INSERT INTO public.unit_place (unit_id, work_id, ord, part, position, label, path, lead)
  SELECT c.id, r.data->>'work', coalesce(r.data->>'order', ''), r.data->'position'->0->>'value', r.data->'position', r.data->'label', c.path, ${lead}
  FROM changed c JOIN public.revision r ON r.id = c.main_rev
  WHERE c.type = 'unit' AND NOT c.deleted AND jsonb_typeof(r.data->'work') = 'string';
  RETURN NULL;
END $$;
`;
