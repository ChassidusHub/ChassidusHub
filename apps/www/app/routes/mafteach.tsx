import { toHebrewNumeral } from '@chassidushub/hebrew';
import { Suspense } from 'react';
import { Await, Form, Link, useLocation } from 'react-router';
import { Icon, SearchField, TopBar } from '../ui';
import type { Route } from './+types/mafteach';

/** The index whose volumes' index pages are gathered here, and the sefer they index. */
const INDEX = '/likkutei-sichos-mafteach-inyanim';
const SEFER = '/likkutei-sichos';
const PER_PAGE = 40;
/** About this many places a page: a page of results stays small. */
const PLACES = 150;

type Topics = Awaited<ReturnType<Route.LoaderArgs['context']['api']['mafteach']>>['topics'];
type Place = Topics[number]['volumes'][number]['places'][number];

/** A place's pages: one page, or from one to another. */
const pagesOf = (place: Place) => (place.to && place.to !== place.page ? `${place.page}-${place.to}` : String(place.page));

/** A reference as the printed indexes write it: the volume (ח״ב, חט״ו) and its page. */
function chipOf(volume: number, place: Place): string {
  const n = toHebrewNumeral(volume).replace(/[׳״]/g, '');
  return `ח${n.slice(0, -1)}״${n.slice(-1)} ${pagesOf(place)}`;
}

/** Where a reference opens: the sicha's page here, else its PDF at the page. */
const linkOf = (place: Place): { to: string; outside: boolean } | null =>
  place.text ? { to: place.text, outside: false } : place.pdf ? { to: `${place.pdf}${place.at ? `#page=${place.at}` : ''}`, outside: true } : null;

/**
 * A topic's references as the index lists them: one line for each thing it
 * says of the topic, and on it every volume's page that says it, so the same
 * words in two volumes are one line with two references. The pages with no
 * words of their own come first, as the topic's own line.
 */
function linesOf(topic: Topics[number]) {
  const lines = new Map<string, Array<{ label: string; title: string; link: { to: string; outside: boolean } | null; machine: boolean; fix: string | null }>>();
  for (const volume of topic.volumes) {
    for (const place of volume.places) {
      const context = place.context?.trim() ?? '';
      const refs = lines.get(context) ?? [];
      refs.push({ label: chipOf(volume.volume, place), title: place.sicha ?? volume.label, link: linkOf(place), machine: volume.machine, fix: volume.path });
      lines.set(context, refs);
    }
  }
  return [...lines].map(([context, refs]) => ({ context, refs })).sort((a, b) => Number(!!a.context) - Number(!!b.context));
}

/**
 * Likkutei Sichos' whole subject index on one page: every topic once, and
 * under it each thing the index says of it, with a reference for every
 * volume's page that says it (ח״ב 412), opening the sicha there. Nothing of
 * it is kept here: it is gathered from the volumes' index pages
 * (GET /v1/mafteach), so a fix made there shows here. A letter at a time, or
 * what a search finds. What a machine read from the printed indexes is
 * labelled until it is checked. The page never waits for the index: its
 * frame and search box show at once, and the topics come after.
 */
export function loader({ request, context: { api } }: Route.LoaderArgs) {
  const { q, letter, from, back } = asked(request);
  // Before the index's pages are in the catalog (a fresh copy of the site), the page says so rather than failing.
  const data = api
    .mafteach({ index: INDEX, sefer: SEFER, q: q || undefined, letter: q ? undefined : letter, limit: PER_PAGE, places: PLACES, offset: from })
    .catch((error: { status?: number }) => {
      if (error.status === 404) return null;
      throw error;
    })
    .then((index) => {
      if (!index) return null;
      const shown = q ? null : (index.topics[0]?.letter ?? index.letters[0]?.letter ?? null);
      return {
        letters: index.letters,
        letter: shown,
        inLetter: shown ? (index.letters.find((l) => l.letter === shown)?.topics ?? null) : null,
        totals: index.totals,
        found: index.found,
        offset: index.offset,
        next: index.next,
        back,
        machine: index.topics.some((t) => t.volumes.some((v) => v.machine)),
        topics: index.topics.map((t) => ({ topic: t.topic, lines: linesOf(t) })),
      };
    });
  return { q, data };
}

/** Opened from inside the site, the page and its search box are drawn at once; the topics follow. */
export function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs) {
  return { q: asked(request).q, data: serverLoader().then((d) => d.data) };
}

/** What the address asks for: a search, or a letter, and how far into it (with the offsets walked so far, for the way back). */
function asked(request: Request) {
  const url = new URL(request.url);
  return {
    q: url.searchParams.get('q')?.trim().slice(0, 200) ?? '',
    letter: url.searchParams.get('letter') ?? undefined,
    from: Math.max(0, Math.floor(Number(url.searchParams.get('from')) || 0)),
    back: (url.searchParams.get('back')?.split(',').map(Number) ?? []).filter((n) => Number.isInteger(n) && n >= 0).slice(-50),
  };
}

type Index = NonNullable<Awaited<ReturnType<typeof loader>['data']>>;

export const headers = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

export const handle = { section: 'library' };

export function meta() {
  return [{ title: 'מפתח ענינים ללקוטי שיחות · ChassidusHub' }];
}

export default function Mafteach({ loaderData: { q, data } }: Route.ComponentProps) {
  // Another letter, search or page shows its own frame at once rather than the last topics.
  const { search } = useLocation();
  return (
    <>
      <TopBar title="מפתח ענינים" sub="לקוטי שיחות" />
      <main id="content" className="view it-text">
        <h1>מפתח ענינים ללקוטי שיחות</h1>
        <p className="lede muted">
          כל הנושאים שבמפתחות כל החלקים, יחד. לכל נושא, בכל חלק, העמודים, מה נאמר שם, וקישור לשיחה.
          <Suspense fallback={null}>
            <Await resolve={data} errorElement={null}>
              {(index) => index && ` ${index.totals.topics} נושאים · ${index.totals.places} מראי מקומות · ${index.totals.volumes} חלקים.`}
            </Await>
          </Suspense>
        </p>
        <Form method="get" role="search" className="search-form">
          <SearchField name="q" defaultValue={q} placeholder="חיפוש נושא, או מילה מתוך ההקשר" label="חיפוש במפתח" />
        </Form>
        <p className="faint sm">
          <Link to="/likkutei-sichos-mafteach-sfarim">המפתחות כפי שנדפסו</Link>
        </p>

        {/* No errorElement: an index that fails to come (not merely missing) goes to the route's error page, as before. */}
        <Suspense key={search} fallback={<p className="faint" aria-busy="true">רגע…</p>}>
          <Await resolve={data}>{(index) => (index ? <Topics q={q} index={index} /> : <p className="faint">המפתחות עדיין לא נמצאים באתר.</p>)}</Await>
        </Suspense>
        <p className="note">למפתחות חלקים כו-כט עדיין לא נמצא מקור.</p>
      </main>
    </>
  );
}

/** The letters, the topics of one letter (or what a search found) with their references, and the pages of them. */
function Topics({ q, index }: { q: string; index: Index }) {
  const here = (from: number, trail: number[]) => {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    else if (index.letter) query.set('letter', index.letter);
    if (from) query.set('from', String(from));
    if (trail.length) query.set('back', trail.join(','));
    return `/mafteach?${query}`;
  };
  // Pages end where their places run out, so the way back is the offsets walked so far.
  const prev = index.offset > 0 ? here(index.back.at(-1) ?? 0, index.back.slice(0, -1)) : null;
  const next = index.next !== null ? here(index.next, [...index.back, index.offset]) : null;
  return (
    <>
      <nav aria-label="לפי אות" className="it-letters">
        {index.letters.map((l) => (
          <Link key={l.letter} to={`/mafteach?letter=${encodeURIComponent(l.letter)}`} aria-current={!q && l.letter === index.letter ? 'page' : undefined} title={`${l.topics} נושאים`}>
            {l.letter}
          </Link>
        ))}
      </nav>

      {index.machine && (
        <p className="mach">
          <span className="machine">חלק מהמפתחות נקראו במכונה מתוך הספרים ועוד לא נבדקו. טעות? מתקנים בעמוד המפתח של אותו חלק, והתיקון מופיע כאן.</span>
        </p>
      )}
      {q ? (
        <p>
          נמצאו {index.found} נושאים עבור ״{q}״. <Link to="/mafteach">ניקוי החיפוש</Link>
        </p>
      ) : index.letter ? (
        <h2 className="it-big">
          {index.letter}
          {index.inLetter !== null && <span className="faint sm"> · {index.inLetter} ערכים</span>}
        </h2>
      ) : null}

      {index.topics.length ? (
        <div className="it-topics-index">
          {index.topics.map((topic, at) => (
            <article key={`${at}-${topic.topic}`} className="it-entry">
              <h3>{topic.topic}</h3>
              {topic.lines.map((line) => (
                <p key={line.context || '-'} className="it-entry-line">
                  {line.context && <span className="ctx">{line.context}</span>}
                  {line.refs.map((ref, at) =>
                    ref.link ? (
                      ref.link.outside ? (
                        <a key={at} className={ref.machine ? 'chip it-ref mach' : 'chip it-ref'} href={ref.link.to} target="_blank" rel="noopener" title={ref.title}>
                          {ref.label}
                        </a>
                      ) : (
                        <Link key={at} className={ref.machine ? 'chip it-ref mach' : 'chip it-ref'} to={ref.link.to} title={ref.title}>
                          {ref.label}
                        </Link>
                      )
                    ) : (
                      <span key={at} className={ref.machine ? 'chip it-ref mach' : 'chip it-ref'} title={ref.title}>
                        {ref.label}
                      </span>
                    ),
                  )}
                </p>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <p className="faint">לא נמצא נושא כזה. נסו מילה אחרת, או עיינו לפי האות.</p>
      )}

      {(prev || next) && (
        <nav className="endnav" aria-label="עמודי התוצאות">
          {prev ? (
            <Link to={prev}>
              <Icon name="chevron-right" />
              הקודמים
            </Link>
          ) : (
            <span />
          )}
          <span className="faint sm">{`${index.offset + 1}-${index.offset + index.topics.length} מתוך ${index.found}`}</span>
          {next ? (
            <Link to={next}>
              הבאים
              <Icon name="chevron-left" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
