import { createServer } from 'node:http';
import { itemToolsAnswer } from './fixture-item-tools';
import { libraryAnswer } from './fixture-library';
import { snapshotAnswer } from './fixture-snapshot';
import { listenAnswer, paragraphWords, shelves } from './fixture-listen';
import { searchAnswer } from './fixture-search';
import { suggestionsAnswer } from './fixture-suggestions';
import { servePeople } from './fixture-people';
import { projectPagesAnswer } from './fixture-project-pages';
import { stewardsAnswer } from './fixture-stewards';

/**
 * A stand-in for the ChassidusHub API in the browser tests: GET /v1/view for
 * a few made-up pages, so the reading page is tested without a database,
 * listening's reads (fixture-listen.ts), the library's (fixture-library.ts),
 * search's (fixture-search.ts),
 * and POST /v1/fix as a signed-in reader (the cookie rh_session=sample) or a
 * signed-out one; and signing in and the account (/v1/auth/*) the same way.
 * Every word here is sample text written for the tests (לדוגמה), never a
 * sefer's own words. `FIXTURE_PORT` picks the port (default 3002).
 */
const name = (he: string) => ({ he });
const bar = (unit: 1 | 2) => [
  { kind: 'set', chosen: { id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }, choices: [{ id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }] },
  { kind: 'work', chosen: { id: 'rh-aaaaaaa2', path: '/sample', name: name('ספר לדוגמה') }, choices: [{ id: 'rh-aaaaaaa2', path: '/sample', name: name('ספר לדוגמה') }] },
  { kind: 'part', level: 'volume', chosen: { path: '/sample/1', name: name('חלק א׳'), value: '1' }, choices: [{ path: '/sample/1', name: name('חלק א׳'), value: '1' }] },
  {
    kind: 'unit',
    level: 'sicha',
    chosen: { id: `rh-aaaaaab${unit}`, path: `/sample/1/${unit}`, name: name(unit === 1 ? 'שיחה ראשונה' : 'שיחה שניה') },
    choices: [
      { id: 'rh-aaaaaab1', path: '/sample/1/1', name: name('שיחה ראשונה') },
      { id: 'rh-aaaaaab2', path: '/sample/1/2', name: name('שיחה שניה') },
    ],
  },
];
const words = (text: string) => [{ text }];

/** A sefer of hisvaaduyos' path bar (app/views/hisvaaduyos.tsx): a volume's units, a maamar and the sichos of the same farbrengen. */
const hvBar = (unit: 3 | 4) => [
  { kind: 'set', chosen: { id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }, choices: [{ id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }] },
  { kind: 'work', chosen: { id: 'rh-aaaaaav1', path: '/sample-hisvaaduyos', name: name('התוועדויות לדוגמה') }, choices: [{ id: 'rh-aaaaaav1', path: '/sample-hisvaaduyos', name: name('התוועדויות לדוגמה') }] },
  { kind: 'part', level: 'volume', chosen: { path: '/sample-hisvaaduyos/11', name: name('כרך יא'), value: '11' }, choices: [{ path: '/sample-hisvaaduyos/11', name: name('כרך יא'), value: '11' }] },
  {
    kind: 'unit',
    level: 'farbrengen',
    chosen: unit === 3 ? { id: 'rh-aaaaaav3', path: '/sample-hisvaaduyos/11/3', name: name('מאמר לדוגמה · יו"ד שבט ה\'תשי"ד') } : { id: 'rh-aaaaaav4', path: '/sample-hisvaaduyos/11/4', name: name('שיחת יום לדוגמה, יו"ד שבט ה\'תשי"ד') },
    choices: [
      { id: 'rh-aaaaaav2', path: '/sample-hisvaaduyos/11/2', name: name('מברק לדוגמה, ה\'תשי"ד') },
      { id: 'rh-aaaaaav3', path: '/sample-hisvaaduyos/11/3', name: name('מאמר לדוגמה · יו"ד שבט ה\'תשי"ד') },
      { id: 'rh-aaaaaav4', path: '/sample-hisvaaduyos/11/4', name: name('שיחת יום לדוגמה, יו"ד שבט ה\'תשי"ד') },
      { id: 'rh-aaaaaav5', path: '/sample-hisvaaduyos/11/5', name: name('שיחת שבת לדוגמה, י"ב שבט ה\'תשי"ד') },
    ],
  },
];
const machine = { by: 'ocr', model: 'sample', checked: false };

/** Hayom Yom's path bar (app/views/daybook.tsx): the sefer, the month, and the month's days. */
const dayBar = (day: 1 | 2) => [
  { kind: 'set', chosen: { id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }, choices: [{ id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }] },
  { kind: 'work', chosen: { id: 'rh-aaaaaah1', path: '/hayom-yom', name: name('היום יום') }, choices: [{ id: 'rh-aaaaaah1', path: '/hayom-yom', name: name('היום יום') }] },
  { kind: 'part', level: 'day', chosen: { path: '/hayom-yom/1', name: name('<h2>כסלו</h2>'), value: '1' }, choices: [{ path: '/hayom-yom/1', name: name('<h2>כסלו</h2>'), value: '1' }] },
  {
    kind: 'unit',
    level: 'unit',
    chosen: { id: `rh-aaaaaah${day + 1}`, path: `/hayom-yom/1/${day}`, name: name(day === 1 ? '<h3>יט כסלו</h3>' : '<h3>כ כסלו</h3>') },
    choices: [
      { id: 'rh-aaaaaah2', path: '/hayom-yom/1/1', name: name('<h3>יט כסלו</h3>') },
      { id: 'rh-aaaaaah3', path: '/hayom-yom/1/2', name: name('<h3>כ כסלו</h3>') },
    ],
  },
];
const hayomYomDay = (day: 1 | 2) => ({
  label: name(day === 1 ? '<h3>יט כסלו</h3>' : '<h3>כ כסלו</h3>'),
  position: [{ label: name('<h2>כסלו</h2>'), level: 'day', value: '1' }, { level: 'unit', value: String(day) }],
});
const scanned = { by: 'ocr:tesseract-heb+claude' };

/** Tanya (app/views/chapters.tsx): a part's chapters in the path bar, the approbations three pages under one name. */
const tanyaBar = (chapter: 3 | 4) => [
  { kind: 'set', chosen: { id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }, choices: [{ id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }] },
  { kind: 'work', chosen: { id: 'rh-aaaaaat1', path: '/tanya', name: name('תניא') }, choices: [{ id: 'rh-aaaaaat1', path: '/tanya', name: name('תניא') }] },
  { kind: 'part', chosen: { path: '/tanya/1', name: name('חלק ראשון; ליקוטי אמרים'), value: '1' }, choices: [{ path: '/tanya/1', name: name('חלק ראשון; ליקוטי אמרים'), value: '1' }] },
  {
    kind: 'unit',
    chosen: { id: `rh-aaaaaat${chapter}`, path: `/tanya/1/${chapter}`, name: name(chapter === 3 ? 'חלק ראשון; ליקוטי אמרים, הקדמת המלקט' : 'חלק ראשון; ליקוטי אמרים, פרק א׳'), value: String(chapter) },
    choices: [
      { path: '/tanya/1/2/1', name: name('חלק ראשון; ליקוטי אמרים, הסכמות, פרק א׳'), value: '2' },
      { path: '/tanya/1/2/2', name: name('חלק ראשון; ליקוטי אמרים, הסכמות, פרק ב׳'), value: '2' },
      { id: 'rh-aaaaaat3', path: '/tanya/1/3', name: name('חלק ראשון; ליקוטי אמרים, הקדמת המלקט'), value: '3' },
      { id: 'rh-aaaaaat4', path: '/tanya/1/4', name: name('חלק ראשון; ליקוטי אמרים, פרק א׳'), value: '4' },
    ],
  },
];
const tanyaVersions = [
  { version: 'he', from: 'body', language: 'he', title: 'Kehot Publication Society' },
  { version: 'en', from: 'body', language: 'en', title: 'Kehot Publication Society (English Translation)' },
];
const tanyaChapter = (language: 'he' | 'en') => ({
  item: { id: 'rh-aaaaaat4', type: 'unit', path: '/tanya/1/4', rev: 1, data: { label: name('חלק ראשון; ליקוטי אמרים, פרק א׳'), position: [{ level: 'part', value: '1' }, { level: 'chapter', value: '4' }] } },
  pathBar: tanyaBar(4),
  previous: { id: 'rh-aaaaaat3', path: '/tanya/1/3', name: name('חלק ראשון; ליקוטי אמרים, הקדמת המלקט') },
  next: null,
  text: {
    kind: 'words',
    from: 'body',
    version: language,
    language,
    profile: 'sefaria',
    segments:
      language === 'he'
        ? [
            { n: 1, id: '1', kind: 'verse', text: [{ marker: '[מ: כד כסלו]' }, { text: ' ' }, { text: 'פתיחה', marks: ['b'] }, { text: ' לדוגמה.' }] },
            { n: 2, id: '2', kind: 'verse', text: words('פסקה שניה לדוגמה.') },
          ]
        : [
            { n: 1, id: '1', kind: 'verse', text: [{ text: 'An opening, for example.' }, { note: 'n1' }] },
            { n: 2, id: '2', kind: 'verse', text: words('A second paragraph, for example.') },
          ],
    notes: language === 'he' ? [] : [{ n: 1, id: 'n1', kind: 'note', text: words('A note of the translation.') }],
    machine: 'none',
    versions: tanyaVersions,
  },
});

/** Shulchan Aruch HaRav (app/views/chapters.tsx): a siman whose first block holds the print's preface and the siman's name; its Mahadura Tinyana among the path bar's units. */
const sahBar = [
  { kind: 'set', chosen: { id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }, choices: [{ id: 'rh-aaaaaaa1', path: '/sets/sample', name: name('מדף לדוגמה') }] },
  { kind: 'work', chosen: { id: 'rh-aaaaaas0', path: '/shulchan-aruch-harav', name: name('שולחן ערוך') }, choices: [{ id: 'rh-aaaaaas0', path: '/shulchan-aruch-harav', name: name('שולחן ערוך') }] },
  { kind: 'part', chosen: { path: '/shulchan-aruch-harav/2', name: name('אורח חיים'), value: '2' }, choices: [{ path: '/shulchan-aruch-harav/2', name: name('אורח חיים'), value: '2' }] },
  {
    kind: 'unit',
    chosen: { id: 'rh-aaaaaas2', path: '/shulchan-aruch-harav/2/2', name: name('אורח חיים, סימן א׳'), value: '2' },
    choices: [
      { id: 'rh-aaaaaas1', path: '/shulchan-aruch-harav/2/1/1', name: name('אורח חיים, מהדורא תניינא, סימן א׳'), value: '1' },
      { id: 'rh-aaaaaas2', path: '/shulchan-aruch-harav/2/2', name: name('אורח חיים, סימן א׳'), value: '2' },
    ],
  },
];

const views: Record<string, unknown> = {
  '/sample/1/1': {
    item: { id: 'rh-aaaaaab1', type: 'unit', path: '/sample/1/1', rev: 1, data: { label: name('שיחה ראשונה') } },
    pathBar: bar(1),
    previous: null,
    next: { id: 'rh-aaaaaab2', path: '/sample/1/2', name: name('שיחה שניה') },
    scan: { scan: 'rh-aaaaaas1', file: 'f'.repeat(64), firstPage: 7, lastPage: 9, publication: 'rh-aaaaaap1', url: 'https://files.example.org/sample.pdf' },
    recordings: [
      { id: 'rh-aaaaaar1', path: null, name: name('הקלטה ראשונה'), durationMs: 3_725_000 },
      { id: 'rh-aaaaaar2', path: null, name: name('הקלטה שניה'), durationMs: null },
    ],
    text: {
      kind: 'words',
      from: 'body',
      version: 'he',
      language: 'he',
      profile: 'sichos-kodesh',
      segments: [
        { id: 'h1', kind: 'heading', text: words('שיחה ראשונה') },
        { id: 'p1', kind: 'paragraph', text: [{ text: 'א.', marks: ['ois'] }, { text: ' פסקה ראשונה לדוגמה, ובה ' }, { text: 'מילה מודגשת', marks: ['b'] }, { text: ' והערה' }, { note: 'n1' }, { text: '.' }] },
        { id: 'p2', kind: 'paragraph', text: [{ text: 'פסקה שניה לדוגמה, עם הערה נוספת' }, { note: 'n2' }, { text: ' ועוד כמה מילים.' }] },
        { id: 'p3', kind: 'paragraph', end: true, text: words('חתימה לדוגמה') },
      ],
      notes: [
        { id: 'n1', kind: 'note', n: 1, text: words('הערה ראשונה לדוגמה.') },
        { id: 'n2', kind: 'note', n: 2, text: words('הערה שניה לדוגמה.') },
      ],
      machine: 'none',
      versions: [
        { version: 'he', from: 'body', language: 'he' },
        { version: 'en', from: 'body', language: 'en' },
      ],
    },
  },
  '/sample/1/2': {
    item: { id: 'rh-aaaaaab2', type: 'unit', path: '/sample/1/2', rev: 1, data: { label: name('שיחה שניה') } },
    pathBar: bar(2),
    previous: { id: 'rh-aaaaaab1', path: '/sample/1/1', name: name('שיחה ראשונה') },
    next: null,
    text: {
      kind: 'words',
      from: 'body',
      version: 'he',
      language: 'he',
      profile: 'sichos-kodesh',
      segments: [
        { id: 'p1', kind: 'paragraph', text: words('פסקה שקראה מכונה לדוגמה, ועוד לא נבדקה בידי אדם.'), origin: machine },
        { id: 'p2', kind: 'paragraph', text: words('עוד פסקה שקראה מכונה לדוגמה.'), origin: machine },
      ],
      notes: [],
      machine: 'all',
      versions: [{ version: 'he', from: 'body', language: 'he' }],
    },
  },
  '/sample/1/4': {
    item: {
      id: 'rh-aaaaaab4',
      type: 'unit',
      path: '/sample/1/4',
      rev: 1,
      data: {
        label: name('שיחה רביעית'),
        editions: [
          { kind: 'pdf', role: 'translated', label: 'תרגום לדוגמה', url: 'https://drive.google.com/file/d/sample-translated/view' },
          { kind: 'pdf', role: 'sicha', label: 'drive', url: 'https://drive.google.com/file/d/sample-printed/view' },
        ],
      },
    },
    pathBar: bar(2),
    previous: null,
    next: null,
    text: null,
  },
  // A letter (app/views/letters.tsx): its unit's level is `letter`, and the catalog knows its date, place and addressee.
  '/sample/1/5': {
    item: {
      id: 'rh-aaaaaab5',
      type: 'unit',
      path: '/sample/1/5',
      rev: 1,
      data: {
        label: name('אגרת לדוגמה'),
        position: [{ level: 'volume', value: '1' }, { level: 'letter', value: '5' }],
        date: '5709-01-09',
        place: name('עיר לדוגמה'),
        to: name('נמען לדוגמה'),
        editions: [{ kind: 'scan', role: 'manuscript', source: 'sample', sourceId: 'x', licence: 'free-to-read', url: 'https://files.example.org/letter.jpg' }],
      },
    },
    pathBar: bar(2),
    previous: { id: 'rh-aaaaaab2', path: '/sample/1/2', name: name('שיחה שניה') },
    next: null,
    text: {
      kind: 'words',
      from: 'body',
      version: 'he',
      language: 'he',
      profile: 'sichos-kodesh',
      segments: [
        { id: 'p1', kind: 'paragraph', end: true, text: words('ב"ה, תאריך לדוגמה') },
        { id: 'p2', kind: 'paragraph', text: words('כבוד הנמען לדוגמה') },
        { id: 'p3', kind: 'paragraph', text: words('שלום וברכה!') },
        { id: 'p4', kind: 'paragraph', text: [{ text: 'גוף המכתב לדוגמה, ובו הערה' }, { note: 'n2' }, { text: '.' }] },
        { id: 'p5', kind: 'paragraph', text: words('עוד פסקה לדוגמה.') },
        { id: 'p6', kind: 'paragraph', end: true, text: words('חתימה לדוגמה') },
      ],
      notes: [
        { id: 'n1', kind: 'note', text: words('הערה על המכתב כולו לדוגמה.') },
        { id: 'n2', kind: 'note', text: words('הערה מסומנת לדוגמה.') },
      ],
      machine: 'none',
      versions: [{ version: 'he', from: 'body', language: 'he' }],
    },
  },
  // The same letter, its labels a machine's guess nobody checked yet.
  '/sample/1/6': {
    item: {
      id: 'rh-aaaaaab6',
      type: 'unit',
      path: '/sample/1/6',
      rev: 1,
      data: { label: name('אגרת שניה לדוגמה'), position: [{ level: 'volume', value: '1' }, { level: 'letter', value: '6' }], place: name('עיר לדוגמה'), labelOrigin: { by: 'catalog:labeller', checked: false } },
    },
    pathBar: bar(2),
    previous: null,
    next: null,
    text: { kind: 'words', from: 'body', version: 'he', language: 'he', profile: 'sichos-kodesh', segments: [{ id: 'p1', kind: 'paragraph', text: words('גוף המכתב לדוגמה.') }], notes: [], machine: 'none', versions: [{ version: 'he', from: 'body', language: 'he' }] },
  },
  // A farbrengen of a sefer of hisvaaduyos (app/views/hisvaaduyos.tsx): a unit whose own level is `farbrengen`, the maamar said
  // there printed before it, its sections א to ה, its stage lines, its print's בלתי מוגה line, and its recording.
  '/sample-hisvaaduyos/11/4': {
    item: { id: 'rh-aaaaaav4', type: 'unit', path: '/sample-hisvaaduyos/11/4', rev: 1, data: { label: name('שיחת יום לדוגמה, יו"ד שבט ה\'תשי"ד'), date: '5714-05-10', position: [{ level: 'volume', value: '11' }, { level: 'farbrengen', value: '4' }] } },
    pathBar: hvBar(4),
    previous: { id: 'rh-aaaaaav3', path: '/sample-hisvaaduyos/11/3', name: name('מאמר לדוגמה · יו"ד שבט ה\'תשי"ד') },
    next: null,
    text: {
      kind: 'words',
      from: 'body',
      version: 'he',
      language: 'he',
      profile: 'chabad-library',
      segments: [
        { id: 'h1', kind: 'heading', level: 2, text: words('בס"ד. שיחת יום לדוגמה, יו"ד שבט ה\'תשי"ד.') },
        { id: 'p1', kind: 'paragraph', text: words('בלתי מוגה') },
        { id: 'p2', kind: 'paragraph', text: [{ text: 'א.', marks: ['b'] }, { text: ' כ"ק אדמו"ר שליט"א צוה לנגן ניגון לדוגמה, ואמר מאמר ד"ה לדוגמה.' }] },
        ...['ב', 'ג', 'ד', 'ה'].flatMap((letter, at) => [
          { id: `s${at}`, kind: 'paragraph', text: [{ text: `${letter}.`, marks: ['b'] }, { text: ` פסקה ראשונה של סעיף ${letter} לדוגמה. ${'מילים לדוגמה בתוך הסעיף. '.repeat(30)}` }] },
          { id: `t${at}`, kind: 'paragraph', text: words(`${'עוד מילים לדוגמה בסעיף. '.repeat(30)}`) },
          ...(at === 1 ? [{ id: 'g1', kind: 'paragraph', text: words('(וסיים כ"ק אדמו"ר שליט"א:)') }] : []),
          ...(at === 2 ? [{ id: 'x1', kind: 'paragraph', text: words('***') }] : []),
        ]),
      ],
      notes: [],
      machine: 'none',
      versions: [{ version: 'he', from: 'body', language: 'he' }],
    },
    recordings: [{ id: 'rh-aaaaaavr', path: '/listen/5714/rh-aaaaaave?r=rh-aaaaaavr', name: name('הקלטה לדוגמה'), durationMs: 3_720_000 }],
  },
  // A day of Hayom Yom (app/views/daybook.tsx), with what the print has that its text source lacks, read off the scan.
  '/hayom-yom/1/1': {
    item: { id: 'rh-aaaaaah2', type: 'unit', path: '/hayom-yom/1/1', rev: 1, data: hayomYomDay(1) },
    pathBar: dayBar(1),
    previous: null,
    next: { id: 'rh-aaaaaah3', path: '/hayom-yom/1/2', name: name('<h3>כ כסלו</h3>') },
    text: {
      kind: 'words',
      from: 'body',
      version: 'he',
      language: 'he',
      profile: 'chabad-library',
      segments: [
        { id: 'lead-h', kind: 'heading', text: words('כותרת המכתב לדוגמה'), origin: scanned },
        { id: 'lead-1', kind: 'paragraph', text: words('מכתב לדוגמה שלפני היום הראשון.'), origin: scanned },
        { id: 'tanya', kind: 'paragraph', text: words('שורת תניא לדוגמה\nועוד שורה לדוגמה'), origin: scanned },
        { id: 'pre-1', kind: 'paragraph', text: words('הודעה לדוגמה לפני השיעורים.'), origin: scanned },
        { id: 'p1', kind: 'paragraph', text: words('פתגם ראשון לדוגמה.') },
        { id: 'p2', kind: 'paragraph', text: words('פתגם שני לדוגמה.') },
      ],
      notes: [],
      machine: 'some',
      versions: [{ version: 'he', from: 'body', language: 'he' }],
    },
  },
  '/hayom-yom/1/2': {
    item: { id: 'rh-aaaaaah3', type: 'unit', path: '/hayom-yom/1/2', rev: 1, data: hayomYomDay(2) },
    pathBar: dayBar(2),
    previous: { id: 'rh-aaaaaah2', path: '/hayom-yom/1/1', name: name('<h3>יט כסלו</h3>') },
    next: null,
    text: { kind: 'words', from: 'body', version: 'he', language: 'he', profile: 'chabad-library', segments: [{ id: 'p1', kind: 'paragraph', text: words('פתגם היום השני לדוגמה.') }], notes: [], machine: 'none', versions: [{ version: 'he', from: 'body', language: 'he' }] },
  },
  // A subject index (app/views/index.tsx): the index of one volume of the sample sefer (fixture-library.ts, /sample-sichos-index).
  '/sample-sichos-index/12': {
    item: { id: 'rh-aaaaaax1', type: 'unit', path: '/sample-sichos-index/12', rev: 1, data: { label: name('חלק יב'), position: [{ level: 'volume', value: '12' }] } },
    pathBar: [
      { kind: 'set', chosen: { id: 'rh-aaaaaas3', path: '/sets/the-rebbe', name: name('הרבי') }, choices: [] },
      { kind: 'set', chosen: { id: 'rh-aaaaaal1', path: '/sets/the-rebbe-sample-sichos', name: name('שיחות לדוגמה') }, choices: [] },
      { kind: 'work', chosen: { id: 'rh-aaaaaaw2', path: '/sample-sichos-index', name: name('מפתח לדוגמה') }, choices: [] },
      { kind: 'unit', level: 'volume', chosen: { id: 'rh-aaaaaax1', path: '/sample-sichos-index/12', name: name('חלק יב') }, choices: [{ id: 'rh-aaaaaax1', path: '/sample-sichos-index/12', name: name('חלק יב') }] },
    ],
    previous: null,
    next: null,
    text: {
      kind: 'words',
      from: 'body',
      version: 'he',
      language: 'he',
      profile: 'sichos-kodesh',
      segments: [
        { id: 't1', kind: 'heading', level: 2, text: words('אהבה לדוגמה') },
        {
          id: 't1.1',
          kind: 'paragraph',
          text: [
            { href: "/read?page=2&title=חי\"ב+ע'+20+(שיחה+לדוגמה)&src=https://drive.google.com/open?id=sample-drive-file-1", text: '25' },
            { text: ' (הערה קצרה לדוגמה)' },
            { text: '.' },
            { text: '.\r\nע"ע תורה לדוגמה' },
            { text: '.' },
          ],
        },
        // A volume the catalog has no sichos of yet, led by its name as the merged index leads each volume.
        {
          id: 't1.2',
          kind: 'paragraph',
          text: [{ text: 'חלק צט', marks: ['b'] }, { text: ': ' }, { href: "/read?page=1&title=חצ\"ט+ע'+90+(שיחה+שאינה+באתר)&src=https://drive.google.com/open?id=sample-drive-file-2", text: '90' }, { text: '.' }],
        },
        { id: 't2', kind: 'heading', level: 2, text: words('בריאה לדוגמה') },
        { id: 't2.1', kind: 'paragraph', text: [{ href: "/read?title=חי\"ב+ע'+10+(שיחה+לדוגמה)&src=https://drive.google.com/open?id=sample-drive-file-3", text: '12' }, { text: ' (עוד הערה)' }, { text: '.' }] },
        { id: 't3', kind: 'heading', level: 2, text: words('תורה לדוגמה') },
        { id: 't3.1', kind: 'paragraph', text: [{ href: "/read?title=חי\"ב+ע'+30+(שיחה+לדוגמה)&src=https://drive.google.com/open?id=sample-drive-file-4", text: '31' }, { text: ' (הערה שלישית)' }, { text: '.' }] },
      ],
      notes: [],
      machine: 'none',
      versions: [{ version: 'he', from: 'body', language: 'he' }],
    },
  },
  '/tanya/1/4': tanyaChapter('he'),
  '/tanya/1/4?en': tanyaChapter('en'),
  '/shulchan-aruch-harav/2/2': {
    item: {
      id: 'rh-aaaaaas2',
      type: 'unit',
      path: '/shulchan-aruch-harav/2/2',
      rev: 1,
      data: { label: name('אורח חיים, סימן א׳'), position: [{ label: name('אורח חיים'), level: 'section', value: '2' }, { level: 'siman', value: '2' }] },
    },
    pathBar: sahBar,
    previous: null,
    next: null,
    text: {
      kind: 'words',
      from: 'body',
      version: 'he',
      language: 'he',
      profile: 'sefaria',
      segments: [
        { n: 1, id: '1', kind: 'verse', text: [{ text: 'הקדמה לדוגמה.', marks: ['small'] }, { br: true }, { text: 'דין לדוגמה ובו ג׳ סעיפים:', marks: ['b'] }, { br: true }, { text: 'סעיף ראשון לדוגמה.' }] },
        { n: 2, id: '2', kind: 'verse', text: words('סעיף שני לדוגמה (מילים בסוגריים) והמשך.') },
        { n: 3, id: '3', kind: 'verse', text: words('סעיף שלישי לדוגמה.') },
      ],
      notes: [],
      machine: 'none',
      versions: [{ version: 'he', from: 'body', language: 'he' }],
    },
  },
  '/sample/1/3': {
    item: { id: 'rh-aaaaaab3', type: 'unit', path: '/sample/1/3', rev: 1, data: { label: name('שיחה שלישית') } },
    pathBar: bar(2),
    previous: { id: 'rh-aaaaaab2', path: '/sample/1/2', name: name('שיחה שניה') },
    next: null,
    text: null,
  },
};

/** The fixes sent, newest last, for the tests to read back (GET /_fixes). The pages' words never change. */
const fixes: unknown[] = [];
/** The same for what was saved in Edit (GET /_edits). */
const edits: unknown[] = [];

const plain = (runs: unknown) => (Array.isArray(runs) ? runs.map((r: { text?: string }) => r.text ?? '').join('') : String(runs));

/** POST /v1/fix as the API answers it: signed in by the sample cookie, live when a few words changed, 409 when the words moved. */
function fix(body: { item?: string; segment?: string; before?: unknown; after?: unknown }, cookie: string): [number, unknown] {
  if (!/(?:^|; )rh_session=sample(?:;|$)/.test(cookie)) return [401, { error: 'unauthorized', message: 'sign in first' }];
  const view = Object.values(views).find((v) => (v as { item: { id: string } }).item.id === body.item) as { text: { segments: { id: string; text: unknown }[]; notes: { id: string; text: unknown }[] } } | undefined;
  const heard = paragraphWords(body.item ?? '', body.segment ?? '');
  const segment = heard !== undefined ? { text: heard } : view && [...view.text.segments, ...view.text.notes].find((s) => s.id === body.segment);
  if (!segment || JSON.stringify(segment.text) !== JSON.stringify(body.before)) return [409, { error: 'conflict', message: 'the words changed' }];
  fixes.push(body);
  const changed = plain(body.after).split(' ').filter((w, i) => w !== plain(body.before).split(' ')[i]).length;
  return [201, changed <= 5 ? { changeset: 100 + fixes.length, live: true, undo: `/v1/fix/${100 + fixes.length}/undo` } : { changeset: 100 + fixes.length, live: false, reason: 'more than 5 words changed; a reviewer looks first' }];
}

const signedIn = (cookie: string) => /(?:^|; )rh_session=sample(?:;|$)/.test(cookie);
/** The sample reader's name, as changed on the account page; and the addresses sign-in links were sent to (GET /_mails). */
let displayName = 'קורא לדוגמה';
const mails: string[] = [];

/** /v1/auth/*, as the API answers it, for the sign-in and account pages: signed in by the sample cookie. */
function auth(method: string, path: string, body: Record<string, unknown>, cookie: string, url: URL): [number, unknown, string[]?] {
  if (method === 'GET' && path === 'me') {
    if (!signedIn(cookie)) return [200, { person: null, google: true, email: true }];
    return [200, {
      person: { id: 'u-sample', displayName, username: 'sample-reader' },
      passkeys: [{ credentialId: 'k1', deviceType: 'multiDevice', backedUp: true, createdAt: '2026-10-01T10:00:00Z', lastUsedAt: '2026-10-10T10:00:00Z' }],
      googleAccounts: [],
      emails: [{ email: 'reader@example.org', createdAt: '2026-10-01T10:00:00Z', google: false }],
      notifications: { mode: 'off', email: null, lang: 'he' },
      google: true,
      email: true,
    }];
  }
  if (method === 'GET' && path === 'username') {
    const name = url.searchParams.get('name') ?? '';
    return [200, { name: name || null, available: name !== 'taken', reason: name === 'taken' ? 'taken' : null, suggestion: 'sample-reader' }];
  }
  if (path === 'email/start') {
    if (typeof body.email !== 'string' || !/@.+\./.test(body.email)) return [400, { error: 'bad-request', message: 'an email address, like name@example.com' }];
    mails.push(body.email);
    return [200, { sent: true }];
  }
  if (path === 'sign-out') return [200, { signedOut: true }, ['rh_session=; Path=/; Max-Age=0']];
  if (path === 'name') {
    if (!signedIn(cookie)) return [401, { error: 'unauthorized', message: 'sign in first' }];
    displayName = String(body.name);
    return [200, { person: { id: 'u-sample', displayName } }];
  }
  if (path === 'passkey/sign-in/options') return [200, { challengeId: 'c1', options: { challenge: 'Y2hhbGxlbmdl', rpId: 'localhost', allowCredentials: [] } }];
  return [404, { error: 'not-found', message: 'not found' }];
}

/** The back room's sample: one live fix waiting to be looked at after, and what the machines wrote (sample names only). */
const liveDecided = new Map<number, string>();
const liveList = () => ({
  suggestions: [{ id: 301, number: 41, title: 'A fix to the words', author: 'u-sample', status: 'merged', post_review: 'pending', submitted_at: '2026-10-11T09:00:00Z', items: 1 }],
  people: { 'u-sample': { name: 'קורא לדוגמה', username: 'sample-reader', bot: false } },
  next: null,
});
const liveOne = (cookie: string) => ({
  changeset: { id: 301, title: 'A fix to the words', status: 'merged', post_review: 'pending' },
  entries: [{ entityId: 'rh-aaaaaab1', type: 'unit', before: { path: '/sample/1/1' }, after: { path: '/sample/1/1' }, changes: [{ path: '/body/versions/he/segments/p2/text', before: [{ text: 'פסקה שניה לדוגמה, עם הערה נוספת' }], after: [{ text: 'פסקה שנייה לדוגמה, עם הערה נוספת' }] }], conflicts: [] }],
  total: 1,
  mayApprove: signedIn(cookie),
  mayApproveReason: signedIn(cookie) ? null : 'sign in to review',
});
const toCheck = {
  transcripts: [{ event: 'rh-3dvjfkyc', path: '/listen/5732/rh-3dvjfkyc', title: { he: 'התוועדות לדוגמה' }, date: null, paragraphs: 40, checked: 3, made: '2026-10-10T00:00:00Z' }],
  scans: [],
  texts: [{ entity: 'rh-aaaaaab2', type: 'unit', path: '/sample/1/2', title: { he: 'שיחה שניה' }, label: { he: 'שיחה שניה' }, segments: 2, checked: 0, made: '2026-10-09T00:00:00Z' }],
  totals: { transcripts: 1, paragraphs: 40, scans: 0, pages: 0, texts: 1, segments: 2 },
};

/** Takedown requests asked for (GET /_takedowns), checked as core's takedown.ts checks them. */
const takedowns: unknown[] = [];
function takedown(input: Record<string, string>, from: string | string[] | undefined): [number, unknown] {
  if (!input.name) return [400, { error: 'invalid', message: 'your name, up to 200 characters' }];
  if ((input.statement ?? '').length < 10) return [400, { error: 'invalid', message: 'say in a few words why (10 to 4000 characters)' }];
  takedowns.push({ ...input, from: from ?? null });
  return [201, { id: 40 + takedowns.length, answerWithinDays: 14 }];
}

/** The sample reader's API keys and connected app (GET /_tokens), and the one request to connect (oar-sample), answered once. */
let tokens: Record<string, unknown>[] = [];
const tokensReset = () =>
  (tokens = [{ id: 'oac-sample', kind: 'oauth', name: 'Claude', prefix: 'cho_', scopes: ['read', 'write'], createdAt: '2026-10-01T00:00:00Z', lastUsedAt: null, expiresAt: null, revokedAt: null, client: { id: 'https://claude.ai/oauth/claude-code-client-metadata', name: 'Claude', uri: null, host: 'claude.ai' } }]);
tokensReset();
let consentAnswered: unknown = null;
function tokensAnswer(method: string, path: string, input: Record<string, unknown>, cookie: string): [number, unknown] {
  if (!signedIn(cookie)) return [401, { error: 'unauthorized', message: 'sign in first' }];
  if (method === 'GET') return [200, { tokens }];
  if (method === 'POST') {
    if (typeof input.name !== 'string' || !input.name) return [400, { error: 'invalid', message: 'give the token a name of 1 to 80 characters (what uses it)' }];
    const id = `tok-${tokens.length}`;
    tokens.unshift({ id, kind: 'personal', name: input.name, prefix: 'chp_abcd', scopes: input.scopes, createdAt: '2026-10-11T00:00:00Z', lastUsedAt: null, expiresAt: null, revokedAt: null });
    return [201, { token: 'chp_abcdSECRETsample', id }];
  }
  if (method === 'DELETE') return (tokens = tokens.filter((token) => `/${token.id}` !== path)), [200, { ok: true }];
  return [404, { error: 'not-found', message: 'not found' }];
}
const consentRequest = { id: 'oar-sample', client: { id: 'https://claude.ai/oauth/claude-code-client-metadata', name: 'Claude', uri: null, kind: 'metadata', host: 'claude.ai' }, redirectUri: 'https://claude.ai/api/mcp/auth_callback', redirectHost: 'claude.ai', loopback: false, scopes: ['read', 'write'], resource: 'https://api.chassidushub.org/mcp', expiresAt: '2026-10-11T12:00:00Z' };

createServer((req, res) => {
  if (suggestionsAnswer(req, res)) return;
  const url = new URL(req.url ?? '/', 'http://local');
  res.setHeader('Content-Type', 'application/json');
  if (projectPagesAnswer(req, res, url)) return;
  if (stewardsAnswer(req, res, url)) return;
  const tokensPath = /^\/v1\/tokens(\/[\w-]+)?$/.exec(url.pathname);
  const consent = url.pathname === '/v1/oauth/requests/oar-sample';
  if (tokensPath || consent) {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const cookie = req.headers.cookie ?? '';
      const input = JSON.parse(raw || '{}');
      const [status, answer]: [number, unknown] = tokensPath
        ? tokensAnswer(req.method ?? 'GET', tokensPath[1] ?? '', input, cookie)
        : !signedIn(cookie)
          ? [401, { error: 'unauthorized', message: 'sign in first' }]
          : consentAnswered
            ? [404, { error: 'not-found', message: 'this request to connect is over' }]
            : req.method === 'POST'
              ? ((consentAnswered = input), [200, { redirect: `http://localhost:3002/_callback?approve=${input.approve}` }])
              : [200, consentRequest];
      res.statusCode = status;
      res.end(JSON.stringify(answer));
    });
    return;
  }
  if (url.pathname === '/v1/sitemap') return res.end(JSON.stringify({ pageSize: 10000, sitemaps: [{ type: 'unit', page: 1, count: 2, lastmod: '2026-10-10T00:00:00Z' }] }));
  if (url.pathname === '/v1/sitemap/unit/1') return res.end(JSON.stringify({ type: 'unit', page: 1, items: [{ id: 'rh-aaaaaab1', path: '/sample/1/1', lastmod: '2026-10-10T00:00:00Z' }, { id: 'rh-aaaaaab2', path: null, lastmod: null }] }));
  if (url.pathname === '/openapi.json') return res.end(JSON.stringify({ info: { title: 'ChassidusHub API', version: '1' }, paths: { '/v1/search': { get: { operationId: 'search', summary: 'Search the catalog' } } } }));
  if (url.pathname === '/_tokens') return res.end(JSON.stringify(tokens));
  if (url.pathname === '/_tokens/reset') return (tokensReset(), (consentAnswered = null), res.end('{}'));
  if (url.pathname === '/_consent') return res.end(JSON.stringify(consentAnswered));
  if (url.pathname === '/_callback') return res.end(JSON.stringify({ back: true }));
  if (servePeople(req, res, url)) return;
  const authPath = /^\/v1\/auth\/([a-z/-]+)$/.exec(url.pathname)?.[1];
  if (authPath) {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const [status, answer, cookies] = auth(req.method ?? 'GET', authPath, JSON.parse(raw || '{}'), req.headers.cookie ?? '', url);
      if (cookies) res.setHeader('Set-Cookie', cookies);
      res.statusCode = status;
      res.end(JSON.stringify(answer));
    });
    return;
  }
  const reviewLive = /^\/v1\/suggestions\/(\d+)\/review-live$/.exec(url.pathname);
  if (req.method === 'POST' && reviewLive) {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const id = Number(reviewLive[1]);
      const [status, answer] = !signedIn(req.headers.cookie ?? '')
        ? [401, { error: 'unauthorized', message: 'sign in first' }]
        : liveDecided.has(id)
          ? [409, { error: 'state', message: 'this change is not waiting for review' }]
          : (liveDecided.set(id, JSON.parse(raw || '{}').verdict), [200, {}]);
      res.statusCode = status;
      res.end(JSON.stringify(answer));
    });
    return;
  }
  if (url.pathname === '/v1/suggestions' && url.searchParams.get('postReview') === 'true') return res.end(JSON.stringify(liveList()));
  if (url.pathname === '/v1/suggestions/301') return res.end(JSON.stringify(liveOne(req.headers.cookie ?? '')));
  if (url.pathname === '/v1/machine/to-check') return res.end(JSON.stringify(toCheck));
  if (url.pathname === '/_live') return res.end(JSON.stringify(Object.fromEntries(liveDecided)));
  if (url.pathname === '/_live/reset') return (liveDecided.clear(), res.end('{}'));
  if (req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const cookie = req.headers.cookie ?? '';
      const [status, answer] =
        itemToolsAnswer('POST', url, JSON.parse(raw || '{}'), cookie) ??
        (url.pathname === '/v1/fix'
          ? fix(JSON.parse(raw || '{}'), cookie)
          : url.pathname === '/v1/organize'
            ? cookie.includes('rh_session=sample') ? (edits.push(JSON.parse(raw || '{}')), [201, { suggestion: { id: 200 + edits.length, status: 'open', title: 'edit' }, merged: false, mayApprove: false, preview: {} }]) : [401, { error: 'unauthorized', message: 'sign in first' }]
          : url.pathname === '/v1/takedowns'
            ? takedown(JSON.parse(raw || '{}'), req.headers['x-forwarded-for'])
          : /^\/v1\/fix\/\d+\/undo$/.test(url.pathname)
            ? cookie.includes('rh_session=sample') ? [201, { changeset: 999, commit: 1 }] : [401, { error: 'unauthorized', message: 'sign in first' }]
            : [404, { error: 'not-found', message: 'not found' }]);
      res.statusCode = status;
      res.end(JSON.stringify(answer));
    });
    return;
  }
  // The browser reads some of it too (a sefer's printings).
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (url.pathname === '/_fixes') return res.end(JSON.stringify(fixes));
  if (url.pathname === '/_edits') return res.end(JSON.stringify(edits));
  if (url.pathname === '/_mails') return res.end(JSON.stringify(mails));
  if (url.pathname === '/_takedowns') return res.end(JSON.stringify(takedowns));
  const searched = searchAnswer(url);
  if (searched) {
    res.statusCode = searched[0];
    if (searched[2]) return void setTimeout(() => res.end(JSON.stringify(searched[1])), searched[2]);
    return res.end(JSON.stringify(searched[1]));
  }
  const tools = itemToolsAnswer('GET', url, {}, req.headers.cookie ?? '');
  if (tools) return ((res.statusCode = tools[0]), res.end(JSON.stringify(tools[1])));
  const byId = (id: string | null) => Object.values(views).find((v) => (v as { item: { id: string } }).item.id === id);
  const entity = /^\/v1\/entities\/(rh-[\w-]+)$/.exec(url.pathname)?.[1];
  if (entity) {
    const found = byId(entity) as { item: unknown } | undefined;
    if (found) return res.end(JSON.stringify(found.item));
  }
  // Tanya's chapter in English (`?en`), when it is the version asked for.
  const english = url.searchParams.get('language') === 'en' ? views[`${url.searchParams.get('path') ?? (byId(url.searchParams.get('id')) as { item: { path: string } } | undefined)?.item.path}?en`] : undefined;
  const view = (url.pathname === '/v1/view' ? (english ?? (url.searchParams.get('id') ? byId(url.searchParams.get('id')) : views[url.searchParams.get('path') ?? ''])) : undefined) ?? libraryAnswer(url, shelves) ?? listenAnswer(url) ?? snapshotAnswer(url);
  if (!view) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'not-found', message: 'not found' }));
  }
  res.end(JSON.stringify(view));
}).listen(Number(process.env.FIXTURE_PORT ?? 3002));
