import { data, useLoaderData } from 'react-router';
import { isNotLocal } from '../catalog/snapshot';
import { yearPage } from '../listen/data.server';
import { listening, yearLevel } from '../listen/common';
import { PlayRow } from '../listen/play';
import { TopBar } from '../ui';
import type { Route } from './+types/listen-year';
import { KEPT_PAGE, SNAPSHOT_PAGE } from '../lib/caching';

export const handle = { section: 'listen' };

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.name ?? 'שמיעה'} · ChassidusHub` }];
}

/**
 * One year: every event with recordings, month by month (app/listen/events.ts).
 * Drawn from the catalog snapshot's year file where the server has it (#321),
 * which costs a kept file's read rather than the API's 300 ms; such a page is
 * kept at the edge ten minutes (SNAPSHOT_PAGE), tagged with its events.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const year = Number(params.year);
  if (context.catalog) {
    try {
      const page = await yearPage(context.catalog, year);
      context.shows?.(page.months.flatMap((month) => month.rows.map((row) => row.id)));
      return data(page, { headers: { 'Cache-Control': SNAPSHOT_PAGE } });
    } catch (error) {
      if (!isNotLocal(error)) throw error;
    }
  }
  return yearPage(context.api, year);
}

/** A click here, drawn in the browser from the catalog snapshot it keeps (app/listen/clicks.ts). */
export const clientLoader = ({ params, serverLoader }: Route.ClientLoaderArgs) => import('../listen/clicks').then((clicks) => clicks.yearClick(params.year, serverLoader));

export const headers = ({ loaderHeaders }: Route.HeadersArgs) => ({ 'Cache-Control': loaderHeaders.get('Cache-Control') ?? KEPT_PAGE });

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
