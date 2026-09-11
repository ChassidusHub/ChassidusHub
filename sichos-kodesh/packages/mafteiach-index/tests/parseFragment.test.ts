import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFragmentPage } from '../src/parseFragment.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(path.join(fixturesDir, name), 'utf8');

describe('parseFragmentPage', () => {
  it('parses a mugah-only farbrengen (no audio/video/maamorim), with grouped ליקוט/הנחה links', () => {
    const detail = parseFragmentPage(fixture('fragment-11112824-mugah-only.raw.js'), 11112824);

    expect(detail.id).toBe(11112824);
    expect(detail.biltiMugah.hasContent).toBe(false);
    expect(detail.maamorim.hasContent).toBe(false);
    expect(detail.audio.hasContent).toBe(false);
    expect(detail.video.hasContent).toBe(false);

    expect(detail.mugah.hasContent).toBe(true);
    const groups = new Set(detail.mugah.links.map((l) => l.group));
    expect(groups).toEqual(new Set(['ליקוט', 'הנחה']));
    expect(detail.mugah.links.length).toBeGreaterThanOrEqual(4);
    for (const link of detail.mugah.links) {
      expect(link.url).toMatch(/^https:\/\/drive\.google\.com\//);
    }

    expect(detail.english.hasContent).toBe(true);
    expect(detail.english.links[0]!.label).toContain('Proceeding Together');

    expect(detail.tochenInyanim.hasContent).toBe(true);
    expect(detail.tochenInyanim.text).toContain('פרשת לך לך');
  });

  it('parses audio (ashreinu.app link) and video (YouTube embed) when present', () => {
    const detail = parseFragmentPage(fixture('fragment-11115432-audio-video.raw.js'), 11115432);

    expect(detail.audio.hasContent).toBe(true);
    expect(detail.audio.links[0]!.url).toContain('ashreinu.app');

    expect(detail.video.hasContent).toBe(true);
    expect(detail.video.youtubeIds).toEqual(['WB0UI77OY8A']);
    expect(detail.video.links).toEqual([]);

    expect(detail.biltiMugah.hasContent).toBe(true);
    expect(detail.mugah.hasContent).toBe(false);
    expect(detail.tochenInyanim.text).toContain('הפיכת העינוי');
  });

  it('parses bilti-mugah and maamorim sections when present, distinct from mugah', () => {
    const detail = parseFragmentPage(fixture('fragment-11114437-bilti-mugah-maamorim.raw.js'), 11114437);

    expect(detail.biltiMugah.hasContent).toBe(true);
    expect(detail.biltiMugah.links.length).toBeGreaterThan(0);

    expect(detail.mugah.hasContent).toBe(true);
    expect(detail.mugah.links.some((l) => l.group === 'הנחה')).toBe(true);

    expect(detail.maamorim.hasContent).toBe(true);
    expect(detail.maamorim.links.length).toBeGreaterThan(0);

    expect(detail.audio.hasContent).toBe(false);
    expect(detail.video.hasContent).toBe(false);
  });

  it('never reports hasContent=true with an empty links array for any link section', () => {
    for (const fixtureFile of [
      'fragment-11112824-mugah-only.raw.js',
      'fragment-11115432-audio-video.raw.js',
      'fragment-11114437-bilti-mugah-maamorim.raw.js',
    ]) {
      const detail = parseFragmentPage(fixture(fixtureFile), 0);
      for (const section of [detail.biltiMugah, detail.mugah, detail.maamorim, detail.english, detail.hagahos]) {
        if (section.hasContent) expect(section.links.length).toBeGreaterThan(0);
      }
    }
  });

  it('parses hagahos as a plain link list (real example)', () => {
    const detail = parseFragmentPage(fixture('fragment-11112786-hagahos-links.raw.js'), 11112786);
    expect(detail.hagahos.hasContent).toBe(true);
    expect(detail.hagahos.links.length).toBeGreaterThan(0);
    expect(detail.hagahos.links[0]!.url).toMatch(/^https:\/\/drive\.google\.com\//);
  });

  it('parses hosofos as free text with an inline link, NOT as a link list (real example) - this is the opposite shape of hagahos despite the similar-looking tab', () => {
    const detail = parseFragmentPage(fixture('fragment-11112799-hosofos-text.raw.js'), 11112799);
    expect(detail.hosofos.hasContent).toBe(true);
    expect(detail.hosofos.text).toContain('ל"ג בעומר');
    expect(detail.hosofos.links.length).toBeGreaterThan(0);
    expect(detail.hosofos.links[0]!.url).toMatch(/^https:\/\/drive\.google\.com\//);
  });

  it('parses a plain outbound video link (chabad.org player), the other real video shape besides a YouTube embed', () => {
    const detail = parseFragmentPage(fixture('fragment-11113130-external-video-link.raw.js'), 11113130);
    expect(detail.video.hasContent).toBe(true);
    expect(detail.video.youtubeIds).toEqual([]);
    expect(detail.video.links).toHaveLength(1);
    expect(detail.video.links[0]!.url).toContain('chabad.org');
  });

  it('parses a pre-Nesius fragment (reduced 3-button template): the "מוגה"-class slot holds Reshimos, not an edited sicha', () => {
    const detail = parseFragmentPage(fixture('fragment-11116108-pre-nesius-reshimos.raw.js'), 11116108);
    // Same CSS class as a post-Nesius mugah sicha, so it lands in the same field - see the FarbrengenDetail doc comment.
    expect(detail.mugah.hasContent).toBe(true);
    expect(detail.mugah.links.length).toBeGreaterThan(0);
    expect(detail.biltiMugah.hasContent).toBe(false); // the "הנחות" slot is always disabled pre-Nesius in the real corpus
    expect(detail.hosofos.hasContent).toBe(true);
  });
});
