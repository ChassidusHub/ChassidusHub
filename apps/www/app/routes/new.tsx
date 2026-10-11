import { eventRow, eventsOn, eventsWithWords, yearLabel } from '../listen/data.server';
import { Link } from 'react-router';
import { PlayRow } from '../listen/play';
import { Icon, Row, Rows, SectionHead, TopBar } from '../ui';
import type { Route } from './+types/new';

export const handle = { section: 'listen' };

export function meta(_: Route.MetaArgs) {
  return [{ title: 'מה חדש · ChassidusHub' }, { name: 'description', content: 'מה שאפשר עכשיו לשמוע ולקרוא: התוועדויות חשוון וכסלו עם המילים, וטקסטים שנקראו מהסריקות.' }];
}

/** The months of the newest transcripts, as the calendar numbers them (Tishrei is 01). */
const MONTHS = [
  { month: '02', name: 'חשוון' },
  { month: '03', name: 'כסלו' },
];
const daysOf = (month: string) => Array.from({ length: 30 }, (_, at) => `${month}-${String(at + 1).padStart(2, '0')}`);

/** The newest texts read from scans, each where it is read. */
const TEXTS = [
  { title: 'לקוטי שיחות: הטקסט', sub: 'נקרא מהסריקות, חלק אחר חלק, עם ההערות במקומן.', to: '/likkutei-sichos' },
  { title: 'ספר השיחות תשמ״ז–תשנ״ב', sub: 'כל שנים עשר החלקים, נקראו מהסריקות.', to: '/sefer-hasichos-rebbe' },
];

/**
 * The farbrengens of Cheshvan and Kislev in every year, month by month and
 * the latest year first, each to play at once; whether its words are there to
 * follow. The same for everyone.
 */
export async function loader({ context: { api } }: Route.LoaderArgs) {
  const [withWords, ...months] = await Promise.all([eventsWithWords(api), ...MONTHS.map((m) => eventsOn(api, daysOf(m.month)).catch(() => []))]);
  return {
    months: MONTHS.map((m, at) => {
      const events = months[at]!.sort((a, b) => b.data.date.slice(0, 4).localeCompare(a.data.date.slice(0, 4)) || a.data.date.localeCompare(b.data.date));
      const years = [...new Set(events.map((e) => Number(e.data.date.slice(0, 4))))];
      return {
        ...m,
        count: events.length,
        years: years.map((year) => ({ label: yearLabel(year), rows: events.filter((e) => e.data.date.startsWith(String(year))).map((e) => eventRow(e, withWords)) })),
      };
    }),
  };
}

export const headers = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

/**
 * What is new (thread 6, rebuilt from the old /new): what can be heard and
 * read now. The words of these farbrengens were written by a machine, and the
 * texts were read from the scans by one; both are said to be so.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { months } = loaderData;
  return (
    <>
      <TopBar title="מה חדש" />
      <main id="content" className="view">
        <h1>מה חדש</h1>
        <p className="lede">מה שאפשר עכשיו לשמוע ולקרוא.</p>
        <p className="faint sm">
          <span className="machine">מכונה</span> המילים של ההקלטות והטקסטים מהסריקות נכתבו בידי מכונה. אנשים בודקים אותם, <Link to="/back">ואפשר לעזור</Link>.
        </p>

        <SectionHead title="טקסטים חדשים" />
        <Rows>
          {TEXTS.map((text) => (
            <Row key={text.to} start={<Icon name="book" />} title={text.title} sub={text.sub} to={text.to} />
          ))}
        </Rows>

        {months.map((month) => (
          <section key={month.month} aria-label={`התוועדויות ${month.name}`}>
            <SectionHead title={`התוועדויות ${month.name} (${month.count})`} />
            {month.years.length === 0 && <p className="faint">אין עדיין הקלטות מהחודש הזה.</p>}
            {month.years.map((year) => (
              <div key={year.label}>
                <h3 className="newyear">{year.label}</h3>
                <div className="rows">
                  {year.rows.map((row) => (
                    <PlayRow key={row.id} row={row} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
    </>
  );
}
