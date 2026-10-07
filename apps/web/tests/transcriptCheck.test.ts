import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TranscriptEditor } from '../app/components/TranscriptEditor.js';
import type { Transcript } from '../app/lib/transcript.js';
import { PlayerProvider } from '../app/player/PlayerProvider.js';

/**
 * Checking a transcript (design/system, board 6): the paragraph being
 * worked on has three answers, Right, Fix and Not sure, at the thumb, and
 * its words carry where they sit, so a tap chooses the words to fix.
 */

const content = 'alpha beta gamma';
const transcript: Transcript = {
  recording: 'rh-rec1',
  language: 'he',
  paragraphs: [
    { id: 'rh-p1', content, startMs: 0, endMs: 3000, checked: false },
    { id: 'rh-p2', content: 'delta epsilon', startMs: 3000, endMs: 5000, checked: false },
  ],
};
const track = { id: 'rh-rec1', title: 'Part 1', subtitle: '', url: '/a.mp3', href: '/rh-ev1' };

const draw = (account: unknown) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(PlayerProvider, null, createElement(TranscriptEditor, { transcripts: [transcript], tracks: [track], lang: 'en', nowMs: 0, found: 'rh-p1', account, onFixed: () => {} }))),
  );

describe('checking a transcript', () => {
  it('gives the open paragraph, and only it, the three answers', () => {
    const html = draw({ person: { id: 'p1' } });
    expect(html.match(/class="tx-answers"/g)).toHaveLength(1);
    expect(html).toContain('>Right</button>');
    expect(html).toContain('>Fix</button>');
    expect(html).toContain('>Not sure</button>');
    expect(html).toContain('Every word right? &quot;Right&quot;. A wrong word? Tap it.');
  });

  it('lets each word be chosen by where it sits', () => {
    const html = draw({ person: { id: 'p1' } });
    expect(html).toContain('data-from="0" data-to="5"');
    expect(html).toContain('data-from="6" data-to="10"');
    expect(html).toContain('data-from="11" data-to="16"');
  });

  it('gives no answers to someone not signed in, who may still listen', () => {
    const html = draw(null);
    expect(html).not.toContain('tx-answers');
    expect(html).toContain('Sign in to fix');
  });
});
