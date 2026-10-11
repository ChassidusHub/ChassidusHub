import { useLoaderData } from 'react-router';
import { eventRow, eventsOn, eventsWithWords } from '../listen/data.server';
import { DAYS, listening } from '../listen/common';
import { PlayRow } from '../listen/play';
import { TopBar, type PathLevel } from '../ui';
import type { Route } from './+types/listen-day';

export const handle = { section: 'listen' };

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.label ?? 'שמיעה'} · ChassidusHub` }];
}

/** One day of the year (י״ט כסלו, יו״ד שבט): its farbrengens in every year, the latest first. */
export async function loader({ params }: Route.LoaderArgs) {
  const day = DAYS.find((d) => d.day === params.day);
  if (!day) throw new Response('not found', { status: 404 });
  const [withWords, events] = await Promise.all([eventsWithWords(), eventsOn([day.day])]);
  const rows = events.sort((a, b) => b.data.date.localeCompare(a.data.date)).map((e) => eventRow(e, withWords));
  return { day: day.day, label: day.label, rows };
}

export const headers = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

export default function ListenDay() {
  const { day, label, rows } = useLoaderData<typeof loader>();
  const level: PathLevel = {
    key: 'day',
    label,
    title: 'מאורעות',
    items: DAYS.map((d) => ({ key: d.day, label: d.label, to: `/listen/day/${d.day}`, current: d.day === day })),
  };
  return (
    <>
      <TopBar path={[listening, level]} />
      <main id="content" className="view">
        <h1>{label}</h1>
        {rows.length === 0 && <p className="faint">אין עדיין הקלטות מהיום הזה.</p>}
        <div className="rows">
          {rows.map((row) => (
            <PlayRow key={row.id} row={row} />
          ))}
        </div>
      </main>
    </>
  );
}
