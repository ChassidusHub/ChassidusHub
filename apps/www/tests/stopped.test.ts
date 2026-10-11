import { describe, expect, it } from 'vitest';
import { readStopped, resumeLink } from '../app/listen/stopped.js';

const cookie = (value: unknown) => `theme=dark; ch_listen=${encodeURIComponent(JSON.stringify(value))}`;

describe('where the reader stopped', () => {
  it('reads a page of this site from the cookie', () => {
    const stopped = readStopped(cookie({ to: '/listen/5747/rh-abc', title: 'י״ט כסלו', recording: 'rh-r1', at: 61_500 }), 'ch_listen');
    expect(stopped?.title).toBe('י״ט כסלו');
    expect(resumeLink(stopped!)).toBe('/listen/5747/rh-abc?r=rh-r1&t=61');
  });

  it('never links to another site', () => {
    for (const to of ['//evil.example/x', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)']) {
      expect(readStopped(cookie({ to, title: 'x' }), 'ch_listen')).toBeNull();
    }
  });

  it('ignores a missing or broken cookie', () => {
    expect(readStopped(null, 'ch_listen')).toBeNull();
    expect(readStopped('ch_listen=%7Bnot json', 'ch_listen')).toBeNull();
    expect(readStopped(cookie({ title: 'no page' }), 'ch_listen')).toBeNull();
  });
});
