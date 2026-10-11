import { useLoaderData } from 'react-router';
import { eventRow, eventsOn, eventsWithWords, fitting, nextDays, rebbeim } from '../listen/data.server';
import { PlayRow } from '../listen/play';
import { clock, LISTEN_COOKIE, READ_COOKIE, readStopped, resumeLink } from '../listen/common';
import listenCss from '../listen/listen.css?url';
import { Box, SearchField, SectionHead, Tile, TopBar } from '../ui';
import type { Route } from './+types/home';

export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: listenCss }];

export const handle = { section: 'home' };

export function meta(_: Route.MetaArgs) {
  return [{ title: 'ChassidusHub · תורת רבותינו נשיאינו' }, { name: 'description', content: 'לקרוא, ללמוד ולשמוע את הרבי' }];
}

/**
 * Home: search, where the reader stopped (from their cookies, so it is there
 * in the first paint), recordings that fit the coming days, and the Rebbeim.
 * A read that fails leaves its part out rather than failing the page.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const cookies = request.headers.get('cookie');
  const [withWords, upcoming, shelves] = await Promise.all([eventsWithWords(), eventsOn(nextDays(7)).catch(() => []), rebbeim().catch(() => [])]);
  return {
    listening: readStopped(cookies, LISTEN_COOKIE),
    reading: readStopped(cookies, READ_COOKIE),
    recordings: fitting(upcoming, withWords, 3).map((e) => eventRow(e, withWords)),
    rebbeim: shelves,
  };
}

export const headers = () => ({ 'Cache-Control': 'private, no-cache' });

export default function Home() {
  const { listening, reading, recordings, rebbeim } = useLoaderData<typeof loader>();
  return (
    <>
      <TopBar />
      <main id="content" className="view">
        <section className="hero">
          <h1>תורת רבותינו נשיאינו</h1>
          <p>לקרוא, ללמוד ולשמוע את הרבי</p>
          <form action="/search" role="search">
            <SearchField size="big" name="q" label="ד״ה, ספר, פרשה או תאריך" />
          </form>
        </section>

        {(listening || reading) && (
          <div className="tiles">
            {listening && (
              <Tile
                icon="play"
                kicker="להמשיך לשמוע"
                title={listening.title}
                sub={[listening.sub, listening.durationMs && listening.at != null ? `נשארו ${clock(listening.durationMs - listening.at)}` : undefined].filter(Boolean).join(' · ')}
                to={resumeLink(listening)}
              />
            )}
            {reading && <Tile icon="book" kicker="להמשיך ללמוד" title={reading.title} sub={reading.sub} to={reading.to} />}
          </div>
        )}

        {recordings.length > 0 && (
          <>
            <SectionHead title="לשמוע את הרבי" more={{ label: 'כל ההקלטות', to: '/listen' }} />
            <div className="rows">
              {recordings.map((row) => (
                <PlayRow key={row.id} row={row} />
              ))}
            </div>
          </>
        )}

        <SectionHead title="הספרייה" more={{ label: 'הכול', to: '/library' }} />
        <div className="boxes">
          {rebbeim.map((r) => (
            <Box key={r.slug} title={r.name} sub={r.sefarim} to={`/library/${r.slug}`} />
          ))}
        </div>
      </main>
    </>
  );
}
