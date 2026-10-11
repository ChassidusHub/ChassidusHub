import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registerFile, type Catalog, type Json, type NewRevision } from '@chassidushub/core';
import { newId, orderKeys, type EntityId, type PageSegment, type PageText } from '@chassidushub/model';
import { withCatalog, type Context } from './commands.js';

/**
 * A small made-up catalog for local work (`npm run sample`), so the site
 * on a laptop shows real pages without production data: the Rebbeim's
 * shelves with a few official sefarim and their additions, volumes and
 * their sichos, a sefer with Hebrew words to read, a farbrengen with a
 * recording and its machine transcript, open suggestions to review, and a
 * report. Every word in it is sample text written for it, never a sefer's
 * own words: ChassidusHub's repository holds no texts (CLAUDE.md). The
 * audio is a soft tone made on the spot, written to the files folder the
 * API reads with FILES_DIR.
 *
 * The account given (`dev`) is a steward and the keeper of every set, so
 * `DEV_ACCOUNT=dev npm run dev:api` signs in as someone who may approve.
 * It loads into a local PGlite database only, and only once: a database
 * that has the sample's shelves already is left as it is.
 */

export const SAMPLE_PEOPLE = [
  { id: 'mendy', displayName: 'Mendy' },
  { id: 'chaim', displayName: 'Chaim' },
] as const;
export const SAMPLE_TRANSCRIBER = 'bot:transcribe';

/** Words written for the sample, in the shape of a sefer's paragraphs; every page says it is a sample. */
const SAMPLE_WORDS = [
  'זוהי פסקה לדוגמה. כאן יופיעו דברי הספר כפי שנדפסו, פסקה אחר פסקה, וכל אחד יכול להציע תיקון לכל שורה.',
  'פסקה שניה לדוגמה, ארוכה מעט מן הראשונה, כדי לראות איך נראים כמה שורות זו אחר זו בעמוד הקריאה, בטלפון ובמחשב, באור ובחושך.',
  'פסקה שלישית לדוגמה, עם מראה מקום בסופה (עיין לעיל פרק א).',
  'פסקה רביעית ואחרונה לדוגמה. בעמוד אמיתי היו כאן דברי הספר עצמם.',
];
const SAMPLE_GLOSS = 'הגהה לדוגמה: כך נראית הערה הנדפסת בצד הדברים.';
/** A farbrengen's lines as the transcriber would hear them, written for the sample. */
const SAMPLE_HEARD = [
  'דאָס איז אַ שורה לדוגמה פון אַ תמליל.',
  'יעדע שורה ווערט געהערט מיט איר צייט, וואָרט ביי וואָרט.',
  'אַ מענטש קען הערן און זאָגן: ריכטיק, פאַרבעסערן, אָדער ניט זיכער.',
  'אַזוי ווערט דער תמליל געפּרוּפט, שורה נאָך שורה.',
  'דאָס איז די לעצטע שורה לדוגמה.',
];
const LINE_MS = 6000;

type Six = [EntityId, EntityId, EntityId, EntityId, EntityId, EntityId];

export interface SampleResult {
  loaded: boolean;
  account: string;
  paths: string[];
  suggestions: number[];
  audio?: string;
}

export async function loadSample(catalog: Catalog, input: { account: string; filesDir?: string; log?: (line: string) => void }): Promise<SampleResult> {
  const log = input.log ?? (() => {});
  const me = input.account;
  if (await catalog.resolvePath('/sets/the-rebbe')) return { loaded: false, account: me, paths: [], suggestions: [] };

  await catalog.createAccount({ id: me, displayName: me });
  await catalog.db.query('UPDATE account SET is_steward = TRUE WHERE id = $1', [me]);
  for (const person of SAMPLE_PEOPLE) await catalog.createAccount(person);
  await catalog.createAccount({ id: SAMPLE_TRANSCRIBER, displayName: 'Machine transcription', isBot: true });

  const paths: string[] = [];
  /** One approved suggestion by the account, as the catalog's own starting state; the new items' ids in order (six at most). */
  async function approved(title: string, by: string, items: NewRevision[]): Promise<Six> {
    const cs = await catalog.createChangeset(by, { title });
    const ids = await catalog.putRevisions(cs.id, by, items);
    await catalog.submit(cs.id, by);
    if ((await catalog.changeset(cs.id)).status !== 'merged') await catalog.merge(cs.id, me);
    for (const item of items) if (item.path) paths.push(item.path);
    return ids as Six;
  }
  const set = (he: string, en: string, slug: string, order: string, parent?: EntityId) =>
    ({ type: 'set', path: `/sets/${slug}`, data: { name: { he, en }, slug, policy: 'moderated', keepers: [me], order, ...(parent ? { parent } : {}) } }) satisfies NewRevision;

  // The Rebbeim's shelves, as the live catalog's tree has them (two of the seven), and the farbrengens.
  const [alterRebbe, rebbe, alterRebbeShelf, rebbeShelf, farbrengens] = await approved('Sample: the Rebbeim and their shelves', me, [
    { type: 'author', data: { name: { he: 'אדמו״ר הזקן', en: 'The Alter Rebbe' }, kind: 'rebbe', rebbe: 1, slug: 'alter-rebbe' } },
    { type: 'author', data: { name: { he: 'כ״ק אדמו״ר', en: 'The Rebbe' }, kind: 'rebbe', rebbe: 7, slug: 'the-rebbe' } },
    set('אדמו״ר הזקן', 'The Alter Rebbe', 'alter-rebbe', '8'),
    set('כ״ק אדמו״ר', 'The Rebbe', 'the-rebbe', 'K'),
    set('התוועדויות', 'Farbrengens', 'farbrengens', 'b'),
  ]);
  const [lsShelf, maamarimShelf] = await approved("Sample: the Rebbe's sefarim shelves", me, [
    set('לקוטי שיחות', 'Likkutei Sichos', 'the-rebbe-likkutei-sichos', '8', rebbeShelf),
    set('ספר המאמרים', 'Sefer HaMaamarim', 'the-rebbe-maamarim', 'O', rebbeShelf),
  ]);

  const work = (he: string, en: string, slug: string, author: EntityId, sets: EntityId[], genre: string, levels: string[], extra: Record<string, unknown> = {}) =>
    ({ type: 'work', path: `/${slug}`, data: { title: { he, en }, slug, authors: [author], genre, levels, sets, ...extra } }) satisfies NewRevision;
  const [tanya, , likkuteiSichos, hayomYom, , maamarim] = await approved('Sample: sefarim', me, [
    work('תניא', 'Tanya', 'tanya', alterRebbe, [alterRebbeShelf], 'chassidus', ['part', 'chapter']),
    work('תורה אור', 'Torah Or', 'torah-or', alterRebbe, [alterRebbeShelf], 'chassidus', ['parsha']),
    work('לקוטי שיחות', 'Likkutei Sichos', 'likkutei-sichos', rebbe, [lsShelf], 'sichos', ['volume', 'sicha']),
    work('היום יום', 'Hayom Yom', 'hayom-yom', rebbe, [rebbeShelf], 'chassidus', ['month', 'day']),
    work('ענינה של תורת החסידות', 'Inyanah shel Toras HaChassidus', 'inyanah-shel-toras-hachassidus', rebbe, [rebbeShelf], 'chassidus', ['chapter']),
    work('ספר המאמרים מלוקט', 'Sefer HaMaamarim Melukat', 'sefer-hamaamarim-melukat', rebbe, [maamarimShelf], 'maamarim', ['volume', 'maamar']),
  ]);
  // Additions: one to a sefer, shown on its page, and one to no sefer, apart at the end of the shelf.
  await approved('Sample: additions', me, [
    work('ביאורים להיום יום', 'Biurim on Hayom Yom', 'hayom-yom-biurim', rebbe, [rebbeShelf], 'chassidus', ['day'], { addition: { kind: 'commentary', to: hayomYom } }),
    work('ספר המפתחות', 'Sefer HaMafteichos', 'sefer-hamafteichos', rebbe, [rebbeShelf], 'chassidus', [], { addition: { kind: 'index' } }),
    work('שיעורים בספר התניא', 'Lessons in Tanya', 'lessons-in-tanya', alterRebbe, [alterRebbeShelf], 'chassidus', ['chapter'], { addition: { kind: 'commentary', to: tanya } }),
  ]);

  // Tanya: three chapters of sample words, to read and to fix.
  const chapters = ['א', 'ב', 'ג'];
  const tanyaUnits = await approved('Sample: Tanya chapters', me, chapters.map((he, i) => ({
    type: 'unit',
    path: `/tanya/1/${i + 1}`,
    data: {
      work: tanya,
      position: [
        { level: 'part', value: '1', label: { he: 'ליקוטי אמרים', en: 'Likkutei Amarim' } },
        { level: 'chapter', value: String(i + 1), label: { he: `פרק ${he}`, en: `Chapter ${i + 1}` } },
      ],
      order: orderKeys(chapters.length)[i]!,
      label: { he: `ליקוטי אמרים, פרק ${he}`, en: `Likkutei Amarim, Chapter ${i + 1}` },
      body: sampleBody(i === 0) as unknown as Json,
    },
  })));

  // Likkutei Sichos: three volumes of sichos, by label only, so a shelf shows volume counts.
  const sichos: Array<[string, string, string]> = [['1', 'בראשית', 'Bereishis'], ['1', 'נח', 'Noach'], ['1', 'לך לך', 'Lech Lecha'], ['2', 'ויקרא', 'Vayikra'], ['2', 'צו', 'Tzav'], ['3', 'דברים', 'Devarim']];
  const lsOrders = orderKeys(sichos.length);
  await approved('Sample: Likkutei Sichos volumes', me, sichos.map(([volume, he, en], i) => ({
    type: 'unit',
    path: `/likkutei-sichos/${volume}/${i + 1}`,
    data: {
      work: likkuteiSichos,
      position: [
        { level: 'volume', value: volume, label: { he: `חלק ${['א', 'ב', 'ג'][Number(volume) - 1]}׳` } },
        { level: 'sicha', value: String(i + 1) },
      ] as Json,
      order: lsOrders[i]!,
      label: { he, en },
    },
  })));
  const days: Array<[string, string, string]> = [['1', 'כ״ד טבת', '24 Teves'], ['2', 'י׳ שבט', '10 Shvat'], ['3', 'י״א ניסן', '11 Nissan']];
  await approved('Sample: Hayom Yom days', me, days.map(([n, he, en], i) => ({
    type: 'unit',
    path: `/hayom-yom/${n}`,
    data: { work: hayomYom, position: [{ level: 'month', value: n }, { level: 'day', value: '1' }], order: orderKeys(days.length)[i]!, label: { he, en } },
  })));
  await approved('Sample: a maamar', me, [
    { type: 'unit', path: '/sefer-hamaamarim-melukat/1/1', data: { work: maamarim, position: [{ level: 'volume', value: '1' }, { level: 'maamar', value: '1' }], order: 'a0', label: { he: 'באתי לגני', en: 'Basi LeGani' } } },
  ]);

  // A farbrengen with a recording, its audio a tone made here, and a machine transcript of it.
  const audio = sampleTone(SAMPLE_HEARD.length * LINE_MS);
  const sha256 = createHash('sha256').update(audio).digest('hex');
  if (input.filesDir) {
    const target = join(input.filesDir, 'public', 'objects', sha256);
    await mkdir(join(input.filesDir, 'public', 'objects'), { recursive: true });
    await writeFile(target, audio);
    await registerFile(catalog.db, { sha256, bytes: audio.byteLength, mime: 'audio/wav', source: 'contribution', licence: 'cc0', held: true, uploadedBy: me });
  }
  const [event] = await approved('Sample: a farbrengen', me, [
    { type: 'event', path: '/events/5742-05-10', data: { kind: 'farbrengen', title: { he: 'יו״ד שבט תשמ״ב (לדוגמה)', en: 'Yud Shvat 5742 (sample)' }, date: '5742-05-10', sets: [farbrengens] } },
  ]);
  const [recording] = await approved('Sample: its recording', me, [
    { type: 'recording', data: { event: event!, title: { he: 'הקלטה לדוגמה', en: 'Sample recording' }, part: 1, language: 'yi', durationMs: SAMPLE_HEARD.length * LINE_MS, ...(input.filesDir ? { file: sha256 } : {}) } },
  ]);
  const transcript = await catalog.createChangeset(SAMPLE_TRANSCRIBER, { title: `Machine transcript of ${recording} (sample)` });
  const origin = { by: 'transcribe:sample@1' };
  const text = await catalog.putRevision(transcript.id, SAMPLE_TRANSCRIBER, { type: 'text', data: { kind: 'transcript', recording, language: 'yi' } });
  const alignment = await catalog.putRevision(transcript.id, SAMPLE_TRANSCRIBER, { type: 'alignment', data: { recording, text, granularity: 'word', engine: { name: 'sample', version: '1' } } });
  const lineOrders = orderKeys(SAMPLE_HEARD.length);
  const segments: EntityId[] = [];
  const lines: NewRevision[] = [];
  for (const [i, words] of SAMPLE_HEARD.entries()) {
    const segment = newId();
    segments.push(segment);
    const startMs = i * LINE_MS;
    lines.push({ id: segment, type: 'segment', data: { text, order: lineOrders[i]!, kind: 'paragraph', content: words, proofread: 0, origin } });
    lines.push({ type: 'alignment-span', data: { alignment, segment, startMs, endMs: startMs + LINE_MS, words: wordTimes(words, startMs, LINE_MS), origin } as unknown as Json });
  }
  await catalog.putRevisions(transcript.id, SAMPLE_TRANSCRIBER, lines);
  await catalog.submit(transcript.id, SAMPLE_TRANSCRIBER);
  if ((await catalog.changeset(transcript.id)).status !== 'merged') await catalog.merge(transcript.id, me);

  // Open suggestions, for /review: a fix to a sefer's words, a new sicha, a fix to the transcript.
  const suggestions: number[] = [];
  async function open(title: string, by: string, items: NewRevision[]): Promise<void> {
    const cs = await catalog.createChangeset(by, { title });
    await catalog.putRevisions(cs.id, by, items);
    await catalog.submit(cs.id, by);
    suggestions.push(cs.id);
  }
  const chapter = (await catalog.get(tanyaUnits[1]!))!;
  const fixed = structuredClone(chapter.data) as unknown as { body: PageText };
  const first = fixed.body.versions[0]!.segments[0]!;
  first.text = [{ text: SAMPLE_WORDS[0]!.replace('דברי הספר', 'דברי הספר הקדוש') }];
  await open('Tanya ch. 2: a word missing in the first paragraph', 'mendy', [{ id: chapter.id, type: 'unit', data: fixed as unknown as Json }]);
  await open('Likkutei Sichos 3: add Vaeschanan', 'chaim', [
    { type: 'unit', path: '/likkutei-sichos/3/7', data: { work: likkuteiSichos, position: [{ level: 'volume', value: '3', label: { he: 'חלק ג׳' } }, { level: 'sicha', value: '7' }], order: `${lsOrders.at(-1)!}V`, label: { he: 'ואתחנן', en: 'Vaeschanan' } } },
  ]);
  const line = (await catalog.get(segments[1]!))!;
  await open('Transcript: fix a word in line 2', 'mendy', [
    { id: line.id, type: 'segment', data: { ...(line.data as Record<string, Json>), content: SAMPLE_HEARD[1]!.replace('וואָרט ביי וואָרט', 'וואָרט נאָך וואָרט'), origin: { ...origin, edited: true } } },
  ]);
  await catalog.report({ entityId: event, reason: 'audio-problem', title: 'The sample recording is only a tone', note: 'A report made by the sample catalog, to see the issues list.', reporter: 'chaim' });

  log(`sample catalog loaded: ${paths.length} pages, ${suggestions.length} open suggestions${input.filesDir ? `, audio in ${input.filesDir}` : ' (no audio: give --files)'}`);
  return { loaded: true, account: me, paths, suggestions, audio: input.filesDir ? sha256 : undefined };
}

/** A sefer's page of sample words: a heading, the paragraphs, and on the first a gloss and a footnote. */
function sampleBody(withNotes: boolean): PageText {
  const segments: PageSegment[] = [
    { id: 'h1', kind: 'heading', level: 2, text: [{ text: 'עמוד לדוגמה' }] },
    ...SAMPLE_WORDS.map((words, i): PageSegment => {
      const [open, ...rest] = words.split(' ');
      const note = withNotes && i === 2 ? [{ note: 'n1' }] : [];
      return { id: `p${i + 1}`, kind: 'paragraph', text: [{ text: open!, marks: ['b'] }, { text: ` ${rest.join(' ')}` }, ...note] };
    }),
  ];
  if (withNotes) segments.splice(2, 0, { id: 'g1', kind: 'paragraph', text: [{ text: SAMPLE_GLOSS, marks: ['small'] }] });
  return {
    profile: 'sichos-kodesh',
    versions: [{ id: 'he', language: 'he', title: 'לדוגמה', segments, ...(withNotes ? { notes: [{ id: 'n1', kind: 'note', n: 1, text: [{ text: 'הערה לדוגמה.' }] }] } : {}) }],
  };
}

/** Each word's place and time in a line heard over `ms`, the words spread evenly. */
function wordTimes(line: string, startMs: number, ms: number): Array<{ from: number; to: number; startMs: number; endMs: number }> {
  const words = [...line.matchAll(/\S+/g)];
  const each = Math.floor(ms / Math.max(words.length, 1));
  return words.map((m, i) => ({ from: m.index!, to: m.index! + m[0].length, startMs: startMs + i * each, endMs: startMs + (i + 1) * each }));
}

/** A soft tone that rises a little each line, as an 8 kHz, 8-bit mono WAV. */
function sampleTone(ms: number): Uint8Array {
  const rate = 8000;
  const samples = Math.floor((rate * ms) / 1000);
  const wav = new Uint8Array(44 + samples);
  const view = new DataView(wav.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const line = Math.floor((t * 1000) / LINE_MS);
    const fade = Math.min(1, ((t * 1000) % LINE_MS) / 200, (LINE_MS - ((t * 1000) % LINE_MS)) / 200);
    wav[44 + i] = 128 + Math.round(20 * fade * Math.sin(2 * Math.PI * (220 + 20 * line) * t));
  }
  return wav;
}

/** `chassidushub sample`: the sample catalog into a local PGlite database (never a Postgres server). */
export async function sampleCommand(ctx: Context, input: { account?: string; files?: string }): Promise<void> {
  const target = ctx.database ?? process.env.DATABASE_URL ?? '.data/pglite';
  if (/^postgres(ql)?:\/\//.test(target)) throw new Error('the sample catalog is for a local PGlite database only; unset DATABASE_URL');
  await mkdir(target, { recursive: true });
  const account = input.account ?? 'dev';
  const files = input.files ?? '.data/files';
  await withCatalog({ ...ctx, database: target }, async (catalog) => {
    const result = await loadSample(catalog, { account, filesDir: files, log: ctx.log });
    if (!result.loaded) ctx.log(`the sample catalog is in ${target} already; delete that folder to load it afresh`);
  });
  ctx.log(`next: DEV_ACCOUNT=${account} FILES_DIR=${files} npm run dev:api, and npm run dev:web beside it (docs/local-sample.md)`);
}
