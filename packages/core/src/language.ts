import { normalizeSearchText } from '@chassidushub/hebrew';
import type { Language } from '@chassidushub/model';

/**
 * The language a search asks for ("Tanya in English", "תניא באנגלית") and
 * the words left to search (#123). A language is taken out of the words
 * only when other words remain: "English" alone is still a word. Small
 * English words that only make a question ("what is", "the") are left out
 * the same way, so they do not decide the results.
 */

/** The ways each language is said in a search, longest first, and the words its name has in a title ("Sichos In English"). */
const SAID: Array<{ language: Language; phrases: string[]; inTitle: string[] }> = [
  { language: 'en', phrases: ['in english', 'english', 'באנגלית', 'אנגלית', 'בענגליש', 'ענגליש'], inTitle: ['english', 'אנגלית', 'ענגליש'] },
  { language: 'he', phrases: ['in lashon hakodesh', 'in hebrew', 'hebrew', 'בלשון הקודש', 'לשון הקודש', 'בעברית', 'עברית', 'בלשה ק', 'בלה ק'], inTitle: ['hebrew', 'עברית'] },
  { language: 'yi', phrases: ['in yiddish', 'yiddish', 'באידיש', 'אידיש'], inTitle: ['yiddish', 'אידיש'] },
  { language: 'ru', phrases: ['in russian', 'russian', 'ברוסית', 'רוסית'], inTitle: ['russian', 'רוסית'] },
  { language: 'fr', phrases: ['in french', 'french', 'בצרפתית', 'צרפתית'], inTitle: ['french', 'צרפתית'] },
  { language: 'es', phrases: ['in spanish', 'spanish', 'בספרדית', 'ספרדית'], inTitle: ['spanish', 'ספרדית'] },
];

const PHRASES = SAID.flatMap((s) => s.phrases.map((p) => ({ language: s.language, words: p.split(' ') }))).sort((a, b) => b.words.length - a.words.length);

/** Words that only make a question or a phrase in English. */
const FILLER = new Set(['what', 'whats', 'is', 'are', 'was', 'the', 'a', 'an', 'of', 'about', 'does', 'do', 'how', 'who', 'why', 'where', 'to', 'for', 'and', 'on']);

/** The words a language's name has in a title: a sefer called "… in English" is in English. */
export const languageTitleWords = (language: Language): string[] => SAID.find((s) => s.language === language)?.inTitle ?? [];

/**
 * The language the words ask for, if any, and the words left; filler words dropped while others remain.
 * `typed` is the words with only the language taken out, filler and all: a title is compared whole with
 * them, so "Letters from the Rebbe" is still that title's own name.
 */
export function splitLanguage(query: string): { language: Language | null; rest: string; typed: string } {
  let words = normalizeSearchText(query).split(' ').filter(Boolean);
  let language: Language | null = null;
  for (const p of PHRASES) {
    const at = words.findIndex((_, i) => p.words.every((w, j) => words[i + j] === w));
    if (at < 0 || words.length === p.words.length) continue;
    language = p.language;
    words = [...words.slice(0, at), ...words.slice(at + p.words.length)];
    break;
  }
  const typed = language ? words.join(' ') : query.trim();
  const kept = words.filter((w) => !FILLER.has(w));
  const left = kept.length > 0 ? kept : words;
  // Nothing taken out: the words as typed, quotes and all.
  if (!language && left.length === normalizeSearchText(query).split(' ').filter(Boolean).length) return { language, rest: query.trim(), typed };
  return { language, rest: left.join(' '), typed };
}

/**
 * Whether an item is in a language, in SQL, with the language as `language` and its title words as `titleWords`
 * (SQL parameters): a copy, an edition or the item itself says so, or its name says it ("Sichos In English").
 * Hebrew is also whatever says no language at all, since nearly everything is in Hebrew.
 */
export function languageSql(language: string, titleWords: string, name: string): string {
  const said = `(r.data->'sourceCopies' @> jsonb_build_array(jsonb_build_object('language', ${language}))
    OR r.data->'editions' @> jsonb_build_array(jsonb_build_object('language', ${language}))
    OR r.data->>'language' = ${language}
    OR EXISTS (SELECT 1 FROM unnest(${titleWords}::text[]) w WHERE ${name} LIKE '%' || w || '%'))`;
  const silent = `NOT jsonb_path_exists(coalesce(r.data->'sourceCopies', '[]'), '$[*].language')
    AND NOT jsonb_path_exists(coalesce(r.data->'editions', '[]'), '$[*].language') AND NOT r.data ? 'language'`;
  return `(${said} OR (${language} = 'he' AND ${silent}))`;
}
