import { describe, expect, it } from 'vitest';
import type { CatalogWork, CatalogWorkContents, CatalogWorksIndex } from '@sichos-kodesh/catalog';
import { renderUnit } from '@sichos-kodesh/sefaria-index/reader';
import { DEFAULT_READER_SETTINGS, clampScale, parseReaderSettings, readerFont, readerLineHeight, readerTextSize } from '../src/seforim/readerSettings.js';
import { emptyReadingState, parseReadingState, recentPlaces, withBookmarkToggled, withPlace, withSettings, isBookmarked } from '../src/seforim/readingState.js';
import { authorSections, chooseEdition, citation, contentsAt, editionLabel, linkEditions, neighbours, pathToUnit, snippetAround, unitCount, unitPosition, workKind } from '../src/seforim/seforimModel.js';
import { searchNames } from '../src/seforim/searchNames.js';
import { fetchFromSefaria, TextLoadError } from '../src/seforim/sefariaText.js';
import { markLabel, parseTextObject, stripNiqqud, textObjectPlainText } from '../src/seforim/textObject.js';

// Invented works and texts in the catalog's shape - not real editions.
const tanya: CatalogWork = {
  id: 'tanya',
  title: { he: 'תניא', en: 'Tanya' },
  authors: ['alter-rebbe'],
  genre: 'chassidus',
  levels: [],
  sources: [
    { source: 'chabadlibrary', sourceId: '1', kind: 'text', licence: 'free-to-read', rights: 'link-only' },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'he', licence: 'cc-by-nc', rights: 'ship-with-credit', credit: 'Kehot', version: 'Kehot Publication Society' },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'en', licence: 'cc0', rights: 'ship', version: 'Sefaria Community Translation' },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'en', licence: 'unknown', rights: 'link-only', version: 'Other' },
  ],
  units: 3,
};
const contents: CatalogWorkContents = {
  workId: 'tanya',
  contents: [
    { unitId: 'intro' },
    { title: { he: 'ליקוטי אמרים', en: 'Likkutei Amarim' }, entries: [{ unitId: 'part1/1' }, { title: { he: 'הסכמות', en: 'Approbations' }, entries: [{ unitId: 'part1/app/1' }] }] },
  ],
  units: [
    { id: 'intro', label: 'שער', ref: 'Tanya, Title', editions: [{ source: 1, sha256: 'a'.repeat(64), bytes: 1 }] },
    { id: 'part1/1', label: 'ליקוטי אמרים, פרק א׳', labelEn: 'Likkutei Amarim, Chapter 1', ref: 'Tanya 1', editions: [{ source: 1, sha256: 'b'.repeat(64), bytes: 1 }, { source: 2, sha256: 'c'.repeat(64), bytes: 1 }, { source: 3 }] },
    { id: 'part1/app/1', label: 'ליקוטי אמרים, הסכמות, פרק א׳', editions: [{ source: 2, sha256: 'd'.repeat(64), bytes: 1 }] },
  ],
};
const sichos: CatalogWork = { id: 'likkutei-sichos', title: { he: 'לקוטי שיחות', en: 'Likkutei Sichos' }, authors: ['the-rebbe'], genre: 'sichos', levels: [], collection: 'likkuteiSichos', sources: [] };
const listed: CatalogWork = { id: 'kesser', title: { he: 'כתר שם טוב', en: 'Keser Shem Tov' }, authors: ['nobody'], genre: 'chassidus', levels: [], sources: [{ source: 'chabadlibrary', sourceId: '2', kind: 'text', licence: 'free-to-read', rights: 'link-only' }] };
const works: CatalogWorksIndex = {
  authors: [
    { id: 'alter-rebbe', name: { he: 'אדמו״ר הזקן', en: 'The Alter Rebbe' }, rebbe: 1 },
    { id: 'mitteler-rebbe', name: { he: 'אדמו״ר האמצעי', en: 'The Mitteler Rebbe' }, rebbe: 2 },
    { id: 'the-rebbe', name: { he: 'כ״ק אדמו״ר', en: 'The Rebbe' }, rebbe: 7 },
  ],
  works: [tanya, sichos, listed],
};

describe('the seforim model', () => {
  it('lists the Rebbeim in order with their works, drops an author with none, and gathers the rest', () => {
    expect(authorSections(works).map((s) => [s.author?.id ?? null, s.works.map((w) => w.id)])).toEqual([
      ['alter-rebbe', ['tanya']],
      ['the-rebbe', ['likkutei-sichos']],
      [null, ['kesser']],
    ]);
    expect([workKind(tanya), workKind(sichos), workKind(listed)]).toEqual(['read', 'collection', 'listed']);
  });

  it('walks the contents by path, counts units, and finds a unit\'s place', () => {
    expect(contentsAt(contents, [])?.entries).toHaveLength(2);
    expect(contentsAt(contents, [1, 1])?.trail.map((n) => n.title.en)).toEqual(['Likkutei Amarim', 'Approbations']);
    expect(contentsAt(contents, [0])).toBeNull();
    expect(unitCount(contents.contents[1]!)).toBe(2);
    expect(pathToUnit(contents, 'part1/app/1')).toEqual([1, 1]);
    expect(neighbours(contents, 'part1/1')).toMatchObject({ previous: { id: 'intro' }, next: { id: 'part1/app/1' } });
    expect(unitPosition(contents, 'part1/1')).toEqual({ number: 2, total: 3 });
    expect(unitPosition(contents, 'nowhere')).toBeNull();
  });

  it('shares a passage with the sefer and chapter it is from, in its own language', () => {
    const unit = contents.units[1]!;
    expect(citation(' The words. ', tanya, unit, 'en', 'https://example.org/t')).toBe('The words.\n\n— Tanya, Likkutei Amarim, Chapter 1\nhttps://example.org/t');
    expect(citation('המילים', tanya, unit, 'he')).toBe('המילים\n\n— תניא, ליקוטי אמרים, פרק א׳');
  });

  it('opens the asked edition, else the remembered one, else the Hebrew - never a link-only one', () => {
    const unit = contents.units[1]!;
    expect(chooseEdition(tanya, unit)?.source).toBe(1);
    expect(chooseEdition(tanya, unit, null, 2)?.source).toBe(2);
    expect(chooseEdition(tanya, unit, 2, 1)?.source).toBe(2);
    expect(chooseEdition(tanya, unit, 3)?.source).toBe(1);
    expect(linkEditions(tanya, unit).map((e) => e.source)).toEqual([3]);
    expect(chooseEdition(tanya, contents.units[2]!)?.source).toBe(2);
  });

  it('names an edition by its language, and its version only when two share one', () => {
    const langs = { he: 'עברית', en: 'English', yi: 'Yiddish' };
    expect(editionLabel(tanya.sources[1]!, langs, 1)).toBe('עברית');
    expect(editionLabel(tanya.sources[2]!, langs, 2)).toBe('English (Community Translation)');
  });

  it('cuts a snippet around the first word found as the index finds it: no niqqud, prefixes off', () => {
    const text = 'הִנֵּה מַיִם רַבִּים לֹא יוּכְלוּ לְכַבּוֹת אֶת הָאַהֲבָה וּנְהָרוֹת לֹא יִשְׁטְפוּהָ';
    // The radius counts characters, niqqud included, and the cut falls between words.
    expect(snippetAround(text, 'אהבה', 12)).toBe('… אֶת הָאַהֲבָה וּנְהָרוֹת …');
    expect(snippetAround(text, 'ונהרות')).toBe(text);
    expect(snippetAround(text, 'שכינה')).toBeNull();
  });
});

describe('text objects', () => {
  const html = renderUnit({
    workId: 'tanya',
    unitId: 'part1/1',
    heading: 'ליקוטי אמרים, פרק א׳',
    language: 'he',
    ref: 'Tanya 1',
    version: 'Kehot Publication Society',
    licence: 'cc-by-nc',
    credit: 'Kehot',
    text: ['<i data-overlay="Vilna Pages" data-value="[מ: כד כסלו]"></i> <b>תַּנְיָא</b> text &amp; more<sup class="footnote-marker">1</sup><i class="footnote">note <i>one</i></i>', 'second'],
    sectionNames: [],
  });

  it('reads what the import renders: heading, marks, bold, footnotes, the credit line', () => {
    const parsed = parseTextObject(html);
    expect(parsed.dir).toBe('rtl');
    expect(parsed.heading).toBe('ליקוטי אמרים, פרק א׳');
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0]!.inlines).toEqual([
      { kind: 'mark', text: '[מ: כד כסלו]' },
      { kind: 'text', text: ' ' },
      { kind: 'text', text: 'תַּנְיָא', bold: true },
      { kind: 'text', text: ' text & more' },
      { kind: 'note', text: '1', note: 1 },
    ]);
    expect(parsed.notes).toEqual([{ n: 1, marker: '1', inlines: [{ kind: 'text', text: 'note ' }, { kind: 'text', text: 'one', italic: true }] }]);
    expect(parsed.source).toBe('Kehot · CC BY-NC · Sefaria');
    expect(textObjectPlainText(html)).toBe('תַּנְיָא text & more second note one');
  });

  it('renders a unit read live from Sefaria the way the packs carry it, and says why it cannot', async () => {
    const ok = async () => ({ ok: true, json: async () => ({ versions: [{ text: ['second'] }] }) });
    const live = await fetchFromSefaria(tanya, contents.units[1]!, contents.units[1]!.editions[0]!, ok);
    expect(live).toContain('data-version="Kehot Publication Society"');
    expect(live).toContain('<p>second</p>');
    const down = async () => {
      throw new Error('network');
    };
    await expect(fetchFromSefaria(tanya, contents.units[1]!, contents.units[1]!.editions[0]!, down)).rejects.toEqual(new TextLoadError('offline'));
    const noRef = { ...contents.units[1]!, ref: undefined };
    await expect(fetchFromSefaria(tanya, noRef, noRef.editions[0]!, ok)).rejects.toEqual(new TextLoadError('unavailable'));
  });
});

describe('searching names', () => {
  it('finds works and units by every word, niqqud and geresh ignored', () => {
    const contentsOf = (id: string) => (id === 'tanya' ? contents : null);
    expect(searchNames(works, contentsOf, 'שיחות').map((h) => h.work.id)).toEqual(['likkutei-sichos']);
    expect(searchNames(works, contentsOf, 'פרק א').map((h) => h.unit?.id)).toEqual(['part1/1', 'part1/app/1']);
    expect(searchNames(works, contentsOf, 'תניא הסכמות').map((h) => h.unit?.id)).toEqual(['part1/app/1']);
    expect(searchNames(works, contentsOf, 'x')).toEqual([]);
  });
});

describe('markers', () => {
  it('are bracketed once, whether or not Sefaria bracketed them', () => {
    expect(markLabel('[מ: כד כסלו]')).toBe('[מ: כד כסלו]');
    expect(markLabel(' 5b ')).toBe('[5b]');
  });
});

describe('vowels off', () => {
  it('takes the vowel points and cantillation off and leaves the letters, the maqaf and the sof pasuq', () => {
    const pointed = 'הִנֵּה מַיִם־רַבִּים׃';
    expect(stripNiqqud(pointed)).toBe('הנה מים־רבים׃');
    expect(stripNiqqud('Tanya, chapter 1')).toBe('Tanya, chapter 1');
  });
});

describe('the reader settings', () => {
  it('reads what reads right, and falls back to the defaults for the rest', () => {
    expect(parseReaderSettings(undefined)).toEqual(DEFAULT_READER_SETTINGS);
    const parsed = parseReaderSettings({ font: 'david', scale: 1.34, spacing: 'loose', theme: 'sepia', niqqud: false, notes: 'inline', continuous: 'yes' });
    expect(parsed).toMatchObject({ font: 'david', scale: 1.3, spacing: 'normal', theme: 'sepia', niqqud: false, notes: 'inline', continuous: true });
    expect(parseReaderSettings({ scale: 7 }).scale).toBe(1);
  });

  it('keeps the text size older versions stored on its own', () => {
    expect(parseReadingState({ fontScale: 1.4 }).settings.scale).toBe(1.4);
    expect(parseReadingState({ fontScale: 1.4, settings: { scale: 1.1 } }).settings.scale).toBe(1.1);
  });

  it('sizes the text and its lines from the scale and the spacing', () => {
    expect(clampScale(0.3)).toBe(0.8);
    expect(clampScale(1.26)).toBe(1.3);
    expect(readerTextSize({ scale: 1 })).toBe(19);
    expect(readerLineHeight({ scale: 1, spacing: 'relaxed' })).toBe(38);
    expect(readerFont('david').family).toBe('DavidCLM');
  });
});

describe('the reading state', () => {
  it('keeps what reads right and drops the rest', () => {
    const parsed = parseReadingState({
      places: { tanya: { unitId: 'part1/1', source: 1, at: '2026-09-24T10:00:00Z', offset: 0.5 }, bad: { unitId: 3 }, far: { unitId: 'x', source: 0, at: '2026-09-24T10:00:00Z', offset: 3 } },
      bookmarks: [{ workId: 'tanya', unitId: 'intro', at: '2026-09-24T09:00:00Z' }, { workId: 1 }],
    });
    expect(Object.keys(parsed.places)).toEqual(['tanya']);
    expect(parsed.bookmarks).toHaveLength(1);
    expect(parseReadingState(null)).toEqual(emptyReadingState());
  });

  it('records a place with how far into it the reader was, and gives the same state back when nothing changed', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    const once = withPlace(emptyReadingState(), 'tanya', 'part1/1', 1, 0.42345, now);
    expect(once.places.tanya).toEqual({ unitId: 'part1/1', source: 1, at: now.toISOString(), offset: 0.423 });
    expect(withPlace(once, 'tanya', 'part1/1', 1, 0.4231, now)).toBe(once);
    const settings = withSettings(once, { font: 'sbl-hebrew', scale: 5 });
    expect(settings.settings).toMatchObject({ font: 'sbl-hebrew', scale: 1 });
    const marked = withBookmarkToggled(settings, 'tanya', 'part1/1', now);
    expect(isBookmarked(marked, 'tanya', 'part1/1')).toBe(true);
    expect(isBookmarked(withBookmarkToggled(marked, 'tanya', 'part1/1'), 'tanya', 'part1/1')).toBe(false);
  });

  it('lists the seforim last read, newest first', () => {
    const state = parseReadingState({
      places: { a: { unitId: '1', source: 0, at: '2026-09-01T00:00:00Z' }, b: { unitId: '2', source: 0, at: '2026-09-03T00:00:00Z' }, c: { unitId: '3', source: 0, at: '2026-09-02T00:00:00Z' } },
    });
    expect(recentPlaces(state, 2).map((p) => p.workId)).toEqual(['b', 'c']);
  });
});
