import type { CatalogLibrary, CatalogRef, LibraryItemBase } from '../library/types.js';
import type { CatalogEntry } from '../types.js';
import { translateChapterName } from './chapterNameHe.js';
import { translateOccasionLabel } from './occasionLabelEn.js';

/**
 * Names the rules below can't translate, or translate wrong, translated
 * once and checked (translations/library-he.json and library-en.json, read
 * by bin/libraryTranslations.ts): English -> Hebrew for JEM's names, Hebrew
 * -> English for mafteiach's.
 */
export interface LibraryTranslations {
  he: Readonly<Record<string, string>>;
  en: Readonly<Record<string, string>>;
}

/**
 * The library with each name in the other language beside it, for the
 * interface language that isn't the name's own:
 *
 * - JEM's recordings (English): the item's name (`labelHe`), its type
 *   (`typeHe`) and each recording's chapter name (the ref's `labelHe`) -
 *   the recordings of a maamar too.
 * - mafteiach's names (Hebrew), in English: where a maamar was said
 *   (`occasionLabelEn`), a sicha's parsha or moed (`sectionLabelEn`), and
 *   the names of the reshimos, the letters and the hadranim (`labelEn`).
 *
 * A checked JEM name in `extra` comes first, the rules after it (the
 * farbrengens' chapter names go through the same two, translateCatalogYear,
 * so the two read alike); for mafteiach's names the rules come first and
 * `extra` fills in what they can't. A name neither knows keeps only its
 * own language, and the apps show it as it is. The library is not
 * changed; a translated copy is returned.
 */
export function translateLibrary(library: CatalogLibrary, extra: LibraryTranslations): CatalogLibrary {
  const he = (text: string | undefined): string | undefined => (text ? (extra.he[text] ?? translateChapterName(text) ?? undefined) : undefined);
  const en = (text: string | undefined): string | undefined => (text ? (translateOccasionLabel(text) ?? extra.en[text] ?? undefined) : undefined);
  // A parsha's or moed's English name as the axes already have it.
  const named = new Map<string, string>();
  for (const def of [...library.moadim, ...library.parshiyos]) if (def.nameEn) named.set(def.name, def.nameEn);

  const refs = (list: CatalogRef[], translate: (text: string | undefined) => string | undefined, key: 'labelHe' | 'labelEn') =>
    list.map((ref) => {
      const out = translate(ref.label);
      return out ? { ...ref, [key]: out } : ref;
    });
  const withLabel = <T extends LibraryItemBase>(item: T, key: 'labelHe' | 'labelEn', value: string | undefined): T => (value ? { ...item, [key]: value } : item);

  const collections = library.collections;
  return {
    ...library,
    collections: {
      ...collections,
      jemEvents: {
        ...collections.jemEvents,
        items: collections.jemEvents.items.map((item) => {
          const typeHe = he(item.type);
          return { ...withLabel(item, 'labelHe', he(item.label)), ...(typeHe ? { typeHe } : {}), refs: refs(item.refs, he, 'labelHe') };
        }),
      },
      maamorim: {
        ...collections.maamorim,
        items: collections.maamorim.items.map((item) => {
          const occasionLabelEn = en(item.occasionLabel);
          // Its recordings are JEM's, named in English; its PDFs keep their Hebrew names.
          const withAudio = { ...item, refs: item.refs.map((ref) => (ref.kind === 'audio' ? refs([ref], he, 'labelHe')[0]! : ref)) };
          return occasionLabelEn ? { ...withAudio, occasionLabelEn } : withAudio;
        }),
      },
      likkuteiSichos: {
        ...collections.likkuteiSichos,
        items: collections.likkuteiSichos.items.map((item) => {
          const sectionLabelEn = named.get(item.sectionLabel) ?? en(item.sectionLabel);
          return sectionLabelEn ? { ...item, sectionLabelEn } : item;
        }),
      },
      reshimos: { ...collections.reshimos, items: collections.reshimos.items.map((item) => withLabel(item, 'labelEn', en(item.label))) },
      michtavimKlolim: { ...collections.michtavimKlolim, items: collections.michtavimKlolim.items.map((item) => withLabel(item, 'labelEn', en(item.label))) },
      hadranim: { ...collections.hadranim, items: collections.hadranim.items.map((item) => withLabel(item, 'labelEn', en(item.label))) },
    },
  };
}

/**
 * A year of farbrengens with each recording's chapter name in Hebrew
 * (`chapterNameHe`), the same way as the library's recordings: the checked
 * name first, then the rules. The year is not changed; a copy is returned.
 */
export function translateCatalogYear(entries: CatalogEntry[], extra: Pick<LibraryTranslations, 'he'>): CatalogEntry[] {
  return entries.map((entry) => ({
    ...entry,
    audio: entry.audio.map((audio) => {
      const { chapterNameHe: _old, ...rest } = audio;
      const chapterNameHe = audio.chapterName ? (extra.he[audio.chapterName] ?? translateChapterName(audio.chapterName)) : null;
      return chapterNameHe ? { ...rest, chapterNameHe } : rest;
    }),
  }));
}
