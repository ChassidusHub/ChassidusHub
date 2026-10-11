import { data, Link } from 'react-router';
import { Folded, Figure, Meter, SeeAlso } from '../community/parts';
import { count, dayName, hebrewName, itemName, percent, yearName, type CatalogHealth } from '../community/data';
import { Row, Rows, Say, SectionHead, TopBar } from '../ui';
import type { Route } from './+types/health';

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'מצב הקטלוג · ChassidusHub' },
    { name: 'description', content: 'כמה מלא הקטלוג, שנה אחרי שנה ומדף אחרי מדף, ואיפה צריך עזרה: עמודים לבדיקה, הקלטות לסנכרון, קישורים שאינם עונים והצעות שמחכות.' },
  ];
}

type Labelled = { id: string; path: string | null; type: string; data: Record<string, unknown> };

/**
 * The health of the catalog (GET /v1/health) is the same for everyone, so it
 * is read here and kept a few minutes. The items its lists name only by id
 * (what a dead link was found in, the farbrengen of a recording) are read in
 * one batch, for their names; when that fails the ids still show. The page
 * also answers when the API does not, saying so, with 503: /health is
 * watched from outside, and an outage must show there.
 */
export async function loader({ context }: Route.LoaderArgs) {
  const health = (await context.api.health({ limit: 100 }).catch(() => null)) as CatalogHealth | null;
  if (!health) return data({ health: null, items: {} as Record<string, Labelled> }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const ids = [...new Set([...health.deadLinks.flatMap((d) => d.entities.slice(0, 5)), ...health.unsynced.flatMap((r) => (r.event ? [r.event] : []))])].slice(0, 200);
  const found = ids.length ? await context.api.getItems({ ids: ids.join(',') }).catch(() => null) : null;
  const items = Object.fromEntries(((found?.items ?? []) as Labelled[]).map((item) => [item.id, { id: item.id, path: item.path, type: item.type, data: { title: item.data.title, label: item.data.label, name: item.data.name, date: item.data.date } }]));
  return { health, items };
}

/** Kept a few minutes, unless it could not be read: then never. */
export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return { 'Cache-Control': loaderHeaders.get('Cache-Control') ?? 'public, max-age=300, s-maxage=600' };
}

/** The kinds of item a shelf holds, in the site's words. */
const KIND: Record<string, string> = {
  set: 'מדפים',
  work: 'ספרים',
  unit: 'יחידות',
  publication: 'הוצאות',
  event: 'התוועדויות',
  recording: 'הקלטות',
  text: 'טקסטים',
  person: 'אנשים',
  author: 'מחברים',
  scan: 'סריקות',
};

const pathOf = (item: Labelled | undefined, id: string) => (item?.type === 'event' && typeof item.data.date === 'string' ? `/listen/${item.data.date.slice(0, 4)}/${item.id}` : (item?.path ?? `/${id}`));

/**
 * The health of the catalog (thread 6, rebuilt from the old site): how full
 * it is, year by year and shelf by shelf, and where help is needed, in plain
 * tables and lists as a printed report would have them. Beside the Missing
 * board, which lists the gaps themselves.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { health, items } = loaderData;
  return (
    <>
      <TopBar title="מצב הקטלוג" />
      <main id="content" className="view wide">
        <h1>מצב הקטלוג</h1>
        <p className="lede">כמה מלא הקטלוג, ואיפה צריך עזרה.</p>
        {health ? <Report health={health} items={items} /> : <Say tone="bad">לא הצלחנו לקרוא את מצב הקטלוג כרגע. נסו שוב בעוד רגע.</Say>}
        <SectionHead title="עוד" />
        <SeeAlso
          links={[
            { to: '/missing', icon: 'search', label: 'מה חסר', sub: 'התוועדויות בלי הקלטה או הנחה, ספרים בלי סריקה' },
            { to: '/projects', icon: 'people', label: 'פרויקטים', sub: 'עובדים יחד על חוסר אחד' },
            { to: '/status', icon: 'check', label: 'מצב האתר', sub: 'האם הכל עובד עכשיו' },
          ]}
        />
      </main>
    </>
  );
}

function Report({ health, items }: { health: CatalogHealth; items: Record<string, Labelled> }) {
  const total = health.years.reduce((sum, y) => ({ events: sum.events + y.events, withRecording: sum.withRecording + y.withRecording, withText: sum.withText + y.withText, withTranscript: sum.withTranscript + y.withTranscript }), { events: 0, withRecording: 0, withText: 0, withTranscript: 0 });
  const unchecked = health.pages.total - health.pages.checked;
  const unsynced = health.recordings.total - health.recordings.synced;
  return (
    <>
      <div className="figures">
        {total.events > 0 && <Figure big={percent(total.withRecording, total.events)}>מההתוועדויות עם הקלטה</Figure>}
        {total.events > 0 && <Figure big={percent(total.withText, total.events)}>מההתוועדויות עם הנחה</Figure>}
        {health.pages.total > 0 && <Figure big={percent(health.pages.checked, health.pages.total)}>מהעמודים שמכונה קראה נבדקו</Figure>}
        {health.recordings.total > 0 && <Figure big={percent(health.recordings.synced, health.recordings.total)}>מההקלטות מסונכרנות</Figure>}
      </div>

      <SectionHead title="לפי שנה" more={{ label: 'מה חסר', to: '/missing' }} />
      {health.years.length ? (
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">שנה</th>
                <th scope="col">התוועדויות</th>
                <th scope="col">עם הקלטה</th>
                <th scope="col">עם הנחה</th>
                <th scope="col">עם תמלול</th>
              </tr>
            </thead>
            <tbody>
              {health.years.map((y) => (
                <tr key={y.year}>
                  <th scope="row">
                    <Link to={`/listen/${y.year}`}>{yearName(y.year)}</Link>
                  </th>
                  <YearCells row={y} />
                </tr>
              ))}
            </tbody>
            {health.years.length > 1 && (
              <tfoot>
                <tr>
                  <th scope="row">כל השנים</th>
                  <YearCells row={total} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <p className="faint">עוד אין התוועדויות בקטלוג.</p>
      )}

      <SectionHead title="לפי מדף" />
      <div className="table-wrap" tabIndex={0}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">מדף</th>
              <th scope="col">פריטים</th>
              <th scope="col">מה יש בו</th>
            </tr>
          </thead>
          <tbody>
            {health.sets.map((s) => (
              <tr key={s.id}>
                <th scope="row">
                  <Link to={s.path ?? `/${s.id}`}>{hebrewName(s.name, s.id)}</Link>
                </th>
                <td className="num">{count(s.items)}</td>
                <td className="faint">
                  {Object.entries(s.byType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, n]) => `${KIND[type] ?? type} ${count(n)}`)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHead title={`עמודים לבדיקה (${count(unchecked)})`} />
      <p className="muted">
        עמודי סריקות שמכונה קראה: {count(health.pages.total)}. מהם נבדקו בידי אדם: {count(health.pages.checked)} ({percent(health.pages.checked, health.pages.total)}).
      </p>
      {health.uncheckedScans.length ? (
        <Rows>
          <Folded
            items={health.uncheckedScans}
            row={(s) => (
              <Row
                key={s.scan}
                to={`/text/${s.scan}`}
                start={<span className="machine">מכונה</span>}
                title={hebrewName(s.title, s.scan)}
                sub={`${count(s.pages - s.checked)} לא נבדקו מתוך ${count(s.pages)} עמודים`}
                end={percent(s.checked, s.pages)}
              />
            )}
          />
        </Rows>
      ) : (
        <Say tone="good">כל העמודים שמכונה קראה נבדקו.</Say>
      )}

      <SectionHead title={`הקלטות לסנכרון (${count(unsynced)})`} />
      <p className="muted">
        הקלטות: {count(health.recordings.total)}. עם תמלול: {count(health.recordings.transcribed)}. מסונכרנות: {count(health.recordings.synced)} ({percent(health.recordings.synced, health.recordings.total)}).
      </p>
      {health.unsynced.length ? (
        <Rows>
          <Folded
            items={health.unsynced}
            row={(r) => {
              const event = r.event ? items[r.event] : undefined;
              return <Row key={r.id} to={event ? pathOf(event, event.id) : (r.path ?? `/${r.id}`)} title={event ? itemName(event) : hebrewName(r.title, r.id)} sub={event ? hebrewName(r.title) || undefined : undefined} />;
            }}
          />
        </Rows>
      ) : (
        <Say tone="good">כל ההקלטות עם תמלול מסונכרנות.</Say>
      )}

      <SectionHead title={`קישורים שאינם עונים (${count(health.links.dead)})`} />
      {health.links.checked ? (
        <>
          <p className="muted">
            קישורים שנבדקו: {count(health.links.checked)}. אינם עונים: {count(health.links.dead)}. נבדקו לאחרונה ב־{dayName(health.links.lastChecked)}.
          </p>
          {health.deadLinks.length ? (
            <Rows>
              <Folded
                items={health.deadLinks}
                row={(d) => (
                  <div className="row" key={d.url}>
                    <span className="t">
                      <a className="url" href={d.url} rel="noopener nofollow" dir="ltr">
                        {d.url}
                      </a>
                      <span>
                        {d.failingSince ? `לא עונה מאז ${dayName(d.failingSince)}` : 'לא עונה'}
                        {d.entities.slice(0, 5).map((id, at) => (
                          <span key={id} className="inline">
                            {at ? ', ' : ' · '}
                            <Link to={pathOf(items[id], id)}>{itemName(items[id], id)}</Link>
                          </span>
                        ))}
                        {d.entities.length > 5 ? ` ועוד ${count(d.entities.length - 5)}` : ''}
                      </span>
                    </span>
                    <span className="r" dir="ltr">
                      {d.status ? `HTTP ${d.status}` : (d.error ?? '–')}
                    </span>
                  </div>
                )}
              />
            </Rows>
          ) : (
            <Say tone="good">כל הקישורים עונים.</Say>
          )}
        </>
      ) : (
        <p className="faint">הקישורים עוד לא נבדקו.</p>
      )}

      <SectionHead title={`הצעות שמחכות (${count(health.openSuggestions.length)})`} more={{ label: 'כל ההצעות', to: '/suggestions' }} />
      {health.openSuggestions.length ? (
        <Rows>
          <Folded
            items={health.openSuggestions}
            row={(s) => <Row key={s.id} title={<bdi>{s.title}</bdi>} sub={`${s.authorName}${s.authorIsBot ? ' (בוט)' : ''} · מחכה מאז ${dayName(s.submittedAt)}`} />}
          />
        </Rows>
      ) : (
        <Say tone="good">אין הצעות שמחכות לבדיקה.</Say>
      )}
    </>
  );
}

function YearCells({ row }: { row: { events: number; withRecording: number; withText: number; withTranscript: number } }) {
  return (
    <>
      <td className="num">{count(row.events)}</td>
      {[
        ['הקלטה', row.withRecording],
        ['הנחה', row.withText],
        ['תמלול', row.withTranscript],
      ].map(([what, n]) => (
        <td key={what} className="num">
          {count(n as number)} <span className="faint">{percent(n as number, row.events)}</span>
          <Meter part={n as number} whole={row.events} label={`${percent(n as number, row.events)} עם ${what}`} />
        </td>
      ))}
    </>
  );
}
