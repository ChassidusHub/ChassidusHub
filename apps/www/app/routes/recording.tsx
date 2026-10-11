import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { redirect, useLoaderData, useSearchParams } from 'react-router';
import { notFound } from '../listen/api.server';
import { YEARS, yearLabel } from '../listen/data.server';
import listenCss from '../listen/listen.css?url';
import { player, usePlaying, type Part } from '../listen/play';
import { recordedEvent } from '../listen/recording.server';
import { API, clock, eventLevel, LISTEN_COOKIE, listening, paragraphsOf, yearLevel, writeStopped, type ApiTranscript, type Chapter, type Paragraph } from '../listen/common';
import { Button, IconButton, TopBar } from '../ui';
import type { Route } from './+types/recording';

export const handle = { section: 'listen' };

export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: listenCss }];

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.date}${data.title ? ` · ${data.title}` : ''} · ChassidusHub` : 'ChassidusHub' }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const found = await recordedEvent(params.event).catch(notFound);
  if (String(found.year) !== params.year) throw redirect(`/listen/${found.year}/${found.id}`, 301);
  return { ...found, years: YEARS.map((year) => ({ year, label: yearLabel(year) })) };
}

export const headers = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

/** Words still to come: null while they load, [] when a part has none yet. */
type Words = Record<string, Paragraph[] | null>;

/**
 * A recorded event: one continuous text, a small heading where each part
 * starts. Tap any words to hear them; while it plays, the words being said are
 * lit and kept in view, until the reader scrolls away ("back to now" returns).
 */
export default function Recording() {
  const data = useLoaderData<typeof loader>();
  const { id, year, yearName, date, title, totalMs, chapters } = data;
  const to = `/listen/${year}/${id}`;
  const [search] = useSearchParams();
  const playing = usePlaying();
  const mine = playing?.to === to ? playing : null;

  const event = useMemo(() => ({ to, title: date, parts: chapters.map((c): Part => ({ recording: c.recording, title: c.title, src: c.src, durationMs: c.durationMs })) }), [to, date, chapters]);

  // The words: what came with the page, then each part's as it nears the screen or starts playing.
  const [words, setWords] = useState<Words>(() => Object.fromEntries(chapters.filter((c) => c.complete).map((c) => [c.recording, c.words ?? []])));
  const asked = useRef(new Set<string>());
  const load = useCallback((chapter: Chapter) => {
    if (chapter.niggun || asked.current.has(chapter.recording)) return;
    asked.current.add(chapter.recording);
    fetch(`${API}/v1/recordings/${chapter.recording}/transcript`)
      .then((r) => (r.ok ? (r.json() as Promise<ApiTranscript>) : null))
      .then((t) => setWords((w) => ({ ...w, [chapter.recording]: t ? paragraphsOf(t) : [] })))
      .catch(() => setWords((w) => ({ ...w, [chapter.recording]: [] })));
  }, []);
  // A part's words load when its place nears the screen: the end of the words that came with the page, or its heading.
  const sections = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const chapter = chapters.find((c) => c.recording === (entry.target as HTMLElement).dataset.load);
          if (entry.isIntersecting && chapter) load(chapter);
        }
      },
      { rootMargin: '800px 0px' },
    );
    for (const el of document.querySelectorAll('[data-load]')) seen.observe(el);
    return () => seen.disconnect();
  }, [chapters, load]);

  const current = mine ? chapters[mine.index] : undefined;
  useEffect(() => {
    if (current) load(current);
  }, [current, load]);

  // The paragraph being said now.
  const now = useMemo(() => {
    if (!mine || !current) return null;
    let found: Paragraph | null = null;
    for (const p of words[current.recording] ?? current.words ?? []) if (p.start != null && p.start <= mine.at) found = p;
    return found?.id ?? null;
  }, [mine, current, words]);

  // Follow the sound, until the reader scrolls on their own.
  const [follow, setFollow] = useState(true);
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
  const bringNow = useCallback(() => document.getElementById(`w-${now}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), [now]);
  useEffect(() => {
    if (follow && now && mine?.playing) bringNow();
  }, [now, follow, bringNow, mine?.playing]);

  // Where the reader stopped, for Home and listening's "continue" (every ten seconds of playing).
  const lastSaved = useRef(-1);
  useEffect(() => {
    if (!mine || !current || Math.abs(mine.at - lastSaved.current) < 10_000) return;
    lastSaved.current = mine.at;
    writeStopped(LISTEN_COOKIE, { to, title: `${date} · ${current.title}`, sub: title || undefined, recording: current.recording, at: Math.floor(mine.at), durationMs: current.durationMs });
  }, [mine, current, to, date, title]);

  // Opened from "continue" (?r=…&t=…) or from a list's play button (?play=1).
  const resume = useMemo(() => {
    const index = chapters.findIndex((c) => c.recording === search.get('r'));
    return index >= 0 ? { index, at: Number(search.get('t') ?? 0) * 1000 } : null;
  }, [chapters, search]);
  useEffect(() => {
    if (search.get('play') === '1' && !mine) player.play(event, 0, 0);
    else if (resume) sections.current.get(chapters[resume.index]!.recording)?.scrollIntoView({ block: 'start' });
    // Only when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hear = (e: MouseEvent) => {
    const p = (e.target as HTMLElement).closest<HTMLElement>('[data-at]');
    if (!p || !getSelection()?.isCollapsed) return;
    setFollow(true);
    player.play(event, Number(p.dataset.part), Number(p.dataset.at));
  };

  const machine = Object.values(words).some((ps) => ps?.some((p) => p.machine)) || chapters.some((c) => c.words?.some((p) => p.machine));
  const parts = chapters.length;

  return (
    <>
      <TopBar path={[listening, yearLevel(data.years, year), eventLevel(year, yearName, { id, label: date })]} end={<IconButton icon="more" label="עוד" />} />
      <main id="content" className="view">
        <h1>{date}</h1>
        <p className="faint sm">{[title, parts > 1 ? `${parts} חלקים` : undefined, totalMs ? clock(totalMs) : undefined].filter(Boolean).join(' · ')}</p>
        <div className="rec-acts">
          {mine ? (
            <Button icon={mine.playing ? 'pause' : 'play'} onClick={() => player.toggle()}>
              {mine.playing ? 'עצירה' : 'להמשיך'}
            </Button>
          ) : resume ? (
            <Button icon="play" onClick={() => player.play(event, resume.index, resume.at)}>
              להמשיך מ־{clock(resume.at)}
            </Button>
          ) : (
            <Button icon="play" onClick={() => player.play(event, 0, 0)} disabled={!parts}>
              לנגן מההתחלה
            </Button>
          )}
          {machine && <span className="machine">נשמע במכונה, עוד לא נבדק</span>}
        </div>
        {!parts && <p className="faint">אין עדיין הקלטה שאפשר לשמוע כאן.</p>}

        <div className="yi" onClick={hear}>
          {chapters.map((c, index) => {
            const ps = words[c.recording] ?? c.words;
            return (
              <section
                key={c.recording}
                data-load={c.words ? undefined : c.recording}
                ref={(el) => {
                  if (el) sections.current.set(c.recording, el);
                  else sections.current.delete(c.recording);
                }}
              >
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
                  <p>
                    {ps.map((p) => (
                      <span key={p.id}>
                        <span id={`w-${p.id}`} className={p.id === now ? 'p now' : 'p'} data-part={index} data-at={p.start ?? 0}>
                          {p.text}
                        </span>{' '}
                      </span>
                    ))}
                    {!words[c.recording] && <span data-load={c.recording} />}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </main>
      {mine?.playing && !follow && now && (
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
    </>
  );
}
