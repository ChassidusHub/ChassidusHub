import { useLoaderData } from 'react-router';
import { fromSnapshotOr } from '../catalog/localApi';
import { yearPage } from '../listen/data.server';
import { listening, yearLevel } from '../listen/common';
import { PlayRow } from '../listen/play';
import { TopBar } from '../ui';
import type { Route } from './+types/listen-year';

export const handle = { section: 'listen' };

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.name ?? 'שמיעה'} · ChassidusHub` }];
}

/** One year: every event with recordings, month by month (app/listen/events.ts), from the catalog snapshot when the server holds it. */
export async function loader({ params, context }: Route.LoaderArgs) {
  return fromSnapshotOr(context.catalog, context.api, (api) => yearPage(api, Number(params.year)));
}

/** A click here, drawn in the browser from the catalog snapshot it keeps (app/listen/clicks.ts). */
export const clientLoader = ({ params, serverLoader }: Route.ClientLoaderArgs) => import('../listen/clicks').then((clicks) => clicks.yearClick(params.year, serverLoader));

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
