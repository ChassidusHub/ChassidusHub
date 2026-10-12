import { useLoaderData } from 'react-router';
import { eventRow, eventsOn, eventsWithWords, fitting, nextDays, rebbeim } from '../listen/data.server';
import { PlayRow } from '../listen/play';
import { clock, LISTEN_COOKIE, READ_COOKIE, resumeLink } from '../listen/common';
import { useStopped } from '../listen/useStopped';
import { todaysPage } from '../lib/caching';
import { Box, SearchField, SectionHead, Tile, TopBar } from '../ui';
import type { Route } from './+types/home';

export const handle = { section: 'home' };

export function meta(_: Route.MetaArgs) {
  return [{ title: 'ChassidusHub · תורת רבותינו נשיאינו' }, { name: 'description', content: 'לקרוא, ללמוד ולשמוע את הרבי' }];
}

/**
 * Home: search, where the reader stopped (from their cookies, read in the
 * browser, so the page is the same for everyone and kept at the edge),
 * recordings that fit the coming days, and the Rebbeim. A read that fails
 * leaves its part out rather than failing the page.
 */
export async function loader({ context: { api } }: Route.LoaderArgs) {
  const [withWords, upcoming, shelves] = await Promise.all([eventsWithWords(api), eventsOn(api, nextDays(7)).catch(() => []), rebbeim(api).catch(() => [])]);
  return {
    recordings: fitting(upcoming, withWords, 3).map((e) => eventRow(e, withWords)),
    rebbeim: shelves,
  };
}

export const headers = () => ({ 'Cache-Control': todaysPage() });

export default function Home() {
  const { recordings, rebbeim } = useLoaderData<typeof loader>();
  const listening = useStopped(LISTEN_COOKIE);
  const reading = useStopped(READ_COOKIE);
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

        {/* Kept open from the first paint when this browser has somewhere to continue (root.tsx). */}
        <div className="tiles resume">
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
            <Box key={r.to} title={r.name} sub={r.sefarim} to={r.to} />
          ))}
        </div>
      </main>
    </>
  );
}
