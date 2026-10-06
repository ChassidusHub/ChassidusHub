/**
 * Text as the search index holds it, and as a query must be written to
 * match it:
 * - no niqqud or cantillation;
 * - no geresh, gershayim or quotes, so ה"ה and ה״ה are both הה;
 * - lower case;
 * - every other character that is not a letter or digit becomes a space.
 * Plain code only (no Unicode property escapes, no `normalize`), so the
 * phone's JavaScript engine gives the same answer as the builder.
 * Shared by the search indexes (the pack builder's and the phone's) and by
 * name search in both apps; `@chassidushub-reader/pack-format` re-exports it.
 */
export function normalizeSearchText(text: string): string {
  return text
    .replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, '')
    .replace(/[\u05F3\u05F4"'`\u2018\u2019\u201C\u201D]/g, '')
    .toLowerCase()
    .replace(/[^0-9a-z\u00C0-\u024F\u05D0-\u05EA\u05F0-\u05F2]+/g, ' ')
    .trim();
}
