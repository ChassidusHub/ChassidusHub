import type { CatalogAudio, CatalogEntry } from '@chassidushub-reader/catalog';
import type { Language } from '../search/language.js';

/**
 * Each UI language shows catalog names in its own language. mafteiach
 * labels an occasion in Hebrew and JEM names a recording in English; the
 * catalog carries the translation of each (`occasionLabelEn`,
 * `chapterNameHe` - packages/catalog/src/translate/), and these pick the one
 * for the UI, falling back to the original where there is no translation
 * (a label the rules could not read, or a catalog from before 1.1.0).
 *
 * Display only: saved progress, playlists and downloads keep keying by the
 * originals (`occasionLabel`, the chapter index), so switching language
 * never loses anything.
 */

type OccasionNames = Pick<CatalogEntry, 'occasionLabel' | 'occasionLabelEn' | 'occasionLabelShort' | 'occasionLabelShortEn'>;

/**
 * An occasion's name as a title - a row, a header, the player: the English
 * UI's `occasionLabelEn`, else mafteiach's Hebrew `occasionLabel`, each in
 * its short form where the catalog has one (catalog 1.7.0) - the long name
 * is then `occasionDescription`.
 */
export function occasionTitle(entry: OccasionNames, language: Language): string {
  if (language === 'en' && entry.occasionLabelEn) return entry.occasionLabelShortEn ?? entry.occasionLabelEn;
  return entry.occasionLabelShort ?? entry.occasionLabel;
}

/** An occasion's whole name in the UI language, however long: for sharing, and to search in. */
export function occasionFullName(entry: OccasionNames, language: Language): string {
  return language === 'en' ? (entry.occasionLabelEn ?? entry.occasionLabel) : entry.occasionLabel;
}

/** The whole name under a shortened title - where a yechidus says who it was for - or undefined when the title is the whole name. */
export function occasionDescription(entry: OccasionNames, language: Language): string | undefined {
  const full = occasionFullName(entry, language);
  return full !== occasionTitle(entry, language) ? full : undefined;
}

/** A recording's own chapter name: the Hebrew UI's `chapterNameHe`, else JEM's English - undefined when JEM did not name it. */
export function audioChapterName(audio: Pick<CatalogAudio, 'chapterName' | 'chapterNameHe'>, language: Language): string | undefined {
  return language === 'he' ? (audio.chapterNameHe ?? audio.chapterName) : audio.chapterName;
}

/** The apps' "Track N" / "קטע N", for a recording with no name of its own. */
export function trackLabel(n: number, language: Language): string {
  return language === 'he' ? `קטע ${n}` : `Track ${n}`;
}

/** A recording's title in a list of chapters: its own name (see `audioChapterName`), else "Track N" by its 0-based `index`. */
export function chapterTitle(
  audio: Pick<CatalogAudio, 'chapterName' | 'chapterNameHe'>,
  index: number,
  language: Language,
  fallback: (n: number) => string = (n) => trackLabel(n, language),
): string {
  return audioChapterName(audio, language) ?? fallback(index + 1);
}
