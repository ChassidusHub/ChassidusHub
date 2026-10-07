import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Lyrics, slotted } from '../app/components/Transcripts.js';
import type { Transcript } from '../app/lib/transcript.js';
import { PlayerProvider } from '../app/player/PlayerProvider.js';

/**
 * The transcript's listening view, where a listener taps a word and fixes
 * it in place (design/system, board 6c): every word knows where it sits
 * in its paragraph, so the fix changes only the words chosen, and "Fix"
 * or the box to type in is drawn right where those words are.
 */

const content = 'alpha beta gamma delta';
const words = [...content.matchAll(/\S+/g)].map((m) => ({ from: m.index!, to: m.index! + m[0].length, node: createElement('i', { key: m.index }, m[0]) }));
const draw = (nodes: React.ReactNode[]) => renderToStaticMarkup(createElement(Fragment, null, ...nodes));

describe('slotted', () => {
  it('draws the words as they were, with their spaces, when nothing is chosen', () => {
    expect(draw(slotted(words, content))).toBe('<i>alpha</i> <i>beta</i> <i>gamma</i> <i>delta</i>');
  });

  it('puts "Fix" right after the last chosen word', () => {
    const slot = { from: 6, to: 16, replace: false, node: createElement('b', null, 'Fix') };
    expect(draw(slotted(words, content, slot))).toBe('<i>alpha</i> <i>beta</i> <i>gamma</i><b>Fix</b> <i>delta</i>');
  });

  it('puts the box in place of the chosen words', () => {
    const slot = { from: 6, to: 16, replace: true, node: createElement('input') };
    expect(draw(slotted(words, content, slot))).toBe('<i>alpha</i> <input/> <i>delta</i>');
  });
});

describe('Lyrics', () => {
  const transcript: Transcript = {
    recording: 'rh-rec1',
    language: 'he',
    paragraphs: [{ id: 'rh-p1', content, startMs: 0, endMs: 4000, checked: false }],
  };
  const track = { id: 'rh-rec1', title: 'Part 1', subtitle: '', url: '/a.mp3', href: '/rh-ev1' };

  it('gives every word its place in the paragraph, so a tap can choose it', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(PlayerProvider, null, createElement(Lyrics, { transcripts: [transcript], tracks: [track], lang: 'en', nowMs: 0, found: null, machine: true, signedIn: true, onEdit: () => {}, onFix: async () => 'sent' as const }))),
    );
    for (const w of words) expect(html).toContain(`data-from="${w.from}" data-to="${w.to}"`);
  });
});
