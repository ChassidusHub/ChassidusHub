import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactElement, type RefObject } from 'react';
import { Await, data as answer, redirect, useLoaderData, useSearchParams } from 'react-router';
import { YEARS, yearLabel } from '../listen/data.server';
import { firstWords, recordedEvent, type FirstWords } from '../listen/recording.server';
import { clock, eventLevel, fetchWords, LISTEN_COOKIE, listening, yearLevel, writeStopped, type Chapter, type Paragraph } from '../listen/common';
import { wordAt, wordHolding, wordTimes, wordsOf } from '../listen/timing';
import { Fixing } from '../fix/Fixing';
import { replaceInText } from '../fix/replace';
import { Button, IconButton, player, TopBar, usePlayer, type Track } from '../ui';
import { chapterAt } from '../ui/player/engine';
import type { Route } from './+types/recording';

export const handle = { section: 'listen' };

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.date}${data.title ? ` · ${data.title}` : ''} · ChassidusHub` : 'ChassidusHub' }];
}

/** The page comes as soon as the event and its parts are read; its first words follow in the same answer when they are ready. */
export async function loader({ params, context: { api } }: Route.LoaderArgs) {
  if (!/^rh-[a-z0-9]+$/i.test(params.event)) throw answer('not found', { status: 404 });
  const found = await recordedEvent(api, params.event).catch((error: unknown) => {
    // By its status, not its class, as routes/item.tsx does.
    if ((error as { status?: number } | null)?.status === 404) throw answer('not found', { status: 404 });
    throw error;
  });
  if (String(found.year) !== params.year) throw redirect(`/listen/${found.year}/${found.id}`, 301);
  return { ...found, years: YEARS.map((year) => ({ year, label: yearLabel(year) })), first: firstWords(api, found.chapters).catch(() => null) };
}

export const headers = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

/**
 * A recorded event: its words a paragraph at a time, a small heading where each
 * part starts. Tap any words to hear them; while it plays, the word being said
 * is lit and kept in view, until the reader scrolls away ("back to now" returns).
 * The sound is the site's one player, so it keeps playing from page to page.
 */
export default function Recording() {
  const data = useLoaderData<typeof loader>();
  const { id, year, yearName, date, title, totalMs, chapters } = data;
  const to = `/listen/${year}/${id}`;
  const [search] = useSearchParams();

  const track = useMemo<Track>(
    () => ({
      id,
      title: date,
      to,
      chapters: chapters.map((c) => ({ title: c.title, start: c.offset, duration: c.durationMs, src: c.src })),
      // The player's own words panel: the same words, a paragraph at a time.
      words: async (index) => {
        const chapter = chapters[index];
        const words = chapter && !chapter.niggun ? await fetchWords(chapter.recording).catch(() => null) : null;
        return words?.length ? { phrases: words.map((p) => ({ text: p.text, start: p.start ?? 0 })), checked: words.every((p) => !p.machine) } : null;
      },
    }),
    [id, date, to, chapters],
  );
  const mine = usePlayer((s) => s.track?.id === id);
  const playing = usePlayer((s) => s.track?.id === id && s.playing);

  // Where the reader stopped, for Home and listening's "continue" (every ten seconds of playing).
  const stop = usePlayer((s) => (s.track?.id === id ? Math.floor(s.position / 10_000) * 10_000 : -1));
  useEffect(() => {
    if (stop < 0) return;
    const chapter = chapters[chapterAt(track, stop)];
    if (!chapter) return;
    writeStopped(LISTEN_COOKIE, { to, title: `${date} · ${chapter.title}`, sub: title || undefined, recording: chapter.recording, at: stop - chapter.offset, durationMs: chapter.durationMs });
  }, [stop, chapters, track, to, date, title]);

  // Opened from "continue" (?r=…&t=…) or from a list's play button (?play=1).
  const resume = useMemo(() => {
    const chapter = chapters.find((c) => c.recording === search.get('r'));
    return chapter ? chapter.offset + Number(search.get('t') ?? 0) * 1000 : null;
  }, [chapters, search]);
  useEffect(() => {
    if (search.get('play') === '1' && !mine) player.play(track, 0);
    // Only when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [machine, setMachine] = useState(false);
  const parts = chapters.length;
  const yi = useRef<HTMLDivElement>(null);
  // Paragraphs fixed live on this visit, by id: drawn with their new words, until Undo or the next visit.
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const onLive = useCallback((place: { segment: string; at: number; selected: string }, typed: string) => {
    const shown = document.getElementById(`w-${place.segment}`)?.textContent ?? '';
    const now = replaceInText(shown, place.at, place.selected, typed);
    if (typeof now === 'string') setFixed((f) => ({ ...f, [place.segment]: now }));
    return () =>
      setFixed((f) => {
        const { [place.segment]: _, ...rest } = f;
        return rest;
      });
  }, []);

  return (
    <>
      <TopBar path={[listening, yearLevel(data.years, year), eventLevel(year, yearName, { id, label: date })]} end={<IconButton icon="more" label="עוד" />} />
      <main id="content" className="view">
        <h1>{date}</h1>
        <p className="faint sm">{[title, parts > 1 ? `${parts} חלקים` : undefined, totalMs ? clock(totalMs) : undefined].filter(Boolean).join(' · ')}</p>
        <div className="rec-acts">
          {mine ? (
            <Button icon={playing ? 'pause' : 'play'} onClick={() => player.toggle()}>
              {playing ? 'עצירה' : 'להמשיך'}
            </Button>
          ) : resume != null ? (
            <Button icon="play" onClick={() => player.play(track, resume)}>
              להמשיך מ־{clock(resume)}
            </Button>
          ) : (
            <Button icon="play" onClick={() => player.play(track, 0)} disabled={!parts}>
              לנגן מההתחלה
            </Button>
          )}
          {machine && <span className="machine">נשמע במכונה, עוד לא נבדק</span>}
        </div>
        {!parts && <p className="faint">אין עדיין הקלטה שאפשר לשמוע כאן.</p>}

        <div className="tr" ref={yi}>
          <Suspense fallback={<Words chapters={chapters} track={track} first={undefined} fixed={fixed} onMachine={setMachine} />}>
            <Await resolve={data.first} errorElement={<Words chapters={chapters} track={track} first={null} fixed={fixed} onMachine={setMachine} />}>
              {(first) => <Words chapters={chapters} track={track} first={first} fixed={fixed} onMachine={setMachine} />}
            </Await>
          </Suspense>
        </div>
      </main>
      <Fixing root={yi} path={to} citation={[date, title].filter(Boolean).join(', ')} url={to} title={title || date} onLive={onLive} />
    </>
  );
}

/** Words still to come: null while they load, [] when a part has none yet. */
type Loaded = Record<string, Paragraph[] | null>;

/**
 * The words of every part. `first` is the first part's words that came with
 * the page (undefined while they are still coming); every other part's are
 * read from the API as they near the screen or start playing, with each
 * word's time.
 */
function Words({ chapters, track, first, fixed, onMachine }: { chapters: Chapter[]; track: Track; first: FirstWords | null | undefined; fixed: Record<string, string>; onMachine: (machine: boolean) => void }) {
  const [loaded, setLoaded] = useState<Loaded>({});
  const asked = useRef(new Set<string>());
  const load = useCallback((chapter: Chapter | undefined) => {
    if (!chapter || chapter.niggun || asked.current.has(chapter.recording)) return;
    asked.current.add(chapter.recording);
    setLoaded((w) => ({ ...w, [chapter.recording]: w[chapter.recording] ?? null }));
    fetchWords(chapter.recording)
      .then((words) => setLoaded((w) => ({ ...w, [chapter.recording]: words ?? [] })))
      .catch(() => setLoaded((w) => ({ ...w, [chapter.recording]: [] })));
  }, []);
  /** A part's words as drawn now: read in full, else what came with the page. */
  const drawnWords = useCallback((chapter: Chapter) => loaded[chapter.recording] ?? (first?.recording === chapter.recording ? first.words : undefined), [loaded, first]);

  useEffect(() => {
    onMachine(chapters.some((c) => drawnWords(c)?.some((p) => p.machine)));
  }, [chapters, drawnWords, onMachine]);

  // A part's words load when its place nears the screen.
  useEffect(() => {
    if (first === undefined) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) load(chapters.find((c) => c.recording === (entry.target as HTMLElement).dataset.load));
      },
      { rootMargin: '1200px 0px' },
    );
    for (const el of document.querySelectorAll('[data-load]')) seen.observe(el);
    return () => seen.disconnect();
  }, [chapters, load, first, loaded]);

  // The part being heard, and the paragraph being heard in it.
  const part = usePlayer((s) => (s.track?.id === track.id ? chapterAt(s.track, s.position) : -1));
  // Its words with each word's time (the words that came with the page have none).
  useEffect(() => {
    if (part >= 0) load(chapters[part]);
  }, [part, chapters, load]);
  const heard = usePlayer((s) => {
    const chapter = chapters[part];
    if (s.track?.id !== track.id || !chapter) return null;
    const at = s.position - chapter.offset;
    let found: string | null = null;
    for (const p of drawnWords(chapter) ?? []) if (p.start != null && p.start <= at) found = p.id;
    return found;
  });
  const playing = usePlayer((s) => s.track?.id === track.id && s.playing);

  // Follow the sound, until the reader scrolls on their own.
  const [follow, setFollow] = useState(true);
  const following = useRef(follow);
  following.current = follow;
  useEffect(() => {
    const away = () => setFollow(false);
    const keys = (e: KeyboardEvent) => ['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' '].includes(e.key) && (e.target as HTMLElement).tagName !== 'BUTTON' && away();
    addEventListener('wheel', away, { passive: true });
    addEventListener('touchmove', away, { passive: true });
    addEventListener('keydown', keys);
    return () => {
      removeEventListener('wheel', away);
      removeEventListener('touchmove', away);
      removeEventListener('keydown', keys);
    };
  }, []);
  // Bringing the words being said into view is Follow's, as each word is lit.
  const bringNow = useCallback(() => (document.querySelector('.tp.now .w.on') ?? document.querySelector('.tp.now'))?.scrollIntoView({ block: 'center', behavior: 'smooth' }), []);

  // The times of the paragraph being heard, a time for each word.
  const current = chapters[part];
  const times = useMemo(() => {
    if (!current || !heard) return null;
    const words = drawnWords(current) ?? [];
    const at = words.findIndex((p) => p.id === heard);
    const p = words[at];
    if (!p) return null;
    const start = p.start ?? 0;
    const end = p.end ?? words[at + 1]?.start ?? current.durationMs;
    return wordTimes(fixed[p.id] ?? p.text, start, end, fixed[p.id] === undefined ? p.timed : null);
  }, [current, heard, drawnWords, fixed]);

  /** Tap: hear from the word tapped (its paragraph's time when the word's is not known), or from a paragraph's time. */
  const hear = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const stamp = target.closest<HTMLElement>('.tt');
    const text = target.closest<HTMLElement>('.tx');
    const box = (stamp ?? text)?.closest<HTMLElement>('.tp');
    if (!box || !getSelection()?.isCollapsed) return;
    const chapter = chapters[Number(box.dataset.part)];
    const words = chapter ? (drawnWords(chapter) ?? []) : [];
    const at = words.findIndex((p) => p.id === box.dataset.id);
    const p = words[at];
    if (!chapter || !p) return;
    let ms = p.start ?? 0;
    if (text && !stamp) {
      const drawn = fixed[p.id] ?? p.text;
      const offset = charAt(text, e.clientX, e.clientY);
      if (offset != null) {
        const end = p.end ?? words[at + 1]?.start ?? chapter.durationMs;
        ms = wordTimes(drawn, ms, end, fixed[p.id] === undefined ? p.timed : null)[wordHolding(drawn, offset)] ?? ms;
      }
    }
    setFollow(true);
    player.play(track, chapter.offset + ms);
  };

  return (
    <div onClick={hear}>
      {chapters.map((c, index) => {
        const ps = drawnWords(c);
        const all = loaded[c.recording] != null || (first?.recording === c.recording && first.complete);
        return (
          <section key={c.recording} data-fix-item={c.recording} data-load={ps ? undefined : c.recording}>
            <h2 className="chh">
              <span>{c.title}</span>
              <span>{clock(c.offset)}</span>
            </h2>
            {c.niggun ? (
              <p className="wait">ניגון, בלי מילים.</p>
            ) : ps === undefined || ps === null ? (
              <p className="wait">המילים נטענות…</p>
            ) : ps.length === 0 ? (
              <p className="wait">אין עדיין מילים לחלק הזה.</p>
            ) : (
              <>
                {ps.map((p) => (
                  <Para key={p.id} p={p} part={index} offset={c.offset} text={fixed[p.id] ?? p.text} fixed={fixed[p.id] !== undefined} now={part === index && p.id === heard} />
                ))}
                {!all && <div data-load={c.recording} />}
              </>
            )}
          </section>
        );
      })}
      {heard && times && current && <Follow paragraph={heard} offset={current.offset} times={times} playing={playing} following={following} />}
      {playing && !follow && heard && (
        <button
          type="button"
          className="backnow"
          onClick={() => {
            setFollow(true);
            bringNow();
          }}
        >
          חזרה למה שמתנגן
        </button>
      )}
    </div>
  );
}

/** One paragraph: the time it is heard, and its words (each its own, while it is the one being heard). */
function Para({ p, part, offset, text, fixed, now }: { p: Paragraph; part: number; offset: number; text: string; fixed: boolean; now: boolean }) {
  return (
    <div className={now ? 'tp now' : 'tp'} data-part={part} data-id={p.id}>
      <button type="button" className="tt" aria-label={`לשמוע מ־${clock(offset + (p.start ?? 0))}`}>
        {clock(offset + (p.start ?? 0))}
      </button>
      <p id={`w-${p.id}`} className={fixed ? 'tx fixed' : 'tx'}>
        {now ? <Spoken text={text} /> : text}
      </p>
    </div>
  );
}

/** A paragraph's words, each in its own span (the spaces between stay as they are, so the text is the same text). */
function Spoken({ text }: { text: string }) {
  const words = wordsOf(text);
  const parts: (string | ReactElement)[] = [];
  let at = 0;
  words.forEach((w, index) => {
    if (w.at > at) parts.push(text.slice(at, w.at));
    parts.push(
      <span key={index} className="w">
        {w.word}
      </span>,
    );
    at = w.at + w.word.length;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/**
 * Lights the word being said, many times a second, without drawing the page
 * again: the player tells where it is four times a second, and between those
 * the time is counted on from the last one.
 */
function Follow({ paragraph, offset, times, playing, following }: { paragraph: string; offset: number; times: number[]; playing: boolean; following: RefObject<boolean> }) {
  const position = usePlayer((s) => s.position);
  const speed = usePlayer((s) => s.speed);
  const last = useRef({ position, at: 0 });
  useEffect(() => {
    last.current = { position, at: performance.now() };
  }, [position]);
  useEffect(() => {
    const words = [...(document.getElementById(`w-${paragraph}`)?.querySelectorAll<HTMLElement>('.w') ?? [])];
    let shown = -2;
    let frame = 0;
    const tick = () => {
      // Counted on from the player's last word of where it is, never more than half a second past it.
      const since = playing ? Math.min(500, (performance.now() - last.current.at) * speed) : 0;
      const on = wordAt(times, last.current.position + since - offset);
      if (on !== shown) {
        words.forEach((w, index) => {
          w.classList.toggle('said', index < on);
          w.classList.toggle('on', index === on);
        });
        shown = on;
        const word = words[on];
        if (word && following.current && playing) {
          const box = word.getBoundingClientRect();
          if (box.top < 90 || box.bottom > innerHeight - 170) word.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
      if (playing) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [paragraph, offset, times, playing, speed, following, position]);
  return null;
}

/** Characters of `element`'s text before the point (x, y), or null when the browser cannot tell. */
function charAt(element: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const caret = doc.caretPositionFromPoint?.(x, y);
  const point = caret ? { node: caret.offsetNode, offset: caret.offset } : (() => {
    const range = document.caretRangeFromPoint?.(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  })();
  if (!point || !element.contains(point.node)) return null;
  const before = document.createRange();
  before.setStart(element, 0);
  before.setEnd(point.node, point.offset);
  return before.toString().length;
}
