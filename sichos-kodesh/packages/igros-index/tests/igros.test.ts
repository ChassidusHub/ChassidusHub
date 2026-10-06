import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanHtml, hebrewNumeral, htmlToText, igrosImport, letterHtml, lettersByVolume, maanehHtml, parseHebrewNumeral, parseLetterNumber, readIgros, readIgrosOutput, readMaanos, readTags, yearFromDateLine } from '../src/index.js';

// Synthetic rows in the source's shape. The wording is invented for the
// test - no text from the source is in this repository.
const ROWS: Array<Record<string, string | null>> = [
  { vol: '1', idx: '1', Page_number: '<div>א</div>', book_page: 'ג', Igroys_bsd: '<p>ב"ה, א\' ניסן, תש"ט</p>', Igroys_address: '<p style="x">לכבוד</p>', Igroys_text: '<p></p><p> שלום   וברכה!</p><p>&nbsp;</p><div>שורה</div>', Igroys_signature: '<p><b>החותם</b></p>', Igroys_comment: '<p><b>הערה</b><b>:</b> מקור.</p>', Igroys_city: '', summary: 'תקציר', },
  { vol: '1', idx: '141a', Page_number: '<div>קמא*</div>', book_page: null, Igroys_bsd: '', Igroys_address: '', Igroys_text: '<p>תוספת</p>', Igroys_signature: '', Igroys_comment: '', Igroys_city: '', summary: null },
  // A slip in the source key: the printed numeral (4275) wins.
  { vol: '13', idx: '3275', Page_number: '<div>ד\'ערה</div>', book_page: 'ג', Igroys_bsd: '', Igroys_address: '', Igroys_text: '<p>א</p>', Igroys_signature: '', Igroys_comment: '', Igroys_city: '', summary: null },
  // A non-breaking space before the numeral, and no source key.
  { vol: '28', idx: ' ', Page_number: '<div>&nbsp;י\'עדרת</div>', book_page: null, Igroys_bsd: '<div>ב"ה</div>', Igroys_address: '', Igroys_text: '', Igroys_signature: '', Igroys_comment: '', Igroys_city: 'עיר', summary: null },
  // Out of order on purpose (תשדמ for 744).
  { vol: '18', idx: '6744', Page_number: '<div>ו\'תשדמ</div>', book_page: null, Igroys_bsd: '', Igroys_address: '', Igroys_text: '', Igroys_signature: '', Igroys_comment: '', Igroys_city: '', summary: null },
  { vol: '2', idx: '170', Page_number: '<div>קע</div>', book_page: null, Igroys_bsd: '', Igroys_address: '', Igroys_text: '', Igroys_signature: '', Igroys_comment: '', Igroys_city: '', summary: null },
  { vol: '2', idx: '170', Page_number: '<div>קע</div>', book_page: null, Igroys_bsd: '', Igroys_address: '', Igroys_text: '', Igroys_signature: '', Igroys_comment: '', Igroys_city: '', summary: null },
  { vol: 'x', idx: '9', Page_number: '<div>ט</div>', book_page: null, Igroys_bsd: '', Igroys_address: '', Igroys_text: '', Igroys_signature: '', Igroys_comment: '', Igroys_city: '', summary: null },
];

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'igros-index-'));
  const db = new DatabaseSync(join(dir, 'data.sqlite'));
  db.exec('CREATE TABLE `Igroys1` (`Page_number`, `Igroys_bsd`, `Igroys_city`, `Igroys_address`, `Igroys_text`, `Igroys_signature`, `Igroys_comment`, `idx`, `vol`, summary TEXT, book_page TEXT)');
  const insert = db.prepare('INSERT INTO Igroys1 (Page_number, Igroys_bsd, Igroys_city, Igroys_address, Igroys_text, Igroys_signature, Igroys_comment, idx, vol, summary, book_page) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of ROWS) {
    insert.run(row.Page_number ?? null, row.Igroys_bsd ?? null, row.Igroys_city ?? null, row.Igroys_address ?? null, row.Igroys_text ?? null, row.Igroys_signature ?? null, row.Igroys_comment ?? null, row.idx ?? null, row.vol ?? null, row.summary ?? null, row.book_page ?? null);
  }
  db.close();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('Hebrew numerals', () => {
  it('sums the letters, with a geresh for thousands, in any order', () => {
    expect(parseHebrewNumeral('תצו')).toBe(496);
    expect(parseHebrewNumeral("ג'ערה")).toBe(3275);
    expect(parseHebrewNumeral("ו'תשדמ")).toBe(6744);
    expect(parseHebrewNumeral("י'עדרת")).toBe(10674);
    expect(parseHebrewNumeral('ך')).toBe(20);
    expect(parseHebrewNumeral('12')).toBeNull();
  });

  it('reads asterisks as supplements', () => {
    expect(parseLetterNumber('קמא*')).toEqual({ number: 141, suffix: 'a', label: 'קמא*' });
    expect(parseLetterNumber('ריג *')).toEqual({ number: 213, suffix: 'a', label: 'ריג*' });
    expect(parseLetterNumber("ג'תקא**")).toEqual({ number: 3501, suffix: 'b', label: "ג'תקא**" });
    expect(parseLetterNumber("&nbsp;ט'תרלט")?.number).toBe(9639);
  });
});

describe('yearFromDateLine', () => {
  it('reads the year in its written forms', () => {
    expect(yearFromDateLine('ב"ה, ט"ו שבט, תשט"ו')).toBe(5715);
    expect(yearFromDateLine('ב"ה, כ"ג מנ"א, ה\'תשי"ז')).toBe(5717);
    expect(yearFromDateLine('ב"ה, ח\' מר-חשון, התש"י')).toBe(5710);
    expect(yearFromDateLine('ב"ה, ג\' תמוז, השי"ת')).toBe(5710);
    expect(yearFromDateLine('ב"ה, כ\' טבת, צ"ח')).toBe(5698);
    expect(yearFromDateLine('כ"א אדר פ"ח')).toBe(5688);
    expect(yearFromDateLine('ב"ה, ער"ח סיון, ש"ת')).toBe(5700);
  });

  it('takes the first year, and none from a line without one', () => {
    expect(yearFromDateLine('ב"ה, כ"ט תשרי, תש"ט ב"ה, ד\' ד\' אלול תש"ד')).toBe(5709);
    expect(yearFromDateLine('ב"ה, ב\' ניסן הלולא של כ"ק אדמו"ר נ"ע')).toBeNull();
    expect(yearFromDateLine('ב"ה, י"א מנ"א')).toBeNull();
    expect(yearFromDateLine('')).toBeNull();
  });
});

describe('cleanHtml / htmlToText', () => {
  it('keeps paragraphs and emphasis, drops attributes, empty paragraphs and other tags', () => {
    expect(cleanHtml('<p></p><p style="a"> שלום   <span>וברכה</span>!</p><p>&nbsp;</p><div>שורה</div>')).toBe('<p>שלום וברכה!</p><p>שורה</p>');
    expect(cleanHtml('<p><b>הערה</b><b>:</b> מקור<script>x()</script>.</p>')).toBe('<p><b>הערה:</b> מקור.</p>');
    expect(cleanHtml(null)).toBe('');
  });

  it('turns HTML into one line per paragraph with entities decoded', () => {
    expect(htmlToText('<p>א &amp; ב</p><p>&quot;ג&quot;&nbsp;ד&#1488;</p>')).toBe('א & ב\n"ג" דא');
  });
});

describe('readIgros', () => {
  it('reads every letter with the printed number as its id, in volume order', () => {
    const { letters, warnings } = readIgros(join(dir, 'data.sqlite'));
    expect(letters.map((l) => l.id)).toEqual(['igros:1', 'igros:141a', 'igros:170', 'igros:170-2', 'igros:4275', 'igros:6744', 'igros:10674']);
    const first = letters[0]!;
    expect(first).toMatchObject({ number: 1, suffix: '', numberLabel: 'א', volume: 1, bookPage: 'ג', dateLine: 'ב"ה, א\' ניסן, תש"ט', hebrewYear: 5709, city: '', summary: 'תקציר', sourceKey: '1' });
    expect(first.addressee).toBe('<p>לכבוד</p>');
    expect(first.body).toBe('<p>שלום וברכה!</p><p>שורה</p>');
    expect(first.notes).toBe('<p><b>הערה:</b> מקור.</p>');
    expect(letters.find((l) => l.id === 'igros:10674')).toMatchObject({ city: 'עיר', dateLine: 'ב"ה', hebrewYear: null, bookPage: null, sourceKey: '' });
    expect(warnings.map((w) => w.kind).sort()).toEqual(['bad-volume', 'duplicate-id', 'number-mismatch', 'number-mismatch']);
    expect(warnings.find((w) => w.detail.includes('4275'))?.detail).toContain('"3275"');
  });

  it('groups by volume', () => {
    const volumes = lettersByVolume(readIgros(join(dir, 'data.sqlite')).letters);
    expect([...volumes.keys()]).toEqual([1, 2, 13, 18, 28]);
    expect(volumes.get(2)?.length).toBe(2);
  });
});

describe('readMaanos / readTags', () => {
  it('reads each year file, skipping entries with no number', () => {
    const mini = join(dir, 'mini');
    mkdirSync(mini);
    writeFileSync(join(mini, '5742.json'), JSON.stringify([
      { hebnum: 'א', hebdate: '[תשרי]', text: '<p>מענה</p><p></p>', engnum: 1, year: 5742 },
      { hebnum: 'ב', hebdate: '', text: '<p>עוד</p>', engnum: 2, year: 5742 },
      { hebnum: 'ב', hebdate: '', text: '<p>שוב</p>', engnum: 2, year: 5742 },
      { hebnum: '', hebdate: '', text: '', engnum: null, year: 5742 },
    ]));
    writeFileSync(join(mini, 'notes.txt'), 'ignored');
    const { byYear, warnings } = readMaanos(mini);
    expect([...byYear.keys()]).toEqual([5742]);
    expect(byYear.get(5742)?.map((m) => m.id)).toEqual(['maanos:5742:1', 'maanos:5742:2', 'maanos:5742:2-2']);
    expect(byYear.get(5742)?.[0]).toEqual({ id: 'maanos:5742:1', year: 5742, number: 1, numberLabel: 'א', dateLine: '[תשרי]', body: '<p>מענה</p>' });
    expect(warnings.map((w) => w.kind).sort()).toEqual(['duplicate-id', 'no-number']);
  });

  it('reads the tag list in id order', () => {
    const path = join(dir, 'tags.json');
    writeFileSync(path, JSON.stringify([{ id: 2, origin: null, tags: 'ב' }, { id: 1, origin: null, tags: ' א ' }, { id: 3, tags: null }]));
    expect(readTags(path)).toEqual(['א', 'ב']);
  });
});

describe('text objects', () => {
  it('writes a letter in the reader\'s form: date and city to the end side, the signature too, the notes after it, where it is printed', () => {
    const [first] = readIgros(join(dir, 'data.sqlite')).letters;
    const html = letterHtml({ ...first!, city: 'עיר <א>', bookPage: 'טו' });
    expect(html).toBe(
      '<article dir="rtl" lang="he" data-id="igros:1"><p class="end">ב"ה, א\' ניסן, תש"ט</p><p class="end">עיר &lt;א&gt;</p>' +
        '<p>לכבוד</p><p>שלום וברכה!</p><p>שורה</p><p class="end"><b>החותם</b></p><aside class="notes"><p><b>הערה:</b> מקור.</p></aside>' +
        '<footer class="source">אגרות קודש חלק א, אגרת א, עמ׳ טו</footer></article>\n',
    );
    expect(letterHtml({ ...first!, city: 'עיר <א>', bookPage: 'טו' })).toBe(html);
  });

  it('writes a maaneh with only what it has', () => {
    expect(maanehHtml({ id: 'maanos:5742:1', year: 5742, number: 1, numberLabel: 'א', dateLine: '', body: '<p>מענה</p>' })).toBe(
      '<article dir="rtl" lang="he" data-id="maanos:5742:1"><p>מענה</p><footer class="source">מענות תשמ״ב, א</footer></article>\n',
    );
  });

  it('writes numbers as Hebrew numerals, bare or marked', () => {
    expect([1, 15, 16, 28, 141, 742].map((n) => hebrewNumeral(n))).toEqual(['א', 'טו', 'טז', 'כח', 'קמא', 'תשמב']);
    expect([5, 742].map((n) => hebrewNumeral(n, true))).toEqual(['ה׳', 'תשמ״ב']);
  });

  it('makes the Igros a work of volumes and letters, each letter a text object named by its sha256', () => {
    const { letters } = readIgros(join(dir, 'data.sqlite'));
    const { work, bundles } = igrosImport(letters);
    expect(work.workId).toBe('igros-kodesh-rebbe');
    expect(work.units.map((u) => u.id)).toEqual(letters.map((l) => l.id.replace('igros:', '')));
    expect(work.contents.map((node) => node.title.he)).toEqual(bundles.map((b) => `חלק ${hebrewNumeral(b.volume)}`));
    expect(work.contents.flatMap((node) => node.entries.map((e) => e.unitId))).toEqual(work.units.map((u) => u.id));
    const unit = work.units[0]!;
    const html = bundles[0]!.texts[0]!;
    expect(unit.label).toBe(`אגרת ${letters[0]!.numberLabel}`);
    expect(unit.editions[0]!.text).toEqual({ sha256: createHash('sha256').update(html, 'utf8').digest('hex'), bytes: Buffer.byteLength(html, 'utf8') });
    expect(unit.editions[0]).toMatchObject({ source: 'igros-app', sourceId: letters[0]!.id, kind: 'text', language: 'he' });
    expect(bundles.flatMap((b) => b.texts)).toHaveLength(letters.length);
  });

  it('reads the build output back', () => {
    const out = join(dir, 'out');
    mkdirSync(join(out, 'igros'), { recursive: true });
    mkdirSync(join(out, 'maanos'), { recursive: true });
    const { letters } = readIgros(join(dir, 'data.sqlite'));
    writeFileSync(join(out, 'igros', 'vol-02.json'), JSON.stringify({ volume: 2, letters: letters.filter((l) => l.volume === 2) }));
    writeFileSync(join(out, 'igros', 'vol-01.json'), JSON.stringify({ volume: 1, letters: letters.filter((l) => l.volume === 1) }));
    writeFileSync(join(out, 'maanos', '5742.json'), JSON.stringify({ year: 5742, maanos: [{ id: 'maanos:5742:1', year: 5742, number: 1, numberLabel: 'א', dateLine: '', body: '' }] }));
    const read = readIgrosOutput(out);
    expect(read.letters.map((l) => l.id)).toEqual(['igros:1', 'igros:141a', 'igros:170', 'igros:170-2']);
    expect(read.maanos.map((m) => m.id)).toEqual(['maanos:5742:1']);
    expect(() => readIgrosOutput(join(dir, 'nothing'))).toThrow('run build-igros first');
  });
});
