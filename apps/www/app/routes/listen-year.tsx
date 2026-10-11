import { useLoaderData } from 'react-router';
import { eventRow, eventsIn, eventsWithWords, monthLabel, yearLabel, YEARS } from '../listen/data.server';
import { listening, yearLevel, type EventRow } from '../listen/common';
import { PlayRow } from '../listen/play';
import listenCss from '../listen/listen.css?url';
import { TopBar } from '../ui';
import type { Route } from './+types/listen-year';

export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: listenCss }];

export const handle = { section: 'listen' };

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.name ?? 'שמיעה'} · ChassidusHub` }];
}

/** One year: every event with recordings, month by month. */
export async function loader({ params }: Route.LoaderArgs) {
  const year = Number(params.year);
  if (!YEARS.includes(year)) throw new Response('not found', { status: 404 });
  const [withWords, events] = await Promise.all([eventsWithWords(), eventsIn(year)]);
  const months: { name: string; rows: EventRow[] }[] = [];
  for (const event of events) {
    const name = monthLabel(event.data.date);
    if (months.at(-1)?.name !== name) months.push({ name, rows: [] });
    months.at(-1)!.rows.push(eventRow(event, withWords, { dateFirst: false }));
  }
  return { year, name: yearLabel(year), months, years: YEARS.map((y) => ({ year: y, label: yearLabel(y) })) };
}

export const headers = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

export default function ListenYear() {
  const { year, name, months, years } = useLoaderData<typeof loader>();
  return (
    <>
      <TopBar path={[listening, yearLevel(years, year)]} />
      <main id="content" className="view">
        <h1>{name}</h1>
        {months.length === 0 && <p className="faint">אין עדיין הקלטות מהשנה הזאת.</p>}
        {months.map((month) => (
          <section key={month.name}>
            <h2>{month.name}</h2>
            <div className="rows">
              {month.rows.map((row) => (
                <PlayRow key={row.id} row={row} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
