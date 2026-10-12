import { describe, expect, it } from 'vitest';
import type { PageSegment } from '@chassidushub/model';
import { hisvaaduyosLayout, hisvaaduyosParts, pieceOf, saidThere } from '../app/views/hisvaaduyos.layout.js';
import { wordsHtml } from '../app/reader/words.server.js';

const p = (id: string, text: string, extra: Partial<PageSegment> = {}): PageSegment => ({ id, kind: 'paragraph', text: [{ text }], ...extra });
const ois = (id: string, letter: string, text: string): PageSegment => ({ id, kind: 'paragraph', text: [{ text: `${letter}.`, marks: ['b'] }, { text: ` ${text}` }] });

/** Toras Menachem vol. 11, "שיחת יום ה' פ' בשלח, יו"ד שבט ה'תשי"ד" (/toras-menachem/11/4), as /v1/view gives its first words. */
const yudShvat = [
  { id: 'h1', kind: 'heading', level: 2, text: [{ text: 'בס"ד. שיחת יום ה\' פ\' בשלח, יו"ד שבט ה\'תשי"ד.' }] } as PageSegment,
  p('p1', 'בלתי מוגה'),
  ois('p2', 'א', 'כ"ק אדמו"ר שליט"א צוה לנגן ניגון ה"בינוני". אח"כ צוה לנגן ואמר מאמר ד"ה באתי לגני גו\'.'),
  p('p3', 'אחרי המאמר צוה כ"ק אדמו"ר שליט"א לנגן ניגון מכ"ק אדמו"ר (מהורש"ב) נ"ע, וניגון מכ"ק אדמו"ר מהר"ש.'),
  p('p4', '***'),
  ois('p5', 'ב', 'ידוע פתגם הרב המגיד בביאור גודל התענוג למעלה מעבודת האדם למטה דוקא,'),
  p('p6', '[ולהעיר, שגם להדעה ששכר מצוה הוא באופן של סגולה, הנה לאחרי שרצה הקב"ה וקבע סגולה זו].'),
  p('p7', '(כ"ק אדמו"ר שליט"א בכה, ואח"כ המשיך:)'),
  ois('p8', 'ג', 'והנה, "צדיקים דומין לבוראן" – שעד"ז כביכול מצינו בהנהגתם של צדיקים:'),
  p('p9', 'א. סתם מילים שאינן סעיף.'),
];

describe('a farbrengen’s words', () => {
  const parts = hisvaaduyosParts(yudShvat);

  it('finds its sections א, ב, ג in order, and nothing else that opens with a letter', () => {
    expect(parts.sections).toEqual([
      { label: 'א', id: 's-p2' },
      { label: 'ב', id: 's-p5' },
      { label: 'ג', id: 's-p8' },
    ]);
  });

  it('sets what happened between the words apart, and keeps the Rebbe’s own remarks in brackets in the words', () => {
    expect(parts.classes.get('p2')).toBe('stage');
    expect(parts.classes.get('p3')).toBe('stage');
    expect(parts.classes.get('p7')).toBe('stage');
    expect(parts.classes.get('p5')).toBeUndefined();
    expect(parts.classes.get('p6')).toBeUndefined();
    expect(parts.classes.get('p4')).toBeUndefined();
  });

  it('leaves the print’s ב"ס"ד heading and its בלתי מוגה line to the title and the chip', () => {
    expect(parts.muga).toBe('bilti-mugah');
    expect(parts.classes.get('h1')).toBe('first');
    expect(parts.classes.get('p1')).toBe('hv-muga');
    expect(hisvaaduyosParts([p('a', '(הנחה בלתי מוגה)')]).muga).toBe('hanacha');
    expect(hisvaaduyosParts([p('a', 'מילים')]).muga).toBeUndefined();
  });

  it('takes the stage kind and the small mark as stage lines', () => {
    const marked = hisvaaduyosParts([{ id: 's', kind: 'stage' as PageSegment['kind'], text: [{ text: 'ניגנו' }] }, { id: 't', kind: 'paragraph', text: [{ text: 'ואח"כ אמר', marks: ['small'] }] }]);
    expect(marked.classes.get('s')).toBe('stage');
    expect(marked.classes.get('t')).toBe('stage');
  });

  it('draws the maamar said there as a card after the line that says it was said, outside the paragraphs', () => {
    const said = [{ path: '/toras-menachem/11/3', label: 'ד"ה באתי לגני אחותי כלה', kind: 'maamar' as const }];
    const body = wordsHtml(yudShvat, [], 'שיחת יום ה\' פ\' בשלח, יו"ד שבט ה\'תשי"ד', hisvaaduyosLayout, {}, { said });
    expect(body).toContain('<p id="s-p2" class="stage">');
    const card = body.indexOf('<a class="hv-said" href="/toras-menachem/11/3">');
    expect(card).toBeGreaterThan(body.indexOf('id="s-p2"'));
    expect(card).toBeLessThan(body.indexOf('id="s-p3"'));
    expect(body).toContain('<b>ד&quot;ה באתי לגני אחותי כלה</b>');
    // Without a maamar, the words are drawn as they are.
    expect(wordsHtml(yudShvat, [], '', hisvaaduyosLayout, {}, {})).not.toContain('hv-said');
  });
});

describe('what else was said at the farbrengen', () => {
  /** Toras Menachem vol. 30 (ה'תשכ"א), as the path bar lists its units: two maamarim and two sichos on 11 Shvat, said at different times. */
  const units = [
    'מברק לקראת יו"ד שבט, ה\'תשכ"א',
    'באתי לגני אחותי כלה · ליל ש"ק פ\' בשלח, י"א שבט, אחרי קבלת שבת, ה\'תשכ"א',
    'ויהי בשלח פרעה את · ש"פ בשלח, י"א שבט, ה\'תשכ"א',
    'שיחת ש"פ בשלח, י"א שבט ה\'תשכ"א',
    'באתי לגני אחותי כלה · מוצש"ק פ\' בשלח, י"א שבט, ה\'תשכ"א',
    'שיחת מוצש"ק פ\' בשלח, י"א שבט ה\'תשכ"א',
    'ר"ד יום א\' פ\' יתרו, י"ב שבט ה\'תשכ"א',
  ].map((name, at) => ({ path: `/toras-menachem/30/${at + 1}`, name }));

  it('knows a maamar and a sicha by their names', () => {
    expect(pieceOf(units[2]!.name)).toEqual({ kind: 'maamar', heading: 'ויהי בשלח פרעה את', occasion: 'ש"פ בשלח, י"א שבט, ה\'תשכ"א' });
    expect(pieceOf(units[3]!.name)?.kind).toBe('sichos');
    expect(pieceOf(units[0]!.name)).toBeNull();
  });

  it('links a sicha to the maamar said at the same time, not to one said that night', () => {
    expect(saidThere(units[3]!, units)).toEqual([{ path: '/toras-menachem/30/3', label: 'ד"ה ויהי בשלח פרעה את', kind: 'maamar' }]);
    expect(saidThere(units[5]!, units)).toEqual([{ path: '/toras-menachem/30/5', label: 'ד"ה באתי לגני אחותי כלה', kind: 'maamar' }]);
  });

  it('links a maamar to its sichos, and a maamar said with no sichos to nothing', () => {
    expect(saidThere(units[2]!, units)).toEqual([{ path: '/toras-menachem/30/4', label: units[3]!.name, kind: 'sichos' }]);
    expect(saidThere(units[1]!, units)).toEqual([]);
    expect(saidThere(units[6]!, units)).toEqual([]);
  });

  it('finds a maamar whose occasion is the end of the sicha’s', () => {
    const tashid = [
      { path: '/a', name: 'באתי לגני אחותי כלה · יו"ד שבט ה\'תשי"ד' },
      { path: '/b', name: 'שיחת יום ה\' פ\' בשלח, יו"ד שבט ה\'תשי"ד' },
    ];
    expect(saidThere(tashid[1]!, tashid).map((s) => s.path)).toEqual(['/a']);
  });
});
