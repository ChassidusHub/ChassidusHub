import { Suspense, useEffect, useId, useRef, useState } from 'react';
import { Await, Form, Link, redirect, useActionData, useLocation, useNavigation } from 'react-router';
import { useAccount } from '../lib/account';
import { day, itemHref, kindName, nameOf, titleOf, type IssueRow, type IssueTemplate } from '../people/talk';
import { Button, Field, Icon, Say, TopBar } from '../ui';
import { fromThisSite } from './fix';
import type { Route } from './+types/issue-new';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'דיווח חדש · ChassidusHub' }];
}

/** An item's permanent id in what was pasted: rh- and letters and digits, read forgivingly. */
const idIn = (text: string | null | undefined): string | null => /rh-[0-9a-z-]{6,20}/.exec(text?.toLowerCase() ?? '')?.[0]?.replace(/-+$/, '') ?? null;

/**
 * The kinds of report (each starts the words with the questions a keeper will
 * ask), and the item `?item=` names, with the reports already open on it, so
 * nobody writes the same one twice. `?type=` picks the kind.
 */
async function formOf(api: Route.LoaderArgs['context']['api'], url: URL) {
  const itemId = idIn(url.searchParams.get('item'));
  const [templates, entity, open] = await Promise.all([
    api.issueTemplates().then((r) => r.templates as unknown as IssueTemplate[], () => [] as IssueTemplate[]),
    itemId ? api.getItem({ id: itemId }).catch(() => null) : null,
    itemId ? api.listIssues({ entity: itemId, state: 'open', limit: 5 }).catch(() => null) : null,
  ]);
  const data = (entity?.data ?? {}) as Record<string, unknown>;
  const item = entity ? { id: entity.id, path: itemHref({ id: entity.id, path: (entity as { path?: string | null }).path }), name: nameOf(data.label ?? data.title ?? data.name) || entity.id } : null;
  const type = url.searchParams.get('type');
  return {
    kinds: templates.map((t) => ({ type: t.type, name: t.label.he || kindName(t), template: t.template.he ?? '', private: !!t.private })),
    type: templates.some((t) => t.type === type) ? type : null,
    item,
    open: ((open?.items ?? []) as unknown as IssueRow[]).map((i) => ({ number: i.number, title: titleOf(i), createdAt: i.createdAt })),
  };
}

/** The page never waits for the kinds: its frame shows at once, and the form comes after it. */
export function loader({ request, context }: Route.LoaderArgs) {
  return { data: formOf(context.api, new URL(request.url)) };
}

/** Opened from inside the site, the frame is drawn at once; the form follows. */
export function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  return { data: serverLoader().then((loaded) => loaded.data) };
}

type Loaded = Awaited<ReturnType<typeof formOf>>;

export function headers() {
  return { 'Cache-Control': 'public, max-age=300, s-maxage=300' };
}

type Sent = { said: string; signIn?: boolean; sent?: number | null };

/** The API's refusals, as the site says them. */
const REFUSED: [RegExp, string][] = [
  [/captcha/, 'דיווח בלי חשבון לא אפשרי כרגע. אפשר להיכנס ולדווח.'],
  [/too many/i, 'נשלחו יותר מדי דיווחים מכאן בשעה האחרונה. נסו שוב מאוחר יותר.'],
  [/title/, 'כתבו כותרת, עד 200 תווים.'],
  [/not found|no item/i, 'הפריט הזה לא נמצא. בדקו את המזהה או הקישור.'],
];
const said = (message: string | undefined, fallback = 'הדיווח לא נשלח. בדקו את מה שכתבתם ונסו שוב.') => REFUSED.find(([pattern]) => message && pattern.test(message))?.[1] ?? fallback;

/**
 * Whether a kind of report is private (rights, offensive). The report page
 * hides a private report from anyone not signed in, so a guest sent there
 * would read it as never arrived; they are thanked on the form instead. When
 * the kinds cannot be read, count it as private: thanks is never wrong.
 */
async function isPrivate(api: Route.ActionArgs['context']['api'], type: string): Promise<boolean> {
  const templates = await api.issueTemplates().then((r) => r.templates as unknown as IssueTemplate[], () => null);
  return !templates || templates.some((t) => t.type === type && !!t.private);
}

/**
 * Sending a report, as a plain form post (it works without JavaScript).
 * Signed in, it opens an issue as the person and goes to its page. Without
 * an account it goes to the API's /v1/reports, which takes reports from
 * anyone (an hourly limit; a captcha when the API asks for one, which this
 * site cannot give, so then the person is asked to sign in). A report that
 * became a public issue goes to its page; a private one is thanked here.
 */
export async function action({ request, context }: Route.ActionArgs): Promise<Sent> {
  if (!fromThisSite(request)) return { said: 'אפשר לדווח רק מדפי האתר עצמו.' };
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const type = field('type');
  const title = field('title').slice(0, 200);
  const body = field('body').slice(0, 10000);
  const entityId = idIn(field('item')) ?? undefined;
  if (!type) return { said: 'בחרו קודם מה הבעיה.' };
  if (!title) return { said: 'כתבו כותרת: במשפט אחד, מה לא בסדר.' };
  if (context.visitor) {
    try {
      const issue = await context.visitor.openIssue({ body: { title, ...(body ? { body } : {}), type: type as never, ...(entityId ? { entityId } : {}) } });
      throw redirect(`/issues/${issue.number}`);
    } catch (error) {
      if (error instanceof Response) throw error;
      const status = (error as { status?: number }).status;
      if (status !== 401) return status && status < 500 ? { said: said((error as Error).message) } : { said: 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.' };
    }
  }
  try {
    const sent = await context.api.report({ body: { reason: type as never, title, ...(body ? { note: body } : {}), ...(entityId ? { entityId } : {}) } });
    if (sent.number && !(await isPrivate(context.api, type))) throw redirect(`/issues/${sent.number}`);
    return { said: '', sent: null };
  } catch (error) {
    if (error instanceof Response) throw error;
    const status = (error as { status?: number }).status;
    if (!status || status >= 500) return { said: 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.' };
    const message = (error as Error).message;
    return { said: said(message), signIn: /captcha/.test(message) || status === 401 };
  }
}

/**
 * Opening a Report (thread 6): what kind of problem it is, which item, a
 * title and the details. A small mistake in the words is better fixed on the
 * page itself (select the words, Fix); a report is for what a fix cannot do.
 * Reports about rights or offensive content are private.
 */
export default function NewIssue({ loaderData }: Route.ComponentProps) {
  const sent = useActionData<typeof action>();
  // Another item's form is its own wait; a report sent here keeps the form in place while the page is read again.
  const { search } = useLocation();
  return (
    <>
      <TopBar title="דיווח חדש" />
      <main id="content" className="view people">
        <h1>דיווח חדש</h1>
        <p className="lede faint">מצאתם טעות, עמוד חסר או הקלטה שנקטעת? ספרו מה ראיתם ואיפה, ואחראי האוסף יבדקו.</p>
        <Say>
          טעות קטנה במילים אפשר לתקן ישירות בעמוד: מסמנים את המילים ולוחצים „תיקון”.
        </Say>
        {sent?.sent === null && <Say tone="good">הדיווח התקבל. תודה!</Say>}
        <Suspense
          key={search}
          fallback={
            <p className="faint" aria-busy="true">
              רגע…
            </p>
          }
        >
          <Await resolve={loaderData.data} errorElement={<Say tone="bad">הטופס לא נטען. נסו שוב בעוד רגע.</Say>}>
            {(loaded) => <Report loaded={loaded} sent={sent} />}
          </Await>
        </Suspense>
      </main>
    </>
  );
}

/** The form, once the kinds have come (gone once the report is thanked), and the reports already open on the item. */
function Report({ loaded, sent }: { loaded: Loaded; sent: Sent | undefined }) {
  const { kinds, item, open } = loaded;
  const busy = useNavigation().state === 'submitting';
  const account = useAccount();
  const [type, setType] = useState(loaded.type ?? '');
  const kind = kinds.find((k) => k.type === type);
  const body = useRef<HTMLTextAreaElement>(null);
  const bodyId = useId();
  const back = `/issues/new${item ? `?item=${item.id}` : ''}`;

  // A kind's questions fill the box, unless the person has written something of their own there.
  useEffect(() => {
    const box = body.current;
    if (!box || !kind?.template) return;
    if (!box.value.trim() || kinds.some((k) => k.template === box.value)) box.value = kind.template;
  }, [kind, kinds]);

  return (
    <>
      {sent?.sent !== null && (
        <Form method="post" className="pform">
          {sent?.said && (
            <Say tone="bad">
              {sent.said}
              {sent.signIn && (
                <>
                  {' '}
                  <Link to={`/signin?return=${encodeURIComponent(back)}`}>כניסה</Link>
                </>
              )}
            </Say>
          )}
          <fieldset className="kinds">
            <legend>מה הבעיה?</legend>
            {kinds.map((k) => (
              <label key={k.type}>
                <input type="radio" name="type" value={k.type} required defaultChecked={type === k.type} onChange={() => setType(k.type)} />
                <span>{k.name}</span>
                {k.private && <span className="tag">פרטי</span>}
              </label>
            ))}
          </fieldset>
          {item ? (
            <div className="field">
              <span className="flabel">על</span>
              <p className="about">
                <Link to={item.path}>
                  <bdi>{item.name}</bdi>
                </Link>
                <input type="hidden" name="item" value={item.id} />
                <Link to="/issues/new" className="faint sm">
                  לא על פריט מסוים
                </Link>
              </p>
            </div>
          ) : (
            <Field label="על פריט מסוים? הדביקו את הקישור או המזהה שלו" name="item" dir="ltr" maxLength={300} placeholder="https://chassidushub.org/…" />
          )}
          <Field label="כותרת: במשפט אחד, מה לא בסדר" name="title" required maxLength={200} dir="auto" />
          <div className="field">
            <label htmlFor={bodyId}>פרטים</label>
            <textarea id={bodyId} ref={body} name="body" rows={7} maxLength={10000} dir="auto" defaultValue={kinds.find((k) => k.type === loaded.type)?.template ?? ''} />
            <span className="hint">@ לתייג אדם · # להפנות לדיווח או להצעה</span>
          </div>
          {kind?.private && (
            <Say>
              <Icon name="key" size="s" /> דיווח מהסוג הזה פרטי: רואים אותו רק אחראי האוסף ומנהלי האתר.
            </Say>
          )}
          {account === null && <p className="faint sm">אפשר לדווח גם בלי חשבון. עם חשבון תקבלו תשובה בתיבה שלכם.</p>}
          <Button type="submit" className="block" disabled={busy}>
            {busy ? 'רגע…' : 'שליחת הדיווח'}
          </Button>
        </Form>
      )}
      {item && (
        <section aria-labelledby="open-on-item">
          <h2 id="open-on-item">דיווחים פתוחים על הפריט</h2>
          {open.length ? (
            <ul className="threads">
              {open.map((issue) => (
                <li key={issue.number}>
                  <Link to={`/issues/${issue.number}`} className="thread">
                    <span className="t">
                      <b dir="auto">{issue.title}</b>
                      <span>
                        #{issue.number} · {day(issue.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="faint sm">אין דיווחים פתוחים על הפריט.</p>
          )}
        </section>
      )}
    </>
  );
}
