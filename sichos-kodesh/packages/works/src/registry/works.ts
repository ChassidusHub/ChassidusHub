import type { Genre, Work, WorkSource } from '../types.js';
import { AUTHOR_BY_LIBRARY_GROUP } from './authors.js';
import { CHABADLIBRARY_TREE } from './chabadlibraryTree.js';

/**
 * The works registry, kept by hand on purpose (the plan's risk "matching
 * the same work across sources takes curation"). Three parts:
 *
 * 1. Every work chabadlibrary.org lists (its tree, a snapshot of titles and
 *    ids), with an id, an English title and a genre given here.
 * 2. Sefaria's Chabad texts (WP8), attached to the same works, each copy
 *    with its licence as Sefaria records it - plus the few Sefaria has
 *    that the library does not list separately.
 * 3. The collections the phone already browses, as works whose units keep
 *    the collections' item ids (see collections.ts).
 */

interface LibraryWork {
  id: string;
  en: string;
  genre: Genre;
  levels?: string[];
}

/** chabadlibrary.org tree id -> the registry's own id, English title and genre. */
const LIBRARY_WORKS: Readonly<Record<number, LibraryWork>> = {
  300000000: { id: 'keser-shem-tov', en: 'Keser Shem Tov', genre: 'chassidus' },
  400000000: { id: 'or-torah-maggid', en: 'Or Torah', genre: 'chassidus' },
  3400000000: { id: 'tanya', en: 'Tanya', genre: 'chassidus', levels: ['part', 'chapter'] },
  3900000000: { id: 'torah-or', en: 'Torah Or', genre: 'maamarim', levels: ['parsha', 'maamar'] },
  4000000000: { id: 'likkutei-torah', en: 'Likkutei Torah', genre: 'maamarim', levels: ['parsha', 'maamar'] },
  2100000000: { id: 'maamarei-admur-hazaken', en: 'Maamarei Admur HaZaken', genre: 'maamarim' },
  3100000000: { id: 'shulchan-aruch-harav', en: 'Shulchan Aruch HaRav', genre: 'halacha', levels: ['section', 'siman', 'seif'] },
  3200000000: { id: 'shut-alter-rebbe', en: 'Responsa of the Alter Rebbe', genre: 'halacha' },
  5600000000: { id: 'piskei-hasiddur', en: 'Piskei HaSiddur', genre: 'halacha' },
  6500000000: { id: 'igros-kodesh-alter-rebbe', en: 'Igros Kodesh (the Alter Rebbe)', genre: 'igros', levels: ['letter'] },
  8300000000: { id: 'shulchan-aruch-harav-divrei-shalom', en: 'Shulchan Aruch HaRav with Biur Divrei Shalom', genre: 'halacha' },
  1700000000: { id: 'imrei-binah', en: 'Imrei Binah', genre: 'chassidus' },
  2800000000: { id: 'ner-mitzvah-vetorah-or', en: 'Ner Mitzvah v’Torah Or', genre: 'chassidus' },
  2400000000: { id: 'perush-hamilos', en: 'Perush HaMilos', genre: 'chassidus' },
  2200000000: { id: 'shaarei-orah', en: 'Shaarei Orah', genre: 'maamarim' },
  2500000000: { id: 'shaarei-teshuvah', en: 'Shaarei Teshuvah', genre: 'maamarim' },
  2300000000: { id: 'toras-chaim', en: 'Toras Chaim', genre: 'maamarim' },
  1900000000: { id: 'maamarei-admur-haemtzai', en: 'Maamarei Admur HaEmtzai', genre: 'maamarim' },
  6600000000: { id: 'igros-kodesh-mitteler-rebbe', en: 'Igros Kodesh (the Mitteler Rebbe)', genre: 'igros', levels: ['letter'] },
  1800000000: { id: 'or-hatorah', en: 'Or HaTorah', genre: 'maamarim' },
  2900000000: { id: 'derech-mitzvosecha', en: 'Derech Mitzvosecha', genre: 'chassidus', levels: ['mitzvah'] },
  3000000000: { id: 'sefer-hachakirah', en: 'Sefer HaChakirah', genre: 'chassidus' },
  3300000000: { id: 'yahel-or', en: 'Yahel Or on Tehillim', genre: 'chassidus' },
  3800000000: { id: 'shut-tzemach-tzedek', en: 'Responsa of the Tzemach Tzedek', genre: 'halacha' },
  4100000000: { id: 'maamarei-admur-tzemach-tzedek', en: 'Maamarei Admur HaTzemach Tzedek', genre: 'maamarim' },
  6700000000: { id: 'igros-kodesh-tzemach-tzedek', en: 'Igros Kodesh (the Tzemach Tzedek)', genre: 'igros', levels: ['letter'] },
  2000000000: { id: 'toras-shmuel', en: 'Toras Shmuel', genre: 'maamarim' },
  3600000000: { id: 'hemshech-ayin-beis', en: 'Hemshech Ayin-Beis', genre: 'maamarim' },
  4400000000: { id: 'kuntres-umaayan', en: 'Kuntres U’Maayan', genre: 'chassidus' },
  7100000000: { id: 'shut-toras-shalom', en: 'Responsa Toras Shalom', genre: 'halacha' },
  7200000000: { id: 'igros-kodesh-rebbe-rashab', en: 'Igros Kodesh (the Rebbe Rashab)', genre: 'igros', levels: ['letter'] },
  3500000000: { id: 'igros-kodesh-frierdiker-rebbe', en: 'Igros Kodesh (the Frierdiker Rebbe)', genre: 'igros', levels: ['volume', 'letter'] },
  2700000000: { id: 'sefer-hamaamarim-frierdiker-rebbe', en: 'Sefer HaMaamarim (the Frierdiker Rebbe)', genre: 'maamarim' },
  4300000000: { id: 'sefer-hasichos-frierdiker-rebbe', en: 'Sefer HaSichos (the Frierdiker Rebbe)', genre: 'sichos' },
  5700000000: { id: 'tzemach-tzedek-and-haskalah', en: 'The Tzemach Tzedek and the Haskalah Movement', genre: 'history' },
  1200000000: { id: 'igros-kodesh-rebbe', en: 'Igros Kodesh (the Rebbe)', genre: 'igros', levels: ['volume', 'letter'] },
  1400000000: { id: 'toras-menachem', en: 'Toras Menachem', genre: 'sichos', levels: ['volume', 'farbrengen'] },
  1300000000: { id: 'likkutei-sichos', en: 'Likkutei Sichos', genre: 'sichos', levels: ['volume', 'sicha'] },
  1500000000: { id: 'sefer-hamaamarim-melukat', en: 'Sefer HaMaamarim Melukat', genre: 'maamarim', levels: ['year', 'maamar'] },
  5000000000: { id: 'reshimos', en: 'Reshimos', genre: 'chassidus', levels: ['reshimah'] },
  3700000000: { id: 'hayom-yom', en: 'Hayom Yom', genre: 'minhagim', levels: ['day'] },
  4500000000: { id: 'inyanah-shel-toras-hachassidus', en: 'Inyanah shel Toras HaChassidus', genre: 'chassidus' },
  6400000000: { id: 'haggadah-likkutei-taamim', en: 'The Haggadah with Likkutei Taamim uMinhagim', genre: 'minhagim' },
  7600000000: { id: 'haggadah-likkutei-taamim-divrei-shalom', en: 'The Haggadah with Likkutei Taamim uMinhagim and Biur Divrei Shalom', genre: 'minhagim' },
  8000000000: { id: 'biurei-tanya', en: 'Biurei Tanya', genre: 'chassidus' },
  8100000000: { id: 'mishulchan-haari', en: 'MiShulchan HaAri', genre: 'minhagim' },
  8200000000: { id: 'piskei-admur-hazaken-issur-vheter', en: 'Piskei Admur HaZaken on Issur v’Heter', genre: 'halacha' },
  4800000000: { id: 'pelach-harimon', en: 'Pelach HaRimon', genre: 'chassidus' },
  4900000000: { id: 'sheiris-yehudah', en: 'She’eris Yehudah', genre: 'chassidus' },
  5400000000: { id: 'otzar-minhagei-chabad', en: 'Otzar Minhagei Chabad', genre: 'minhagim' },
  5900000000: { id: 'tikunei-mikvaos', en: 'Tikunei Mikvaos according to our Rebbeim', genre: 'halacha' },
  6000000000: { id: 'seder-mechiras-chametz', en: 'Seder Mechiras Chametz according to our Rebbeim', genre: 'halacha' },
  6100000000: { id: 'hilchos-amirah-lenochri', en: 'Hilchos Amirah l’Nochri from the Shulchan Aruch HaRav', genre: 'halacha' },
  7300000000: { id: 'shiurei-halacha-lemaaseh', en: 'Shiurei Halacha l’Maaseh', genre: 'halacha' },
  7400000000: { id: 'seder-tenaim-erusin-nisuin', en: 'Seder Tenaim, Erusin v’Nisuin', genre: 'halacha' },
  7700000000: { id: 'dover-shalom', en: 'Dover Shalom', genre: 'chassidus' },
  6300000000: { id: 'maasar-ugeulas-admur-haemtzai', en: 'The Arrest and Liberation of the Mitteler Rebbe', genre: 'history' },
  5100000000: { id: 'toldos-avraham-chaim', en: 'Toldos Avraham Chaim', genre: 'history' },
  5200000000: { id: 'toldos-chabad-eretz-hakodesh', en: 'Toldos Chabad b’Eretz HaKodesh', genre: 'history' },
  6800000000: { id: 'toldos-chabad-russia', en: 'Toldos Chabad in Tsarist Russia', genre: 'history' },
  7000000000: { id: 'toldos-chabad-poland-lithuania-latvia', en: 'Toldos Chabad in Poland, Lithuania and Latvia', genre: 'history' },
  5300000000: { id: 'zichron-livnei-yisrael', en: 'Zichron Livnei Yisrael', genre: 'history' },
  5500000000: { id: 'lemaan-yeidu-banim', en: 'L’maan Yeidu Banim Yivaledu', genre: 'history' },
  5800000000: { id: 'zichronosai', en: 'Zichronosai', genre: 'history' },
  6200000000: { id: 'lubavitch', en: 'Lubavitch', genre: 'history' },
  6900000000: { id: 'mibeis-haganazim', en: 'MiBeis HaGanazim', genre: 'history' },
  7800000000: { id: 'library-exhibitions', en: 'The Library’s Exhibitions', genre: 'history' },
  7900000000: { id: 'yoman-hashlichus-hameyuchedes', en: 'Yoman HaShlichus HaMeyuchedes', genre: 'diaries' },
  11200000469: { id: 'avodas-hakodesh', en: 'Avodas HaKodesh', genre: 'history' },
  11200003993: { id: 'bechol-beisi-neeman-hu', en: 'B’chol Beisi Ne’eman Hu', genre: 'history' },
  11200004131: { id: 'rabbeim-and-bukharan-jewry', en: 'The Chabad Rebbeim and Bukharan Jewry', genre: 'history' },
  11200004207: { id: 'rabbeim-and-austrian-jewry', en: 'The Chabad Rebbeim and Austrian Jewry', genre: 'history' },
  11200004103: { id: 'rabbeim-and-german-jewry', en: 'The Chabad Rebbeim and German Jewry', genre: 'history' },
};

const KEHOT = 'Kehot Publication Society';
const COMMUNITY = 'Sefaria Community Translation';

/** Sefaria's copies (WP8): the Hebrew and the English of each, with the licence Sefaria records. */
const SEFARIA: Readonly<Record<string, WorkSource[]>> = {
  tanya: [
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: KEHOT },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'en', licence: 'cc-by-nc', credit: KEHOT, version: 'Kehot Publication Society (English Translation)' },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'en', licence: 'cc0', version: COMMUNITY },
  ],
  'torah-or': [
    { source: 'sefaria', sourceId: 'Torah Ohr', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: KEHOT },
    { source: 'sefaria', sourceId: 'Sources and References on Torah Ohr', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: KEHOT },
    { source: 'sefaria', sourceId: 'Torah Ohr', kind: 'text', language: 'en', licence: 'cc0', version: COMMUNITY },
  ],
  'likkutei-torah': [
    { source: 'sefaria', sourceId: 'Likkutei Torah', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: KEHOT },
    { source: 'sefaria', sourceId: 'Sources and References on Likkutei Torah', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: KEHOT },
    { source: 'sefaria', sourceId: 'Likkutei Torah', kind: 'text', language: 'en', licence: 'cc0', version: COMMUNITY },
  ],
  'derech-mitzvosecha': [
    { source: 'sefaria', sourceId: 'Derekh Mitzvotekha', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: KEHOT },
    { source: 'sefaria', sourceId: 'Derekh Mitzvotekha', kind: 'text', language: 'en', licence: 'cc0', version: COMMUNITY },
  ],
  'shulchan-aruch-harav': [
    { source: 'sefaria', sourceId: 'Shulchan Arukh HaRav', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: KEHOT },
    { source: 'sefaria', sourceId: 'Shulchan Arukh HaRav', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: 'Vocalized Edition - Kehot Publication Society' },
    { source: 'sefaria', sourceId: 'Kuntres Acharon on Shulchan Arukh HaRav', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: KEHOT },
    { source: 'sefaria', sourceId: 'Shulchan Arukh HaRav', kind: 'text', language: 'en', licence: 'cc0', version: COMMUNITY },
  ],
  'ner-mitzvah-vetorah-or': [
    // Sefaria's "The Gate of Unity" is Shaar HaYichud, the book's second part.
    { source: 'sefaria', sourceId: 'The Gate of Unity', kind: 'text', language: 'he', licence: 'unknown', version: 'Neirot, 2023' },
    { source: 'sefaria', sourceId: 'The Gate of Unity', kind: 'text', language: 'en', licence: 'cc-by', credit: 'Rabbi Amiram Markel (Neirot)', version: 'Translated by Rabbi Amiram Markel, 2023' },
  ],
  'kuntres-hahispaalus': [
    { source: 'sefaria', sourceId: "Kuntres HaHitpa'alut", kind: 'text', language: 'he', licence: 'unknown', version: 'The Neirot Foundation, 2024' },
    { source: 'sefaria', sourceId: "Kuntres HaHitpa'alut", kind: 'text', language: 'en', licence: 'unknown', version: 'Translated by Rabbi Amiram Markel, the Neirot Foundation, 2024' },
  ],
  'siddur-weekday': [
    { source: 'sefaria', sourceId: 'Weekday Siddur Chabad', kind: 'text', language: 'he', licence: 'unknown', version: 'Wikisource' },
    { source: 'sefaria', sourceId: 'Weekday Siddur Chabad', kind: 'text', language: 'en', licence: 'cc0', version: COMMUNITY },
  ],
  'maaneh-lashon': [
    { source: 'sefaria', sourceId: "Ma'aneh Lashon Chabad", kind: 'text', language: 'he', licence: 'public-domain', version: 'Warsaw, 1869' },
    { source: 'sefaria', sourceId: "Ma'aneh Lashon Chabad", kind: 'text', language: 'en', licence: 'cc0', version: COMMUNITY },
  ],
};

/** Works on Sefaria that chabadlibrary.org does not list on their own. */
const SEFARIA_ONLY: readonly Omit<Work, 'sources'>[] = [
  { id: 'kuntres-hahispaalus', title: { he: 'קונטרס ההתפעלות', en: 'Kuntres HaHispaalus' }, authors: ['mitteler-rebbe'], genre: 'chassidus', levels: [] },
  { id: 'siddur-weekday', title: { he: 'סידור חב״ד לימות החול', en: 'The Chabad Siddur (weekdays)' }, authors: ['alter-rebbe'], genre: 'siddur', levels: ['prayer'] },
  { id: 'maaneh-lashon', title: { he: 'מענה לשון חב״ד', en: 'Maaneh Lashon' }, authors: [], genre: 'siddur', levels: [] },
];

const mafteiach = (kind: WorkSource['kind'] = 'pdf'): WorkSource => ({ source: 'mafteiach', sourceId: 'mafteiach.app', kind, licence: 'facts-and-links' });
const jem = (): WorkSource => ({ source: 'jem', sourceId: 'jem', kind: 'audio', licence: 'facts-and-links' });

/** The collections the phone browses that chabadlibrary.org does not list: their own works. */
const COLLECTION_ONLY: readonly Work[] = [
  { id: 'yomanim', title: { he: 'יומנים', en: 'Yomanim' }, authors: [], genre: 'diaries', levels: ['year', 'month', 'yoman'], collection: 'yomanim', sources: [mafteiach()] },
  { id: 'hadranim', title: { he: 'הדרנים', en: 'Hadranim' }, authors: ['the-rebbe'], genre: 'sichos', levels: ['masechta', 'hadran'], collection: 'hadranim', sources: [mafteiach()] },
  {
    id: 'michtavim-klolim',
    title: { he: 'מכתבים כלליים', en: 'General letters' },
    authors: ['the-rebbe'],
    genre: 'igros',
    levels: ['moed', 'michtav'],
    collection: 'michtavimKlolim',
    sources: [mafteiach()],
  },
  { id: 'jem-recordings', title: { he: 'הקלטות JEM', en: 'JEM recordings' }, authors: ['the-rebbe'], genre: 'recordings', levels: ['year', 'event'], collection: 'jemEvents', sources: [jem()] },
  { id: 'maanos', title: { he: 'מענות', en: 'Maanos' }, authors: ['the-rebbe'], genre: 'igros', levels: ['year', 'maaneh'], collection: 'maanos', sources: [{ source: 'igros-app', sourceId: 'maanos', kind: 'text', licence: 'commercial' }] },
];

/** Where the phone's collections sit among chabadlibrary.org's works, and the sources they already have. */
const COLLECTION_OF: Readonly<Record<string, { collection: NonNullable<Work['collection']>; sources: WorkSource[] }>> = {
  'likkutei-sichos': { collection: 'likkuteiSichos', sources: [mafteiach()] },
  'sefer-hamaamarim-melukat': { collection: 'maamorim', sources: [mafteiach(), jem()] },
  reshimos: { collection: 'reshimos', sources: [mafteiach()] },
  // The letters as the Igros app holds them (packages/igros-index), cleared to ship on 2026-09-24.
  'igros-kodesh-rebbe': { collection: 'igros', sources: [{ source: 'igros-app', sourceId: 'igros', kind: 'text', language: 'he', licence: 'commercial', credit: 'Kehot Publication Society' }] },
};

function libraryHeading(heading: string): string {
  return heading.trim().replace(/"/g, '״');
}

function buildWorks(): Work[] {
  const byParent = new Map<number, number>();
  for (const node of CHABADLIBRARY_TREE) byParent.set(node.id, node.parent);
  const works: Work[] = [];
  for (const node of CHABADLIBRARY_TREE) {
    if (node.parent === 0) continue;
    const known = LIBRARY_WORKS[node.id];
    if (!known) throw new Error(`chabadlibrary.org work ${node.id} (${node.heading}) has no registry entry`);
    const author = AUTHOR_BY_LIBRARY_GROUP[byParent.get(node.id) ?? 0];
    const extra = COLLECTION_OF[known.id];
    const work: Work = {
      id: known.id,
      title: { he: libraryHeading(node.heading), en: known.en },
      authors: author ? [author] : [],
      genre: known.genre,
      levels: known.levels ?? [],
      sources: [
        { source: 'chabadlibrary', sourceId: String(node.id), kind: 'text', language: 'he', licence: 'free-to-read' },
        ...(SEFARIA[known.id] ?? []),
        ...(extra?.sources ?? []),
      ],
    };
    if (extra) work.collection = extra.collection;
    works.push(work);
  }
  for (const work of SEFARIA_ONLY) works.push({ ...work, sources: SEFARIA[work.id] ?? [] });
  works.push(...COLLECTION_ONLY);
  return works;
}

export const WORKS: readonly Work[] = buildWorks();

const byId = new Map(WORKS.map((work) => [work.id, work]));

export function workById(id: string): Work | undefined {
  return byId.get(id);
}

/** The work holding a library collection's items. */
export function workForCollection(collection: NonNullable<Work['collection']>): Work {
  const work = WORKS.find((w) => w.collection === collection);
  if (!work) throw new Error(`no work holds the ${collection} collection`);
  return work;
}
