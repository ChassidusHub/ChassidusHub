import { describe, expect, it } from 'vitest';
import { pageTiming, withTiming } from '../server/serverTiming.js';

describe("a page's Server-Timing", () => {
  /** A clock the test moves by hand, and an API whose answers wait until told. */
  function setup() {
    let clock = 0;
    const timing = pageTiming(() => clock);
    const waiting: Array<() => void> = [];
    const send = timing.timed(
      (_input, _init) =>
        new Promise<Response>((resolve) => waiting.push(() => resolve(new Response('{}', { headers: { 'Server-Timing': 'db;dur=30.0;desc="2 statements", total;dur=30.0' } })))),
    );
    return { timing, send, tick: (ms: number) => (clock += ms), answer: () => waiting.shift()!() };
  }

  it('counts calls side by side as one round, and one after another as a round more', async () => {
    const { timing, send, tick, answer } = setup();
    const first = Promise.all([send('https://api.test/v1/view'), send('https://api.test/v1/x')]);
    tick(100);
    answer();
    answer();
    await first;
    tick(50);
    const second = send('https://api.test/v1/y');
    tick(80);
    answer();
    await second;
    expect(timing.header(300)).toBe('page;dur=300, api;dur=180;desc="3 calls, 2 rounds", db;dur=90');
  });

  it('says so when a page asked the API nothing', () => {
    expect(pageTiming(() => 0).header(4.25)).toBe('page;dur=4.3, api;desc="no calls"');
  });

  it('says when a page the edge keeps was drawn', () => {
    expect(pageTiming(() => 0).header(12, 'drawn')).toMatch(/^drawn;dur=12;desc="\d{4}-\d\d-\d\dT[^"]+", api;desc="no calls"$/);
  });

  it('is set on any response, whatever headers it came with', async () => {
    const kept = new Response('page', { headers: { 'Server-Timing': 'old', 'Cache-Control': 'public' } });
    const timed = withTiming(kept, 'page;dur=1');
    expect([timed.headers.get('Server-Timing'), timed.headers.get('Cache-Control'), await timed.text()]).toEqual(['page;dur=1', 'public', 'page']);
  });
});
