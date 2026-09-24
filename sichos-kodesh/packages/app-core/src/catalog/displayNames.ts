import type { CatalogAudio, CatalogEntry } from '@sichos-kodesh/catalog';
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

/** An occasion's name: the English UI's `occasionLabelEn`, else mafteiach's Hebrew `occasionLabel`. */
export function occasionTitle(entry: Pick<CatalogEntry, 'occasionLabel' | 'occasionLabelEn'>, language: Language): string {
  return language === 'en' ? (entry.occasionLabelEn ?? entry.occasionLabel) : entry.occasionLabel;
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
