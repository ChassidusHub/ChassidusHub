import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { editionUrl, mayShip, type Work } from '@sichos-kodesh/works';
import { cleanSegment, type Note } from '../src/clean.js';
import { SefariaError, sefariaClient } from '../src/client.js';
import { editionKey, importWork, sefariaLicence } from '../src/importWork.js';
import { readWorkImport, writeWorkImport } from '../src/output.js';
import { leaves, outline } from '../src/schema.js';
import { sefariaWorks } from '../src/works.js';
import { COMMUNITY, fakeSefaria, KEHOT, OTHER, TANYA_INDEX } from './fakeSefaria.js';

const WORK: Work = {
  id: 'tanya',
  title: { he: 'תניא', en: 'Tanya' },
  authors: ['alter-rebbe'],
  genre: 'chassidus',
  levels: ['part', 'chapter'],
  sources: [
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: KEHOT },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'en', licence: 'cc0', version: COMMUNITY },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'en', licence: 'unknown', version: OTHER },
    { source: 'sefaria', sourceId: 'Sources on Tanya', kind: 'text', language: 'he', licence: 'cc-by-nc', credit: KEHOT, version: KEHOT },
  ],
};

const temps: string[] = [];
async function temp(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sefaria-index-'));
  temps.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const client = (fetchFn: typeof fetch, cacheDir?: string) => sefariaClient({ fetchFn, cacheDir, delayMs: 0, retryDelayMs: 0 });

describe('cleanSegment', () => {
  it('keeps the text, bold and italic, and turns page and study markers into marks', () => {
    const notes: Note[] = [];
    expect(cleanSegment('<i data-overlay="Vilna Pages" data-value="[מ: כד כסלו]"></i> <b>תַּנְיָא</b> [בסוף פרק ג׳]', notes)).toBe(
      '<span class="mark">[מ: כד כסלו]</span> <b>תַּנְיָא</b> [בסוף פרק ג׳]',
    );
    expect(notes).toEqual([]);
  });

  it('moves footnotes to the notes, linked both ways, nested italics and all', () => {
    const notes: Note[] = [{ marker: '1', html: 'an earlier note' }];
    const html = cleanSegment('as if you were wicked.”<sup class="footnote-marker">1</sup><i class="footnote"> <i>Niddah</i> 30b.</i> And more.', notes);
    expect(html).toBe('as if you were wicked.”<sup class="fn"><a href="#n2" id="r2">1</a></sup> And more.');
    expect(notes[1]).toEqual({ marker: '1', html: '<i>Niddah</i> 30b.' });
  });

  it('balances tags, unwraps the rest, and escapes stray characters', () => {
    const notes: Note[] = [];
    expect(cleanSegment('<b>open <i>x</b> y', notes)).toBe('<b>open <i>x</i></b> y');
    expect(cleanSegment('<span class="x"><big>A</big></span><br/>B<script>bad()</script><!-- c -->', notes)).toBe('A<br>B');
    expect(cleanSegment('a & b < c &amp; d', notes)).toBe('a &amp; b &lt; c &amp; d');
    expect(cleanSegment('<sup class="footnote-marker">*</sup> no note follows', notes)).toBe('<sup>*</sup> no note follows');
    expect(cleanSegment('<b> </b>', notes)).toBe('');
  });
});

describe('the schema walk', () => {
  it('builds refs from titles, shared terms and default nodes, in the schema order', () => {
    const found = leaves(outline(TANYA_INDEX));
    expect(found.map((leaf) => [leaf.ref, leaf.path.join('/')])).toEqual([
      ['Tanya, Part I; Likkutei Amarim, Title Page', 'part1/title-page'],
      ['Tanya, Part I; Likkutei Amarim, Approbation', 'part1/approbation'],
      ['Tanya, Part I; Likkutei Amarim', 'part1'],
      ['Tanya, Part III; Iggeret HaTeshuvah', 'letter1'],
      ['Tanya, Noach', 'noach'],
    ]);
    expect(found[3]!.labels.he).toEqual(['אגרת התשובה']);
    // The raw schema leaves out Hebrew section names; the common ones are filled in.
    expect(found[3]!.heSectionNames).toEqual(['פרק', 'פסקה']);
    expect(found[2]!.sectionSizes).toEqual([2, 0, 1]);
  });
});

describe('importWork', () => {
  it('makes a unit per section with text, an edition per version, and keeps only the texts the gate lets ship', async () => {
    const site = fakeSefaria();
    const { work, texts, report } = await importWork(WORK, client(site.fetchFn));
    expect(work.units.map((u) => u.id)).toEqual(['part1/title-page', 'part1/approbation/1', 'part1/approbation/2', 'part1/1', 'part1/3', 'letter1/1', 'noach', 'sources/1']);
    expect(report.warnings).toEqual([]);

    const chapter3 = work.units.find((u) => u.id === 'part1/3')!;
    expect(chapter3.label).toBe('ליקוטי אמרים, פרק ג׳');
    expect(chapter3.labelEn).toBe('Part I; Likkutei Amarim, Chapter 3');
    expect(work.units.find((u) => u.id === 'sources/1')!.label).toBe('מקורות, פרק א׳');
    expect(work.units.find((u) => u.id === 'part1/title-page')!.label).toBe('ליקוטי אמרים, שער');

    const chapter1 = work.units.find((u) => u.id === 'part1/1')!;
    expect(chapter1.editions.map((e) => [e.language, e.version, e.licence, e.sourceId])).toEqual([
      ['he', KEHOT, 'cc-by-nc', 'Tanya, Part I; Likkutei Amarim 1'],
      ['en', COMMUNITY, 'cc0', 'Tanya, Part I; Likkutei Amarim 1'],
    ]);
    const he = chapter1.editions[0]!;
    const html = texts.get(`part1/1@${editionKey(he)}`)!;
    expect(he.credit).toBe(KEHOT);
    expect(he.text).toEqual({ sha256: createHash('sha256').update(html).digest('hex'), bytes: Buffer.byteLength(html) });
    expect(html).toContain('<article dir="rtl" lang="he" data-work="tanya" data-unit="part1/1" data-source="sefaria" data-version="Kehot Publication Society">');
    expect(html).toContain('<h1>ליקוטי אמרים, פרק א׳</h1>');
    expect(html).toContain('<p><span class="mark">[מ: כד כסלו]</span> c1<sup class="fn"><a href="#n1" id="r1">1</a></sup></p><p>c2</p>');
    expect(html).toContain('<aside class="notes"><p id="n1"><a href="#r1">1</a> note <i>one</i></p></aside>');
    expect(html).toContain('<span class="version">Kehot Publication Society</span> · <span class="licence">CC BY-NC</span>');
    expect(texts.get(`part1/1@${editionKey(chapter1.editions[1]!)}`)).toContain('<article dir="ltr" lang="en"');

    // A version with an unknown licence stays a link: an edition with no text.
    const noach = work.units.find((u) => u.id === 'noach')!;
    expect(noach.editions).toHaveLength(1);
    expect(noach.editions[0]).toMatchObject({ version: OTHER, licence: 'unknown' });
    expect(noach.editions[0]!.text).toBeUndefined();
    expect(mayShip(noach.editions[0]!)).toBe(false);
    expect([...texts.keys()].some((key) => key.startsWith('noach@'))).toBe(false);
    expect(report.linkEditions).toBe(1);
    expect(report.textEditions).toBe(texts.size);

    // The ref served only by section came in section by section.
    expect(work.units.find((u) => u.id === 'letter1/1')!.editions[0]!.sourceId).toBe('Tanya, Part III; Iggeret HaTeshuvah 1');
  });

  it('lays out the contents in the schema order, the default chapters inside their part', async () => {
    const { work } = await importWork(WORK, client(fakeSefaria().fetchFn));
    expect(work.contents).toEqual([
      {
        title: { he: 'ליקוטי אמרים', en: 'Part I; Likkutei Amarim' },
        entries: [
          { unitId: 'part1/title-page' },
          { title: { he: 'הסכמות', en: 'Approbation' }, entries: [{ unitId: 'part1/approbation/1' }, { unitId: 'part1/approbation/2' }] },
          { unitId: 'part1/1' },
          { unitId: 'part1/3' },
        ],
      },
      { title: { he: 'אגרת התשובה', en: 'Part III; Iggeret HaTeshuvah' }, entries: [{ unitId: 'letter1/1' }] },
      { unitId: 'noach' },
      { title: { he: 'מקורות', en: 'Sources' }, entries: [{ unitId: 'sources/1' }] },
    ]);
  });

  it('keeps an edition as a link, and warns, when Sefaria reports a licence other than the registry', async () => {
    const site = fakeSefaria();
    site.set('Tanya, Part I; Likkutei Amarim', COMMUNITY, { versions: [{ versionTitle: COMMUNITY, license: 'CC-BY-SA', text: [['e1']] }] });
    const { work, report } = await importWork(WORK, client(site.fetchFn));
    const english = work.units.find((u) => u.id === 'part1/1')!.editions.find((e) => e.version === COMMUNITY)!;
    expect(english.licence).toBe('unknown');
    expect(english.text).toBeUndefined();
    expect(report.warnings.join('\n')).toContain('Sefaria now reports "CC-BY-SA", the registry has "cc0"');
  });

  it('asks Sefaria nothing the second time, and writes and reads back the same texts', async () => {
    const site = fakeSefaria();
    const cache = await temp();
    const first = client(site.fetchFn, cache);
    const result = await importWork(WORK, first);
    expect(first.requests).toBe(site.urls.length);
    const second = client(site.fetchFn, cache);
    const again = await importWork(WORK, second);
    expect(second.requests).toBe(0);
    expect(again.work).toEqual(result.work);

    const out = await temp();
    await writeWorkImport(out, result);
    await writeWorkImport(out, result);
    expect((await readdir(out)).sort()).toEqual(['tanya']);
    const read = await readWorkImport(out, 'tanya');
    expect(read.work).toEqual(result.work);
    expect(read.texts).toHaveLength(result.texts.size);
    for (const text of read.texts) expect(text.html).toBe(result.texts.get(`${text.unitId}@${text.key}`));
  });
});

describe('the client', () => {
  it('retries a 503 and gives up on a 404', async () => {
    let calls = 0;
    const flaky = (async () => {
      calls += 1;
      return calls === 1 ? new Response('busy', { status: 503 }) : new Response(JSON.stringify(TANYA_INDEX), { status: 200 });
    }) as typeof fetch;
    const reader = client(flaky);
    expect((await reader.index('Tanya')).title).toBe('Tanya');
    expect(reader.requests).toBe(2);
    const gone = client((async () => new Response('no', { status: 404 })) as typeof fetch);
    await expect(gone.index('Nothing')).rejects.toBeInstanceOf(SefariaError);
  });

  it('reads the licences Sefaria writes', () => {
    expect(sefariaLicence('CC-BY-NC')).toBe('cc-by-nc');
    expect(sefariaLicence('CC0')).toBe('cc0');
    expect(sefariaLicence('Public Domain')).toBe('public-domain');
    expect(sefariaLicence('CC-BY')).toBe('cc-by');
    expect(sefariaLicence('CC-BY-SA')).toBe('unknown');
    expect(sefariaLicence(undefined)).toBe('unknown');
  });
});

describe('the registry', () => {
  it('has Sefaria copies for the Alter Rebbe\'s seforim and the Sefaria-only works', () => {
    const ids = sefariaWorks().map((w) => w.id);
    for (const id of ['tanya', 'torah-or', 'likkutei-torah', 'shulchan-aruch-harav', 'siddur-weekday', 'maaneh-lashon']) expect(ids).toContain(id);
    for (const work of sefariaWorks()) for (const s of work.sources.filter((x) => x.source === 'sefaria')) expect(s.version).toBeTruthy();
  });

  it('links an edition to its page on Sefaria', () => {
    expect(editionUrl({ source: 'sefaria', sourceId: 'Tanya, Part I; Likkutei Amarim 1', language: 'he', version: KEHOT })).toBe(
      'https://www.sefaria.org/Tanya,_Part_I%3B_Likkutei_Amarim_1?vhe=Kehot_Publication_Society&lang=he',
    );
  });
});
