import type { EntityId, EntityType } from '@chassidushub/model';
import type { Catalog } from './catalog.js';
import type { Json } from './merge.js';

/**
 * The new site's path bar (apps/www): the whole path of an item at the
 * top of its page, every level a menu of the other choices at that level.
 * A sicha in Likkutei Sichos is the Rebbe, his shelf of sichos, the
 * sefer, the volume and the sicha, and each of those opens to the other
 * Rebbeim, the other shelves, the other sefarim on the shelf, the other
 * volumes and the other sichos of the volume. Worked out for a page in
 * three statements however deep the path is: the sefer's shelves up to
 * the top of the tree with every level's choices, then the sefer's parts
 * and the units beside this one.
 */

/** One level of an item's path. */
export interface PathLevel {
  /** A set (a Rebbe, a shelf), a sefer, one of a sefer's parts (a volume, a parsha), or a unit (a sicha, a letter). */
  kind: 'set' | 'work' | 'part' | 'unit';
  /** What a work calls this level (`volume`, `sicha`), for a work's parts and units. */
  level?: string;
  /** The choice this path takes at this level. */
  chosen: PathChoice;
  /** Every choice at this level in the order the catalog keeps, the chosen one among them. */
  choices: PathChoice[];
}

export interface PathChoice {
  /** The item; a work's part has none (it is the units that share it). */
  id?: EntityId;
  /** The item's page, or for a part, the work's path and the part's place (`/likkutei-sichos/1`). */
  path: string | null;
  name: Json | null;
  /** A part's place in its work (`1`). */
  value?: string;
  /** How many units a part holds. */
  units?: number;
}

/** How many choices one level lists at most: a part of Igros Kodesh holds hundreds of letters. */
export const PATH_CHOICES_MAX = 500;

interface SetRow {
  depth: number;
  id: EntityId;
  path: string | null;
  name: Json | null;
  chosen: boolean;
  kind: 'set' | 'work';
}

/**
 * The path bar of an item: a set's shelves above it, a work's shelves,
 * a unit's work, parts and the unit itself. The shelves a work is on are
 * its first set that has a parent (a shelf inside a Rebbe's), else its
 * first set; other kinds of item have no path bar (null).
 */
export async function pathBar(catalog: Catalog, item: { id: EntityId; type: EntityType; path: string | null; data: Json }): Promise<PathLevel[] | null> {
  const data = item.data as Record<string, unknown>;
  if (item.type === 'set') return shelves(catalog, { set: item.id });
  if (item.type === 'work') return shelves(catalog, { work: item.id });
  if (item.type !== 'unit' || typeof data.work !== 'string') return null;
  const work = data.work as EntityId;
  const position = (Array.isArray(data.position) ? data.position : []) as Array<{ level?: string; value?: string }>;
  const [above, within] = await Promise.all([shelves(catalog, { work }), parts(catalog, work, item.id, position)]);
  return [...above, ...within];
}

/** The shelves from the top of the tree down to a set, or to a work and the work itself: one statement. */
async function shelves(catalog: Catalog, from: { set: EntityId } | { work: EntityId }): Promise<PathLevel[]> {
  const params: unknown[] = [];
  // The set the path goes through: given, or the work's first set inside another, else its first.
  const start =
    'set' in from
      ? `SELECT e.id, r.data FROM entity e JOIN revision r ON r.id = e.main_rev WHERE e.id = $${params.push(from.set)} AND e.type = 'set' AND NOT e.deleted`
      : `SELECT s.id, sr.data FROM entity w JOIN revision wr ON wr.id = w.main_rev
           CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(wr.data->'sets', '[]')) WITH ORDINALITY AS ws(id, n)
           JOIN entity s ON s.id = ws.id AND NOT s.deleted JOIN revision sr ON sr.id = s.main_rev
         WHERE w.id = $${params.push(from.work)} AND NOT w.deleted
         ORDER BY (sr.data ? 'parent') DESC, ws.n LIMIT 1`;
  const workId = 'work' in from ? from.work : null;
  const works =
    workId === null
      ? ''
      : `UNION ALL
         (SELECT -1, w.id, w.path, wr.data->'title', w.id = $${params.push(workId)}, 'work', coalesce(wr.data->>'order', ''), w.path
          FROM shelf s JOIN entity_ref x ON x.to_id = s.id AND x.field = 'sets' JOIN entity w ON w.id = x.from_id AND w.type = 'work' AND NOT w.deleted
          JOIN revision wr ON wr.id = w.main_rev
          WHERE NOT coalesce(wr.data->'addition' ? 'to', FALSE) OR w.id = $${params.length}
          ORDER BY coalesce(wr.data->>'order', '') COLLATE "C", w.path LIMIT ${PATH_CHOICES_MAX})`;
  const { rows } = await catalog.db.query<SetRow & { ord: string }>(
    `WITH RECURSIVE start AS (${start}),
     chain AS (SELECT id, data, 0 AS depth FROM start
               UNION ALL
               SELECT p.id, pr.data, c.depth + 1 FROM chain c JOIN entity p ON p.id = c.data->>'parent' AND NOT p.deleted
               JOIN revision pr ON pr.id = p.main_rev WHERE c.depth < 8),
     shelf AS (SELECT id FROM chain WHERE depth = 0)
     SELECT * FROM (
       SELECT c.depth, s.id, s.path, sr.data->'name' AS name, s.id = c.id AS chosen, 'set' AS kind, coalesce(sr.data->>'order', '') AS ord, s.path AS p
       FROM chain c JOIN entity s ON s.type = 'set' AND NOT s.deleted AND s.main_rev IS NOT NULL JOIN revision sr ON sr.id = s.main_rev
       WHERE sr.data->>'parent' IS NOT DISTINCT FROM c.data->>'parent'
       ${works}
     ) x ORDER BY depth DESC, ord COLLATE "C", p`,
    params,
  );
  const levels: PathLevel[] = [];
  for (const depth of [...new Set(rows.map((r) => r.depth))]) {
    const at = rows.filter((r) => r.depth === depth).slice(0, PATH_CHOICES_MAX);
    const choices = at.map((r) => ({ id: r.id, path: r.path, name: r.name }));
    const chosen = at.findIndex((r) => r.chosen);
    if (chosen < 0) continue;
    levels.push({ kind: at[0]!.kind, chosen: choices[chosen]!, choices });
  }
  return levels;
}

/**
 * A unit's levels inside its work: each part it is in (a volume, then a
 * parsha within it) with the other parts beside it there and how many
 * units each holds, then the unit with the units beside it: one statement.
 */
async function parts(catalog: Catalog, work: EntityId, unit: EntityId, position: Array<{ level?: string; value?: string }>): Promise<PathLevel[]> {
  const params: unknown[] = [work];
  const values = position.map((p) => String(p.value ?? ''));
  /** The units that share the first `n` places of this unit's position. */
  const sharing = (n: number) => values.slice(0, n).map((v, i) => `AND r.data->'position'->${i}->>'value' = $${params.push(v)}`).join(' ');
  const from = `FROM entity_ref x JOIN entity e ON e.id = x.from_id AND e.type = 'unit' AND NOT e.deleted JOIN revision r ON r.id = e.main_rev
                WHERE x.to_id = $1 AND x.field = 'work'`;
  const selects = values.slice(0, -1).map(
    (_, i) => `(SELECT ${i} AS depth, NULL AS id, NULL AS path, r.data->'position'->${i}->>'value' AS value,
                  (array_agg(r.data->'position'->${i}->'label' ORDER BY r.data->>'order' COLLATE "C"))[1] AS name,
                  count(*)::int AS units, min(r.data->>'order' COLLATE "C") AS ord
                ${from} ${sharing(i)} GROUP BY 4 ORDER BY 7 LIMIT ${PATH_CHOICES_MAX})`,
  );
  const last = values.length - 1;
  selects.push(
    `(SELECT ${last} AS depth, e.id, e.path, r.data->'position'->${last}->>'value' AS value, r.data->'label' AS name, NULL::int AS units, r.data->>'order' AS ord
      ${from} ${sharing(last)} ORDER BY r.data->>'order' COLLATE "C", e.id LIMIT ${PATH_CHOICES_MAX})`,
  );
  const { rows } = await catalog.db.query<{ depth: number; id: EntityId | null; path: string | null; value: string; name: Json | null; units: number | null }>(
    `SELECT * FROM (${selects.join(' UNION ALL ')}) x ORDER BY depth, ord COLLATE "C", id`,
    params,
  );
  const workPath = rows.find((r) => r.path)?.path?.split('/').slice(0, -values.length).join('/') ?? null;
  return values.map((value, i) => {
    const level = position[i]?.level;
    const at = rows.filter((r) => r.depth === i);
    const choices: PathChoice[] =
      i === last
        ? at.map((r) => ({ id: r.id!, path: r.path, name: r.name, value: r.value }))
        : at.map((r) => ({ path: workPath === null ? null : [workPath, ...values.slice(0, i), r.value].join('/'), name: r.name, value: r.value, units: r.units ?? 0 }));
    const chosen = i === last ? choices.find((c) => c.id === unit) : choices.find((c) => c.value === value);
    return { kind: i === last ? 'unit' : 'part', ...(level ? { level } : {}), chosen: chosen ?? { path: null, name: null, value }, choices };
  });
}
