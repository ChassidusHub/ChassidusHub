import { readFileSync } from 'node:fs';

/**
 * The source's topic list (`tags.json`: `[{id, tags, origin}]`), in its id
 * order. The source links no tag to any letter - it is a list of search
 * suggestions, and that is all it can be here.
 */
export function readTags(path: string): string[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is { id: number; tags: string } => typeof entry?.tags === 'string' && Number.isFinite(entry?.id))
    .sort((a, b) => a.id - b.id)
    .map((entry) => entry.tags.trim())
    .filter(Boolean);
}
