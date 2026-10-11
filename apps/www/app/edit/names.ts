/**
 * The field that holds a page's name, as the API's rename changes it
 * (packages/core/src/organize.ts): a shelf's `name`, a sefer's `title`, a
 * sicha's `label`, whichever the item has first.
 */
const NAME_FIELDS = ['name', 'title', 'label'] as const;

/** The name of an item's data, by language, from the same field a rename changes. */
export function nameField(data: unknown): Record<string, unknown> {
  const fields = (data ?? {}) as Record<string, unknown>;
  for (const field of NAME_FIELDS) {
    const value = fields[field];
    if (value && typeof value === 'object') return value as Record<string, unknown>;
  }
  // A name kept as plain text is its Hebrew name.
  for (const field of NAME_FIELDS) if (typeof fields[field] === 'string') return { he: fields[field] };
  return {};
}

/** A page's own names, Hebrew and English, as Edit shows them. */
export function namesOf(data: unknown): { he: string; en: string } {
  const names = nameField(data);
  return { he: typeof names.he === 'string' ? names.he : '', en: typeof names.en === 'string' ? names.en : '' };
}
