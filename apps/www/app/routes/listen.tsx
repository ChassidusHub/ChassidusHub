import { useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import { clock, DAYS, LISTEN_COOKIE, listening, readStopped, resumeLink } from '../listen/common';
import { eventRow, eventsOn, eventsWithWords, fitting, nextDays, yearLabel, YEARS } from '../listen/data.server';
import { PlayRow } from '../listen/play';
import { Row, Rows, SearchField, TopBar } from '../ui';
import type { Route } from './+types/listen';

export const handle = { section: 'listen' };

export function meta(_: Route.MetaArgs) {
  return [{ title: 'שמיעה · ChassidusHub' }];
}

/** The years shown before "all years": one from each part of the Rebbe's nesius. */
const SOME_YEARS = [5710, 5711, 5722, 5734, 5747, 5752];

/**
 * Listening: where the reader stopped, the farbrengens of these days in
 * earlier years, and the way in by day of the year or by year.
 */
export async function loader({ request, context: { api } }: Route.LoaderArgs) {
  const [withWords, upcoming] = await Promise.all([eventsWithWords(api), eventsOn(api, nextDays(14)).catch(() => [])]);
  return {
    stopped: readStopped(request.headers.get('cookie'), LISTEN_COOKIE),
    these: fitting(upcoming, withWords, 5).map((e) => eventRow(e, withWords)),
    years: YEARS.map((year) => ({ year, label: yearLabel(year) })),
  };
}

export const headers = () => ({ 'Cache-Control': 'private, no-cache' });

export default function Listen() {
  const { stopped, these, years } = useLoaderData<typeof loader>();
  const [allYears, setAllYears] = useState(false);
  const shown = allYears ? years : years.filter((y) => SOME_YEARS.includes(y.year));
  return (
    <>
      <TopBar path={[listening]} />
      <main id="content" className="view">
        <h1 className="sr-only">שמיעה</h1>
        <form action="/search" role="search">
          <SearchField name="q" label="תאריך, מאורע או ד״ה" />
        </form>

        {stopped && (
          <>
            <h2>להמשיך</h2>
            <Rows>
              <Row
                title={stopped.title}
                sub={[stopped.sub, stopped.durationMs && stopped.at != null ? `נשארו ${clock(stopped.durationMs - stopped.at)}` : undefined].filter(Boolean).join(' · ')}
                to={resumeLink(stopped)}
              />
            </Rows>
          </>
        )}

        {these.length > 0 && (
          <>
            <h2>בימים אלה, בשנים קודמות</h2>
            <div className="rows">
              {these.map((row) => (
                <PlayRow key={row.id} row={row} />
              ))}
            </div>
          </>
        )}

        <h2>מאורעות</h2>
        <div className="chips">
          {DAYS.map((d) => (
            <Link key={d.day} className="chip" to={`/listen/day/${d.day}`}>
              {d.label}
            </Link>
          ))}
        </div>

        <h2>לפי שנה</h2>
        <div className="chips">
          {shown.map((y) => (
            <Link key={y.year} className="chip" to={`/listen/${y.year}`}>
              {y.label}
            </Link>
          ))}
          {!allYears && (
            <button type="button" className="chip" onClick={() => setAllYears(true)}>
              כל השנים
            </button>
          )}
        </div>
      </main>
    </>
  );
}
