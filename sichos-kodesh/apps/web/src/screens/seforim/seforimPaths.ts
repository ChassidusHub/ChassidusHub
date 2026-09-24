/** Where a unit opens in the reader. Unit ids hold slashes (`part1/1`), so the unit and edition ride in the query. */
export function readerPath(workId: string, unitId: string, source?: number): string {
  const query = new URLSearchParams({ unit: unitId });
  if (source !== undefined) query.set('source', String(source));
  return `/seforim/${encodeURIComponent(workId)}/read?${query.toString()}`;
}

/** A sefer's page, opened on one part of its contents (indexes into the tree, `1.0`). */
export function workPath(workId: string, path: readonly number[] = []): string {
  return `/seforim/${encodeURIComponent(workId)}${path.length > 0 ? `?path=${path.join('.')}` : ''}`;
}
