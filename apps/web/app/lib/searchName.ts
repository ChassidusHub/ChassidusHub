import { normalizeSearchText } from '@chassidushub/hebrew';
import type { Entity } from './api.js';

/**
 * A language asked for in the words ("Tanya in English", "תניא באנגלית"),
 * taken off either end so the sefer's own name is left; the same phrases
 * as the API's (packages/core/src/language.ts), longest first.
 */
const LANGUAGE_PHRASES = ['in english', 'in hebrew', 'in yiddish', 'in russian', 'in french', 'in spanish', 'באנגלית', 'בעברית', 'באידיש', 'ברוסית', 'בצרפתית', 'בספרדית'];

/** The words without a language asked for at their start or end, or null when they ask for none (or are nothing else). */
export function withoutLanguage(words: string): string | null {
  const said = normalizeSearchText(words);
  for (const phrase of LANGUAGE_PHRASES) {
    if (said.endsWith(` ${phrase}`)) return said.slice(0, -phrase.length - 1).trim() || null;
    if (said.startsWith(`${phrase} `)) return said.slice(phrase.length + 1).trim() || null;
  }
  return null;
}

/** Every name an item has, in every language: a sefer's title, a set's name, a unit's label. */
function namesOf(item: Entity): string[] {
  const data = item.data as { title?: unknown; name?: unknown; label?: unknown };
  const names: string[] = [];
  for (const value of [data.title, data.name, data.label]) {
    if (typeof value === 'string') names.push(value);
    else if (value && typeof value === 'object') for (const v of Object.values(value)) if (typeof v === 'string') names.push(v);
  }
  return names;
}

/**
 * The sefarim and sets whose whole name, in any language, is the words, in
 * the order found (#233); when none is, those named the words without the
 * language they ask for ("Tanya in English": Tanya). Someone who types a
 * sefer's name wants the sefer, not the footnotes and farbrengens that
 * mention it. "Sichos in English" is a sefer's whole name, so it never
 * falls back to every sefer named "Sichos".
 */
export function namedSo(items: Entity[], words: string): Entity[] {
  const whole = namedExactly(items, normalizeSearchText(words));
  if (whole.length) return whole;
  const bare = withoutLanguage(words);
  return bare ? namedExactly(items, bare) : [];
}

function namedExactly(items: Entity[], name: string): Entity[] {
  if (!name) return [];
  const seen = new Set<string>();
  return items.filter((item) => {
    if ((item.type !== 'work' && item.type !== 'set') || seen.has(item.id)) return false;
    if (!namesOf(item).some((n) => normalizeSearchText(n) === name)) return false;
    seen.add(item.id);
    return true;
  });
}
