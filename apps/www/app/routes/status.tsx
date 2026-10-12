import type { StatusReport } from '@chassidushub/client';
import { Suspense } from 'react';
import { Await } from 'react-router';
import { Meter, SeeAlso } from '../community/parts';
import { count } from '../community/data';
import { Icon, SectionHead, TopBar, type IconName } from '../ui';
import type { Route } from './+types/status';

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'מצב האתר · ChassidusHub' },
    { name: 'description', content: 'האם האתר, ה-API, שרת ה-MCP ומסד הנתונים עונים. נבדק כל חמש דקות.' },
  ];
}

type CheckId = StatusReport['checks'][number]['id'];
type State = StatusReport['state'];

const API = 'https://api.chassidushub.org';

/**
 * The API checks every part every five minutes and keeps the last report with
 * ninety days of them (services/api/src/status.ts); reading it never asks the
 * database, so it answers when the database does not. When the API itself
 * does not answer, the page says so from here, since it was made: the site
 * is up and the API is not. The page never waits for the report: its frame
 * shows at once, and the report comes after it.
 */
export function loader({ context }: Route.LoaderArgs) {
  const data = context.api
    .status()
    .catch((error: unknown) => {
      console.error('status', error);
      return null;
    })
    .then((answer) => ({ now: answer?.now ?? new Date().toISOString(), report: answer?.report ?? null, apiAnswered: answer !== null }));
  return { data };
}

/** Opened from inside the site, the frame is drawn at once; the report follows. */
export function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  return { data: serverLoader().then((d) => d.data) };
}

type Answer = Awaited<ReturnType<typeof loader>['data']>;

/** A minute, not the usual few: this page is read when something is wrong. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=60, s-maxage=60' };
}

const PARTS: Record<CheckId, { icon: IconName; name: string; about: string }> = {
  site: { icon: 'globe', name: 'האתר', about: 'chassidushub.org' },
  api: { icon: 'code', name: 'ה-API', about: 'לתוכנות ולאפליקציה' },
  mcp: { icon: 'people', name: 'שרת ה-MCP', about: 'לאפליקציות בינה מלאכותית שמחוברות לאתר' },
  database: { icon: 'library', name: 'מסד הנתונים', about: 'הקטלוג עצמו' },
  quota: { icon: 'list', name: 'מכסת השאילתות היומית', about: 'כמה שאילתות למסד הנתונים מותרות ביום' },
  workers: { icon: 'versions', name: 'העומס על השרתים', about: 'כמה זמן מעבד לוקחת בקשה' },
  jobs: { icon: 'listen', name: 'משימות מתוזמנות', about: 'עדכונים במייל, Webhooks' },
};
const ORDER: CheckId[] = ['site', 'api', 'mcp', 'database', 'quota', 'workers', 'jobs'];

const WORD: Record<State, string> = { up: 'עובד', degraded: 'חלקית', down: 'לא עובד', unknown: 'לא נבדק' };
const STATE_ICON: Record<State, IconName> = { up: 'check', degraded: 'flag', down: 'close', unknown: 'more' };

/** A report older than this means the checks stopped running (they run every five minutes). */
const STALE_MS = 20 * 60_000;

/** A day's state: any time down is down, any time slow is partly. */
function dayState(day: { runs: number; degraded: number; down: number } | undefined): State {
  if (!day || !day.runs) return 'unknown';
  return day.down ? 'down' : day.degraded ? 'degraded' : 'up';
}

/** Of the runs kept, how many were not down, to a tenth of a percent, never rounded up to 100% with an outage in it. */
function uptime(report: StatusReport, id: CheckId): number | null {
  let runs = 0;
  let down = 0;
  for (const day of report.days) {
    runs += day.checks[id]?.runs ?? 0;
    down += day.checks[id]?.down ?? 0;
  }
  return runs ? Math.floor(((runs - down) / runs) * 1000) / 10 : null;
}

/** The 90 days up to `today`, oldest first. */
function lastDays(today: string): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: 90 }, (_, at) => new Date(end - (89 - at) * 86_400_000).toISOString().slice(0, 10));
}

const utc = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const when = (iso: string) => `${utc.format(new Date(iso))} UTC`;

function lasted(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} שע׳ ו-${rest} דק׳` : `${hours} שע׳`;
}

/**
 * Whether ChassidusHub is up (thread 6, rebuilt from the old site): one line
 * on the whole first, then each part with its state and ninety days of it,
 * then the latest incidents. States are said in words and icons; the days
 * are shades of grey, darker for worse.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <TopBar title="מצב האתר" />
      <main id="content" className="view">
        <h1>מצב האתר</h1>
        <p className="lede">האם האתר, ה-API, שרת ה-MCP ומסד הנתונים עונים. נבדק כל חמש דקות.</p>

        <Suspense fallback={<p className="faint" aria-busy="true">רגע…</p>}>
          <Await
            resolve={loaderData.data}
            errorElement={
              <>
                <p className="faint">לא הצלחנו לקרוא את תוצאות הבדיקות כרגע. נסו שוב בעוד רגע.</p>
                <More />
              </>
            }
          >
            {(answer) => (
              <>
                <Report answer={answer} />
                <More />
              </>
            )}
          </Await>
        </Suspense>
      </main>
    </>
  );
}

/** The report, once it has come: the line on the whole, each part with its ninety days, and the latest incidents. */
function Report({ answer }: { answer: Answer }) {
  const { report, apiAnswered, now } = answer;
  const stale = report ? Date.parse(now) - Date.parse(report.checkedAt) > STALE_MS : false;
  const checks = new Map((report?.checks ?? []).map((check) => [check.id, check]));
  if (!apiAnswered) {
    checks.set('site', { id: 'site', state: 'up', ms: null, detail: null });
    checks.set('api', { id: 'api', state: 'down', ms: null, detail: null });
  }

  let banner: { state: State; title: string; line: string };
  if (!apiAnswered) banner = { state: 'down', title: 'ה-API אינו עונה', line: 'האתר עצמו עונה, אבל לא הצליח לקרוא מה-API את תוצאות הבדיקות. רוב הדפים תלויים בו.' };
  else if (!report) banner = { state: 'unknown', title: 'עוד לא נבדק', line: 'הבדיקות רצות כל חמש דקות; התוצאה הראשונה תופיע כאן.' };
  else if (stale) banner = { state: 'degraded', title: 'הבדיקות הפסיקו לרוץ', line: `הבדיקה האחרונה הייתה ב-${when(report.checkedAt)}. מה שכתוב כאן אולי כבר אינו נכון.` };
  else
    banner = {
      state: report.state === 'unknown' ? 'up' : report.state,
      title: report.state === 'down' ? 'חלק אינו עובד כעת' : report.state === 'degraded' ? 'חלק עובד באיטיות או חלקית' : 'הכל עובד',
      line: `נבדק ב-${when(report.checkedAt)}`,
    };

  return (
    <>
      <div className={`banner ${banner.state}`} role="status">
        <Icon name={STATE_ICON[banner.state]} size="l" />
        <div>
          <b>{banner.title}</b>
          <span>{banner.line}</span>
        </div>
      </div>

      <ul className="checks">
        {ORDER.map((id) => {
          const check = checks.get(id);
          const state: State = check?.state ?? 'unknown';
          const part = PARTS[id];
          const up = report ? uptime(report, id) : null;
          return (
            <li key={id}>
              <div className="check-head">
                <Icon name={part.icon} className="faint" />
                <span className="t">
                  <b>{part.name}</b>
                  <span>{part.about}</span>
                </span>
                <span className={`state ${state}`}>
                  <Icon name={STATE_ICON[state]} size="s" />
                  {WORD[state]}
                  {check?.ms != null && state !== 'unknown' && (
                    <span className="faint">
                      {' · '}
                      <bdi dir="ltr">{count(check.ms)} ms</bdi>
                    </span>
                  )}
                </span>
              </div>
              {check?.detail && state !== 'up' && (
                <p className="detail" lang="en" dir="ltr">
                  {check.detail}
                </p>
              )}
              {id === 'quota' && report?.quota && (
                <div className="detail">
                  {report.quota.limit ? <Meter part={report.quota.used} whole={report.quota.limit} label={`${count(report.quota.used)} מתוך ${count(report.quota.limit)} שאילתות היום`} /> : null}
                  <p className="faint sm">
                    {report.quota.limit ? `${count(report.quota.used)} מתוך ${count(report.quota.limit)} שאילתות למסד הנתונים היום. המונה מתאפס ב-00:00 UTC.` : `${count(report.quota.used)} שאילתות למסד הנתונים היום.`}
                    {report.quota.runsOutAt ? ` בקצב של היום הן ייגמרו בערך ב-${report.quota.runsOutAt.slice(11, 16)} UTC.` : ''}
                  </p>
                </div>
              )}
              {id === 'workers' && report?.workers && (
                <ul className="detail workers">
                  {report.workers.map((load) => (
                    <li key={load.script}>
                      <bdi dir="ltr" className="code">
                        {load.script}
                      </bdi>{' '}
                      <span className="faint sm">
                        {load.requests
                          ? `${count(load.requests)} בקשות היום · חצי מהן ${load.cpuP50Ms ?? '–'} ms מעבד, האיטיות ביותר (1%) ${load.cpuP99Ms ?? '–'} ms · ${count(load.exceeded)} נעצרו על חריגה`
                          : 'עוד לא היו בקשות היום.'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {report && <Days report={report} id={id} up={up} />}
            </li>
          );
        })}
      </ul>

      <SectionHead title="תקלות אחרונות" />
      {report?.incidents?.length ? (
        <ul className="incidents">
          {report.incidents.map((incident) => (
            <li key={`${incident.check}-${incident.from}`}>
              <Icon name={incident.to ? 'check' : STATE_ICON[incident.state]} size="s" />
              <span className="t">
                <b>
                  {PARTS[incident.check].name}: {WORD[incident.state]}
                </b>
                <span>
                  {when(incident.from)} · {incident.to ? `נמשכה ${lasted(Date.parse(incident.to) - Date.parse(incident.from))}` : 'עדיין נמשכת'}
                </span>
                {incident.detail && (
                  <span lang="en" dir="ltr">
                    {incident.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="faint">לא היו תקלות ב-90 הימים האחרונים.</p>
      )}
    </>
  );
}

function Days({ report, id, up }: { report: StatusReport; id: CheckId; up: number | null }) {
  const byDate = new Map(report.days.map((day) => [day.date, day.checks[id]]));
  return (
    <div className="days-wrap">
      <ol className="days" aria-label={`90 הימים האחרונים: ${up === null ? 'אין נתונים' : `${up}% זמינות`}`}>
        {lastDays(report.checkedAt.slice(0, 10)).map((date) => {
          const day = byDate.get(date);
          const shown = day?.runs ? `${Math.floor(((day.runs - day.down) / day.runs) * 1000) / 10}%` : 'אין נתונים';
          return <li key={date} className={dayState(day)} title={`${date}: ${shown}`} />;
        })}
      </ol>
      <p className="faint sm days-foot">
        <span>לפני 90 יום</span>
        <span>{up === null ? 'אין נתונים' : `${up}% זמינות`}</span>
        <span>היום</span>
      </p>
    </div>
  );
}

/** The same for programs, and where else to look. They come in after the report, so nothing under the waiting line is pushed down when it arrives. */
function More() {
  return (
    <>
      <p className="faint sm">
        לתוכנות: אותו מידע ב-JSON, ב-
        <a className="url" href={`${API}/v1/status`} dir="ltr">
          {`${API}/v1/status`}
        </a>
      </p>

      <SectionHead title="עוד" />
      <SeeAlso links={[{ to: '/health', icon: 'library', label: 'מצב הקטלוג', sub: 'כמה מלא הקטלוג, ואיפה צריך עזרה' }]} />
    </>
  );
}
