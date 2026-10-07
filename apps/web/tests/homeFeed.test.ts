import { describe, expect, it } from 'vitest';
import { feedCard, maamarOf, shortTopic, topicsOf } from '../app/lib/homeFeed.js';

/**
 * What the home page shows of a farbrengen (design/system, boards 29 to
 * 32): the first lines of its own table of contents, shortened, and its
 * maamar. The words here are placeholders in the shape the catalog keeps.
 */

const body = {
  versions: [
    {
      language: 'he',
      segments: [
        {
          id: 'contents',
          kind: 'section',
          text: [{ text: 'תוכן ענינים' }],
          children: [
            { id: 'contents.1', kind: 'item', text: [{ text: 'מילים ראשונות של הענין הראשון - ועוד פירוט ארוך שאחריו. (ס"א)' }] },
            { id: 'contents.2', kind: 'item', text: [{ text: 'ענין שני בקצרה. (ס"ו)' }] },
            { id: 'contents.3', kind: 'item', text: [{ text: 'ענין שלישי שלא יוצג' }] },
          ],
        },
      ],
    },
  ],
};

describe('shortTopic', () => {
  it('drops the reference to the section, and cuts at the first clause', () => {
    expect(shortTopic('מילים ראשונות של הענין הראשון - ועוד פירוט ארוך שאחריו. (ס"א)')).toBe('מילים ראשונות של הענין הראשון');
    expect(shortTopic('ענין שני בקצרה. (סי"ד)')).toBe('ענין שני בקצרה');
  });

  it('keeps a short opening whole rather than cutting it to nothing', () => {
    expect(shortTopic('קצר - והמשך הדברים כאן')).toBe('קצר - והמשך הדברים כאן');
  });

  it('ends a long line at a whole word', () => {
    const long = Array.from({ length: 40 }, () => 'מילה').join(' ');
    const out = shortTopic(long, 30);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(31);
    expect(out).not.toMatch(/\s…$/);
  });
});

describe('topicsOf', () => {
  it('reads the first lines of the table of contents, the heading left out', () => {
    expect(topicsOf({ body })).toEqual(['מילים ראשונות של הענין הראשון', 'ענין שני בקצרה']);
  });

  it('is empty for a farbrengen with no table of contents', () => {
    expect(topicsOf({})).toEqual([]);
  });
});

describe('maamarOf', () => {
  it('names the maamar by its opening words', () => {
    const links = [
      { kind: 'bilti-mugah', label: { he: 'שיחו"ק' } },
      { kind: 'maamar', label: { he: 'סה"מ' } },
      { kind: 'maamar', label: { he: 'ד"ה פתיחת המאמר (המשך: ב) · ראה מאמר' } },
    ];
    expect(maamarOf({ links })).toBe('ד"ה פתיחת המאמר');
  });

  it('is null without a maamar', () => {
    expect(maamarOf({ links: [{ kind: 'bilti-mugah', label: { he: 'שיחו"ק' } }] })).toBeNull();
  });
});

describe('feedCard', () => {
  it('keeps what a card shows, and whether it can be heard with its words', () => {
    const event = { id: 'rh-ev1', type: 'event', path: '/events/5736-01-29', rev: 1, data: { title: { he: 'שבת' }, date: '5736-01-29', body }, recordings: 2 };
    const card = feedCard(event, new Set(['rh-ev1']));
    expect(card).toEqual({ id: 'rh-ev1', path: '/events/5736-01-29', title: { he: 'שבת' }, date: '5736-01-29', topics: ['מילים ראשונות של הענין הראשון', 'ענין שני בקצרה'], maamar: null, recordings: 2, transcript: true });
    expect(feedCard(event, new Set()).transcript).toBe(false);
  });
});
