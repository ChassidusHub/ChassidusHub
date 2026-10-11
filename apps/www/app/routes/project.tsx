import { data, Form, Link, redirect, useNavigation } from 'react-router';
import { count, dayName, focusText, GAP_NAME, hebrewName, itemName, percent, STATE_NAME, yearName, type Project, type ProjectItem } from '../community/data';
import { Progress, SeeAlso } from '../community/parts';
import { useAccount } from '../lib/account';
import { Button, Icon, Say, SectionHead, TopBar, type MenuItem } from '../ui';
import { fromThisSite } from './fix';
import type { Route } from './+types/project';

type Entity = { id: string; path: string | null; type: string; data: Record<string, unknown> };

/**
 * One project is the same for everyone (who holds which item is shown to
 * all), so it is read here and kept a minute; the open projects are read
 * beside it for the path bar's menu. Which held item is the person's own,
 * and whether they may close the project, is asked in the browser.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const [found, list] = await Promise.all([
    context.api.getProject({ slug: params.slug }).catch((error: unknown) => {
      if ((error as { status?: number } | null)?.status === 404) return null;
      throw error;
    }),
    context.api.listProjects({ status: 'open' }).catch(() => null),
  ]);
  if (!found) throw data('not found', { status: 404 });
  const entities = Object.fromEntries((found.next as unknown as Entity[]).map((e) => [e.id, { id: e.id, path: e.path, type: e.type, data: { title: e.data.title, label: e.data.label, date: e.data.date } }]));
  return {
    project: found.project as unknown as Project,
    todo: (found.todo ?? []) as unknown as ProjectItem[],
    entities,
    others: ((list?.projects ?? []) as unknown as Project[]).map((p) => ({ slug: p.slug, name: p.name })),
  };
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=60, s-maxage=60' };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: 'פרויקט · ChassidusHub' }];
  return [{ title: `${loaderData.project.name} · ChassidusHub` }, { name: 'description', content: loaderData.project.goal ?? focusText(loaderData.project) }];
}

/** Where an item is worked on: a farbrengen's page, a recording's (under its farbrengen), or a page of a scan's text. */
function itemHref(item: ProjectItem, entities: Record<string, Entity>): string {
  if (item.kind === 'page') return `/text/${item.id}?page=${item.page ?? 1}`;
  if (item.kind === 'recording') return `/${item.event ?? item.id}`;
  const entity = item.id ? entities[item.id] : undefined;
  return entity?.path ?? `/${item.id ?? item.item}`;
}

type Done = { none: true } | { said: string } | null;

/**
 * "Give me the next one", "Let go" and "Close the project", sent to the API
 * as the person who pressed them, from this site's own pages only. Plain
 * form posts, so they work before (and without) the page's script.
 */
export async function action({ request, params, context }: Route.ActionArgs): Promise<Done | Response> {
  if (!fromThisSite(request)) return { said: 'הבקשה לא נשלחה מהאתר עצמו.' };
  if (!context.visitor) return { said: 'כדי לקחת פריט צריך להיכנס.' };
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const slug = params.slug;
  try {
    if (intent === 'next') {
      const { item } = (await context.visitor.claimNext({ slug })) as { item?: ProjectItem | null };
      return item ? redirect(itemHref(item, {})) : { none: true };
    }
    if (intent === 'release') {
      await context.visitor.releaseClaim({ slug, body: { item: String(form.get('item') ?? '') } });
      return null;
    }
    if (intent === 'close') {
      await context.visitor.closeProject({ slug });
      return null;
    }
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401) return { said: 'כדי לקחת פריט צריך להיכנס.' };
    if (status === 403) return { said: 'רק שומרי הפרויקט יכולים לעשות את זה.' };
    if (status === 409) return { said: 'הפרויקט כבר סגור.' };
    console.error('project', error);
    return { said: 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.' };
  }
  return { said: 'הבקשה לא הובנה.' };
}

const KIND_ICON = { event: 'listen', recording: 'listen', page: 'scan' } as const;

/**
 * One project (thread 6, rebuilt from the old site): its goal, how far it
 * has come, and what is next to do. A signed-in helper asks for "the next
 * one" and is handed an item nobody else holds, kept for them for three
 * hours; they can let it go again, and a steward can close the project.
 */
export default function Screen({ loaderData, actionData }: Route.ComponentProps) {
  const { project, todo, entities, others } = loaderData;
  const account = useAccount();
  const busy = useNavigation().state === 'submitting';
  const open = project.status === 'open';
  const left = Math.max(0, project.total - project.done);
  const done = actionData as Done | undefined;
  const mine = (item: ProjectItem) => !!account && item.claimedBy === account.person.id;
  const here = `/projects/${project.slug}`;

  const path = [
    {
      key: 'place',
      label: 'פרויקטים',
      icon: 'people' as const,
      title: 'עבודה על הקטלוג',
      items: [
        { key: 'projects', label: 'פרויקטים', to: '/projects', current: true },
        { key: 'missing', label: 'מה חסר', to: '/missing' },
        { key: 'health', label: 'מצב הקטלוג', to: '/health' },
      ] satisfies MenuItem[],
    },
    {
      key: 'project',
      label: project.name,
      title: 'פרויקטים פתוחים',
      items: (others.some((p) => p.slug === project.slug) ? others : [{ slug: project.slug, name: project.name }, ...others]).map((p) => ({ key: p.slug, label: p.name, to: `/projects/${p.slug}`, current: p.slug === project.slug })),
    },
  ];

  return (
    <>
      <TopBar path={path} />
      <main id="content" className="view">
        <h1>{project.name}</h1>
        <p className="faint">
          <span className="tag">{open ? GAP_NAME[project.focus.missing] : STATE_NAME[project.status]}</span> {focusText(project)} · נפתח ב־{dayName(project.createdAt)}
          {project.creatorName ? ` על ידי ${project.creatorName}` : ''}
        </p>

        <div className="figure big">
          <b>{percent(project.done, project.total)}</b>
          <span>
            {count(project.done)} מתוך {count(project.total)} נעשו · נשארו {count(left)}
          </span>
        </div>
        <Progress project={project} />
        {project.goal && <p>{project.goal}</p>}

        {done && 'none' in done && <Say>אין כרגע פריט פנוי: כל מה שנשאר שמור למישהו אחר, או שהכל נעשה.</Say>}
        {done && 'said' in done && <Say tone="bad">{done.said}</Say>}

        {open ? (
          <>
            <div className="btns">
              {account === null ? (
                <Button icon="user" to={`/signin?return=${encodeURIComponent(here)}`}>
                  כניסה כדי לקחת פריט
                </Button>
              ) : (
                <Form method="post" replace>
                  <input type="hidden" name="intent" value="next" />
                  <Button type="submit" icon="next" disabled={busy}>
                    תנו לי את הבא
                  </Button>
                </Form>
              )}
            </div>
            <p className="faint sm">הפריט שתקבלו נשמר לכם לשלוש שעות, כדי ששניים לא יעבדו על אותו דבר.</p>

            <SectionHead title={`הבאים בתור${todo.length ? ` (${count(todo.length)})` : ''}`} />
            {todo.length === 0 ? (
              <Say tone="good">הכל נעשה. תודה לכל מי שעזר.</Say>
            ) : (
              <div className="rows">
                {todo.map((item) => (
                  <div key={item.item} className={mine(item) ? 'row cur' : 'row'}>
                    <Icon name={KIND_ICON[item.kind]} className="faint" />
                    <span className="t">
                      <Link to={itemHref(item, entities)} className="title-link">
                        {item.kind === 'page' ? `עמוד ${count(item.page ?? 0)}` : itemName(item.id ? entities[item.id] : null, hebrewName(item.title, item.id ?? item.item))}
                      </Link>
                      {item.kind === 'page' ? <span>{item.level === 1 ? 'הוגה פעם אחת' : item.level === 2 ? 'הוגה פעמיים' : 'עוד לא הוגה'}</span> : item.date ? <span>{yearName(Number(item.date.slice(0, 4)))}</span> : null}
                    </span>
                    {item.claimedBy &&
                      (mine(item) ? (
                        <Form method="post" replace className="r">
                          <input type="hidden" name="intent" value="release" />
                          <input type="hidden" name="item" value={item.item} />
                          <span>שמור לכם </span>
                          <Button type="submit" small look="ghost" disabled={busy} title="להחזיר לערימה, כדי שמישהו אחר יוכל לקחת">
                            שחרור
                          </Button>
                        </Form>
                      ) : (
                        <span className="r">מישהו עובד על זה</span>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <Say>הפרויקט סגור: אין מה לחלק.</Say>
        )}

        {project.keepers?.length ? (
          <p className="faint sm">
            שומרי הפרויקט:{' '}
            {project.keepers.map((k, at) => (
              <span key={k}>
                {at ? ', ' : ''}
                <Link to={`/u/${k}`}>
                  <bdi>@{k}</bdi>
                </Link>
              </span>
            ))}
          </p>
        ) : null}

        <SectionHead title="עוד" />
        <SeeAlso
          links={[
            {
              to: `/missing?${new URLSearchParams({ ...(project.focus.missing === 'texts' ? { kind: 'texts' } : {}), ...(project.focus.within && project.focus.missing !== 'proofreading' && project.focus.missing !== 'sync' ? { year: project.focus.within.slice(0, 4) } : {}) })}`.replace(/\?$/, ''),
              icon: 'search',
              label: 'מה חסר',
            },
            { to: '/projects', icon: 'people', label: 'כל הפרויקטים' },
          ]}
        />

        {open && account?.person.steward && (
          <Form method="post" replace className="btns">
            <input type="hidden" name="intent" value="close" />
            <Button type="submit" small look="outline" icon="close" disabled={busy}>
              סגירת הפרויקט
            </Button>
          </Form>
        )}
      </main>
    </>
  );
}
