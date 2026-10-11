import { Form, Link, redirect, useActionData, useNavigation } from 'react-router';
import { Progress, SeeAlso } from '../community/parts';
import { capped, count, dayName, focusText, GAP_NAME, STATE_NAME, type Gap, type Project } from '../community/data';
import { useAccount } from '../lib/account';
import { Area, Button, Choice, Field, Panel, Say, SectionHead, TopBar } from '../ui';
import { fromThisSite } from './fix';
import type { Route } from './+types/projects';

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'פרויקטים · ChassidusHub' },
    { name: 'description', content: 'פרויקטים שעובדים יחד על חוסר אחד בקטלוג: התוועדויות של שנה בלי הקלטה, הקלטות לסנכרון, עמודי סריקה להגהה. כל פרויקט מראה כמה כבר נעשה.' },
  ];
}

/**
 * The projects and what the Missing board holds (the gaps a new project
 * could take on) are the same for everyone, so they are read here and kept
 * a few minutes. Whether the person may open a project is asked in the
 * browser, and the API decides again when they do.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const state = new URL(request.url).searchParams.get('state') === 'closed' ? 'closed' : 'open';
  const [list, recordings, texts] = await Promise.all([
    context.api.listProjects().catch(() => null),
    context.api.missing({ kind: 'recordings', limit: 1 }).then((r) => r.total, () => null),
    context.api.missing({ kind: 'texts', limit: 1 }).then((r) => r.total, () => null),
  ]);
  return { state, projects: list ? (list.projects as unknown as Project[]) : null, gaps: { recordings, texts } };
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=300, s-maxage=600' };
}

const GAPS: Gap[] = ['recordings', 'texts', 'sync', 'proofreading'];
const GAP_LONG: Record<Gap, string> = { recordings: 'התוועדויות בלי הקלטה', texts: 'התוועדויות בלי הנחה', sync: 'הקלטות לסנכרון', proofreading: 'עמודי סריקה להגהה' };

type Opened = { said: string } | undefined;

/** A steward opens a project, as themselves, from this site's own pages only: its name, the gap it works through, and where. */
export async function action({ request, context }: Route.ActionArgs): Promise<Opened | Response> {
  if (!fromThisSite(request)) return { said: 'הבקשה לא נשלחה מהאתר עצמו.' };
  if (!context.visitor) return { said: 'כדי לפתוח פרויקט צריך להיכנס.' };
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const missing = field('missing') as Gap;
  if (!GAPS.includes(missing)) return { said: 'בחרו על מה הפרויקט עובר.' };
  const year = field('year');
  if (year && !/^\d{4}$/.test(year)) return { said: 'שנה בספרות, למשל 5745, או ריק לכל השנים.' };
  const scan = field('scan');
  const proofreading = missing === 'proofreading';
  if (proofreading && !/^rh-[0-9a-z]+$/i.test(scan)) return { said: 'כתבו את מזהה הסריקה (rh-…), מהכתובת של דף הסריקה.' };
  const slug = `${missing}${year && !proofreading ? `-${year}` : ''}-${Date.now().toString(36)}`;
  try {
    await context.visitor.createProject({
      body: { slug, name: field('name'), ...(field('goal') ? { goal: field('goal') } : {}), missing, ...(proofreading ? { scan, level: field('level') === '2' ? 2 : 1 } : year ? { within: year } : {}) },
    });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401) return { said: 'כדי לפתוח פרויקט צריך להיכנס.' };
    if (status === 403) return { said: 'רק שומרי האתר יכולים לפתוח פרויקט.' };
    if (status === 400 || status === 409) return { said: 'הפרויקט לא נפתח. בדקו את מה שכתבתם ונסו שוב.' };
    console.error('projects', error);
    return { said: 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.' };
  }
  return redirect(`/projects/${slug}`);
}

/**
 * Projects (thread 6, rebuilt from the old site; the plan, section 7): a
 * steward opens "the recordings of 5745" or "proofread this volume", and the
 * community works through it, one item each; every project shows how far
 * it has come. Open and closed are two views of one list.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { state, projects, gaps } = loaderData;
  const account = useAccount();
  const open = projects?.filter((p) => p.status === 'open') ?? [];
  const closed = projects?.filter((p) => p.status !== 'open') ?? [];
  const shown = state === 'closed' ? closed : open;
  return (
    <>
      <TopBar title="פרויקטים" />
      <main id="content" className="view">
        <h1>פרויקטים</h1>
        <p className="lede">עובדים יחד על חוסר אחד בקטלוג, פריט אחרי פריט.</p>

        <nav className="chips" aria-label="פרויקטים">
          <Link to="/projects" className={state === 'open' ? 'chip on' : 'chip'} aria-current={state === 'open' ? 'page' : undefined}>
            פתוחים <span className="faint">{count(open.length)}</span>
          </Link>
          <Link to="/projects?state=closed" className={state === 'closed' ? 'chip on' : 'chip'} aria-current={state === 'closed' ? 'page' : undefined}>
            סגורים <span className="faint">{count(closed.length)}</span>
          </Link>
        </nav>

        {!projects ? (
          <Say tone="bad">הרשימה לא נטענה. נסו שוב בעוד רגע.</Say>
        ) : shown.length === 0 ? (
          <Say>{state === 'closed' ? 'עוד לא נסגר שום פרויקט.' : 'אין כרגע פרויקט פתוח. אפשר להתחיל מלוח החוסרים: כל התוועדות שם מחכה למישהו.'}</Say>
        ) : (
          <ul className="projects">
            {shown.map((p) => (
              <li key={p.slug}>
                <Link to={`/projects/${p.slug}`} className="card project">
                  <span className="t">
                    <b>{p.name}</b>
                    <span>
                      <span className="tag">{GAP_NAME[p.focus.missing]}</span> {focusText(p)}
                      {p.status !== 'open' && ` · ${STATE_NAME[p.status]}`}
                    </span>
                    <span>
                      נפתח ב־{dayName(p.createdAt)}
                      {p.creatorName ? ` על ידי ${p.creatorName}` : ''}
                    </span>
                    <Progress project={p} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {account?.person.steward && <NewProject />}

        <SectionHead title="איך זה עובד" />
        <ol className="howto">
          <li>כל פרויקט עובר על חוסר אחד: התוועדויות של שנה בלי הקלטה, הקלטות לסנכרון, עמודי סריקה להגהה.</li>
          <li>״תנו לי את הבא״ מביא לכם פריט שאף אחד אחר לא עובד עליו, ושומר אותו לכם לשלוש שעות.</li>
          <li>ההתקדמות זזה עם כל תוספת שאושרה.</li>
        </ol>

        <SectionHead title="מה עוד חסר" more={{ label: 'מה חסר', to: '/missing' }} />
        <SeeAlso
          links={[
            ...(gaps.recordings !== null ? [{ to: '/missing', icon: 'listen' as const, label: 'התוועדויות בלי הקלטה', sub: capped(gaps.recordings) }] : []),
            ...(gaps.texts !== null ? [{ to: '/missing?kind=texts', icon: 'scan' as const, label: 'התוועדויות בלי הנחה', sub: capped(gaps.texts) }] : []),
            { to: '/health', icon: 'library', label: 'מצב הקטלוג' },
          ]}
        />
      </main>
    </>
  );
}

/** For stewards: a plain form to this page (the action above), so it works before the page's script. */
function NewProject() {
  const said = useActionData<typeof action>();
  const busy = useNavigation().state === 'submitting';
  return (
    <Panel title="פרויקט חדש">
      <p>לשומרי האתר בלבד.</p>
      <Form method="post">
        {said && <Say tone="bad">{said.said}</Say>}
        <Field label="שם הפרויקט" name="name" required maxLength={200} dir="auto" placeholder="הקלטות תשמ״ה" />
        <Choice legend="עובר על" name="missing" required options={GAPS.map((gap) => ({ value: gap, label: GAP_LONG[gap] }))} />
        <Field label="שנה" name="year" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" dir="ltr" placeholder="5745" hint="בספרות. ריק: כל השנים. לא להגהה." />
        <Field label="מזהה הסריקה, להגהה" name="scan" pattern="rh-[0-9a-zA-Z]+" dir="ltr" placeholder="rh-…" hint="מופיע בכתובת של דף הסריקה." />
        <Choice
          legend="רמת ההגהה"
          name="level"
          options={[
            { value: '1', label: 'הגהה ראשונה' },
            { value: '2', label: 'הגהה שניה' },
          ]}
        />
        <Area label="המטרה, בכמה מילים" name="goal" rows={2} maxLength={2000} dir="auto" />
        <Button type="submit" disabled={busy}>
          {busy ? 'רגע…' : 'פתיחת הפרויקט'}
        </Button>
      </Form>
    </Panel>
  );
}
