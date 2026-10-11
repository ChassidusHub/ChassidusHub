import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { data, Link, redirect } from 'react-router';
import { useAccount } from '../lib/account';
import { asPerson, day, itemHref, kindName, labelName, nameOf, PeopleError, pieces, saidOf, titleOf, type IssueDetail, type IssueRights, type People, type TimelineItem } from '../people/talk';
import { Button, Chips, Panel, Say, Sheet, TopBar } from '../ui';
import type { Route } from './+types/issue';

/**
 * One report as everyone sees it, read here so the page is whole before the
 * script loads. A suggestion's number (they share numbers, #12) goes on to
 * the suggestion's page. A private report reads as not found here; the
 * browser asks again as the person, who may be one of its readers.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  if (!/^\d{1,9}$/.test(params.number)) throw data('not found', { status: 404 });
  const number = Number(params.number);
  const api = context.api;
  const [thread, detail, labels] = await Promise.all([
    api.threadByNumber({ number }).catch(() => null),
    api.getIssue({ number }).then((d) => d as unknown as IssueDetail, () => null),
    api.listLabels().then((r) => (r.labels as unknown as { name: string }[]).map((l) => l.name), () => [] as string[]),
  ]);
  if (thread?.kind === 'suggestion') throw redirect(`/suggestions/${number}`);
  const page = { number, detail, labels };
  return detail ? page : data(page, { status: 404 });
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=60, s-maxage=60' };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const issue = loaderData?.detail?.issue;
  return [{ title: issue ? `${titleOf(issue)} · #${issue.number} · ChassidusHub` : 'דיווח · ChassidusHub' }];
}

const NOBODY: IssueRights = { read: true, comment: false, edit: false, close: false, triage: false, moderate: false };

/**
 * One Report (thread 6): its title and state, who opened it about which
 * item; its words and everything said and done since, in order; and the box
 * to answer it, and to close it (fixed, or not planned) or reopen it for
 * those allowed. Beside it: its kind, its labels (changed by those who sort
 * reports), who is on it (anyone who may comment can take it on), and the
 * suggestions that will close it.
 */
export default function IssuePage({ loaderData }: Route.ComponentProps) {
  const { number, labels } = loaderData;
  const account = useAccount();
  const [detail, setDetail] = useState<IssueDetail | null>(loaderData.detail);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDetail(loaderData.detail), [loaderData.detail]);

  const load = useCallback(async () => {
    try {
      setDetail(await asPerson<IssueDetail>(`issues/${number}`));
      setMissing(false);
    } catch (e) {
      if (e instanceof PeopleError && (e.status === 404 || e.status === 403)) setMissing(true);
      else setError(saidOf(e));
    }
  }, [number]);

  // Once it is known who reads: a private report opens to its readers, and the buttons to those who may press them.
  useEffect(() => {
    if (account) void load();
    else if (account === null && !loaderData.detail) setMissing(true);
  }, [account, load, loaderData.detail]);

  if (!detail)
    return (
      <>
        <TopBar title="דיווח" />
        <main id="content" className="view people">
          <h1>דיווח #{number}</h1>
          {missing ? (
            <>
              <p>אין דיווח גלוי במספר הזה. אולי הוא פרטי: דיווחים על זכויות ועל תוכן פוגע רואים רק אחראי האוסף ומנהלי האתר.</p>
              <Button look="outline" small to="/issues">
                לכל הדיווחים
              </Button>
            </>
          ) : error ? (
            <Say tone="bad">{error}</Say>
          ) : (
            <p className="faint" aria-busy="true">
              רגע…
            </p>
          )}
        </main>
      </>
    );

  const { issue } = detail;
  const people = detail.people ?? {};
  // What the server read is everyone's; what this reader may do comes from asking as them.
  const rights = account ? (detail.rights ?? NOBODY) : NOBODY;
  const me = account?.person ?? null;
  const author = issue.author ? people[issue.author] : null;
  const closed = issue.state === 'closed';
  const mine = !!me && issue.assignees.includes(me.id);

  async function act(run: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await run();
      await load();
      return true;
    } catch (e) {
      setError(saidOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const handleOf = (id: string) => people[id]?.username ?? id;
  const setAssignees = (list: string[]) => act(() => asPerson(`issues/${number}/assignees`, { method: 'PUT', body: { assignees: list } }));

  return (
    <>
      <TopBar title={`דיווח #${number}`} />
      <main id="content" className="view people">
        <h1 dir="auto">
          {titleOf(issue)} <span className="faint">#{number}</span>
        </h1>
        <p className="pmeta">
          <span className="tag strong">{!closed ? 'פתוח' : issue.stateReason === 'not_planned' ? 'לא יטופל' : 'טופל'}</span>
          {issue.private && <span className="tag">פרטי</span>}
          {author?.bot && <span className="machine">מכונה</span>}
          <span className="faint sm">
            <Person id={issue.author} people={people} /> פתח ב־{day(issue.createdAt)} · {issue.comments ?? 0} תגובות
          </span>
        </p>

        <dl className="facts">
          {issue.entity && (
            <>
              <dt>על</dt>
              <dd>
                <Link to={itemHref(issue.entity)}>
                  <bdi>{nameOf(issue.entity.name) || issue.entity.id}</bdi>
                </Link>
              </dd>
            </>
          )}
          <dt>סוג</dt>
          <dd>
            <Link to={`/issues?type=${encodeURIComponent(issue.type)}`}>{kindName(issue)}</Link>
          </dd>
          <dt>תוויות</dt>
          <dd>
            {issue.labels.length ? (
              issue.labels.map((label) => (
                <Link key={label.name} className="tag" to={`/issues?label=${encodeURIComponent(label.name)}`}>
                  {labelName(label.name)}
                </Link>
              ))
            ) : (
              <span className="faint">אין</span>
            )}
            {rights.triage && <LabelsSheet all={labels} chosen={issue.labels.map((l) => l.name)} busy={busy} save={(list) => act(() => asPerson(`issues/${number}/labels`, { method: 'PUT', body: { labels: list } }))} />}
          </dd>
          <dt>אחראים</dt>
          <dd>
            {issue.assignees.length ? (
              issue.assignees.map((id, at) => (
                <span key={id}>
                  {at > 0 && ', '}
                  <Person id={id} people={people} />
                </span>
              ))
            ) : (
              <span className="faint">אין עדיין</span>
            )}
            {me && rights.comment && (
              <button type="button" className="linkish" disabled={busy} onClick={() => void setAssignees(mine ? issue.assignees.filter((id) => id !== me.id).map(handleOf) : [...issue.assignees.map(handleOf), me.username ?? me.id])}>
                {mine ? 'הסרה ממני' : 'לקחת על עצמי'}
              </button>
            )}
          </dd>
          {detail.fixedBy && detail.fixedBy.length > 0 && (
            <>
              <dt>הצעות שיתקנו</dt>
              <dd>
                {detail.fixedBy.map((s) => (
                  <span key={s.number} className="block">
                    <Link to={`/suggestions/${s.number}`}>#{s.number}</Link> <bdi>{s.title}</bdi>
                    {s.status !== 'merged' && s.status !== 'withdrawn' && <span className="faint sm"> · ייסגר כשההצעה תאושר</span>}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>

        <ol className="talk" aria-label="שיחה">
          <li className="said">
            <p className="who">
              <Person id={issue.author} people={people} /> <span className="faint">כתב ב־{day(issue.createdAt)}</span>
            </p>
            {issue.body ? <Words text={issue.body} /> : <p className="faint">אין פרטים.</p>}
          </li>
          {(detail.timeline ?? []).filter((item) => !(item.type === 'event' && item.kind === 'opened')).map((item) => (
            <Entry key={`${item.type}-${item.id}`} item={item} people={people} />
          ))}
        </ol>

        {error && <Say tone="bad">{error}</Say>}
        {me && rights.comment ? (
          <Reply closed={closed} mayClose={rights.close} busy={busy} send={(choice, note) =>
            act(async () => {
              // The words first, then the state, as GitHub does it.
              if (note) await asPerson(`issues/${number}/comments`, { body: { body: note } });
              if (choice !== 'comment') await asPerson(`issues/${number}/state`, { body: { state: choice } });
            })
          } />
        ) : account === null ? (
          <Say>
            כדי להגיב צריך <Link to={`/signin?return=${encodeURIComponent(`/issues/${number}`)}`}>להיכנס</Link>.
          </Say>
        ) : null}
        {me && <Follow id={issue.id} on={!!detail.subscribed} />}
      </main>
    </>
  );
}

/** A person by id: their page when they have a handle. Nobody is a guest. */
function Person({ id, people }: { id: string | null | undefined; people: People }) {
  if (!id) return <b>אורח</b>;
  const person = people[id];
  if (person?.username)
    return (
      <Link to={`/u/${person.username}`} className="person">
        <bdi>{person.name}</bdi>
      </Link>
    );
  return (
    <b>
      <bdi>{person?.name ?? id}</bdi>
    </b>
  );
}

/** Words as written, a paragraph to each blank line, with #12 and @handle as links. */
function Words({ text }: { text: string }) {
  return (
    <div className="words" dir="auto">
      {text.split(/\n{2,}/).map((paragraph, at) => (
        <p key={at}>
          {pieces(paragraph).map((piece, i) =>
            'to' in piece ? (
              <Link key={i} to={piece.to}>
                <bdi dir="ltr">{piece.text}</bdi>
              </Link>
            ) : (
              <span key={i}>{piece.text}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/** One thing in the conversation: a comment in full, or a small line for what was done. */
function Entry({ item, people }: { item: TimelineItem; people: People }) {
  if (item.type === 'comment' || item.type === 'review')
    return (
      <li className="said">
        <p className="who">
          <Person id={item.author} people={people} /> <span className="faint">כתב ב־{day(item.at)}</span>
        </p>
        {item.body && !(item.type === 'comment' && item.hidden) ? <Words text={item.body} /> : <p className="faint">התגובה הוסתרה.</p>}
      </li>
    );
  const d = item.detail ?? {};
  const by = d.by as { number?: number | null } | undefined;
  const names = (list: string[]) =>
    list.map((id, at) => (
      <span key={id}>
        {at > 0 && ', '}
        <Person id={id} people={people} />
      </span>
    ));
  let text: ReactNode;
  switch (item.kind) {
    case 'closed':
      text = (
        <>
          {d.outcome === 'dismissed' ? 'סגר כלא יטופל' : 'סגר כטופל'}
          {by?.number ? (
            <>
              {' '}
              בהצעה <Link to={`/suggestions/${by.number}`}>#{by.number}</Link>
            </>
          ) : null}
        </>
      );
      break;
    case 'reopened':
      text = 'פתח מחדש';
      break;
    case 'renamed':
      text = (
        <>
          שינה את הכותרת ל־<bdi>{String(d.to ?? '')}</bdi>
        </>
      );
      break;
    case 'edited':
      text = 'ערך את הפרטים';
      break;
    case 'labeled':
    case 'unlabeled':
      text = (
        <>
          {item.kind === 'labeled' ? 'הוסיף תווית' : 'הסיר תווית'} {ids(d.labels).map(labelName).join(', ')}
        </>
      );
      break;
    case 'assigned':
    case 'unassigned': {
      const list = ids(d.assignees);
      text = item.kind === 'assigned' && list.length === 1 && list[0] === item.actor ? 'לקח את הדיווח על עצמו' : <>{item.kind === 'assigned' ? 'שייך את' : 'הסיר את'} {names(list)}</>;
      break;
    }
    case 'referenced': {
      const from = d.from as { kind?: string; number?: number | null } | undefined;
      text = from?.number ? (
        <>
          הזכיר את הדיווח ב־<Link to={from.kind === 'changeset' ? `/suggestions/${from.number}` : `/issues/${from.number}`}>#{from.number}</Link>
        </>
      ) : (
        'הזכיר את הדיווח'
      );
      break;
    }
    case 'made_private':
      text = 'הפך את הדיווח לפרטי';
      break;
    case 'made_public':
      text = 'הפך את הדיווח לגלוי';
      break;
    default:
      text = item.kind;
  }
  return (
    <li className="did faint sm">
      <Person id={item.actor} people={people} /> {text} · {day(item.at)}
    </li>
  );
}

/** The box at the foot: a comment, and for those who may, closing it one of two ways or opening it again. */
function Reply({ closed, mayClose, busy, send }: { closed: boolean; mayClose: boolean; busy: boolean; send: (choice: 'comment' | 'open' | 'completed' | 'not_planned', note: string) => Promise<boolean> }) {
  const [note, setNote] = useState('');
  const id = useId();
  const go = async (choice: 'comment' | 'open' | 'completed' | 'not_planned') => {
    if (await send(choice, note.trim())) setNote('');
  };
  return (
    <Panel title="תגובה">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void go('comment');
        }}
      >
        <div className="field">
          <label htmlFor={id}>מה לכתוב</label>
          <textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={10000} dir="auto" />
          <span className="hint">@ לתייג אדם · # להפנות לדיווח או להצעה</span>
        </div>
        <div className="btns">
          <Button type="submit" small disabled={busy || !note.trim()}>
            {busy ? 'רגע…' : 'תגובה'}
          </Button>
          {mayClose &&
            (closed ? (
              <Button small look="outline" disabled={busy} onClick={() => void go('open')}>
                פתיחה מחדש
              </Button>
            ) : (
              <>
                <Button small look="outline" icon="check" disabled={busy} onClick={() => void go('completed')}>
                  סגירה כטופל
                </Button>
                <Button small look="outline" disabled={busy} onClick={() => void go('not_planned')}>
                  סגירה כלא יטופל
                </Button>
              </>
            ))}
        </div>
      </form>
    </Panel>
  );
}

/** Changing a report's labels, for those who sort reports: each label on or off, saved together. */
function LabelsSheet({ all, chosen, busy, save }: { all: string[]; chosen: string[]; busy: boolean; save: (list: string[]) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(chosen);
  return (
    <>
      <button
        type="button"
        className="linkish"
        onClick={() => {
          setPicked(chosen);
          setOpen(true);
        }}
      >
        שינוי
      </button>
      <Sheet open={open} title="תוויות" onClose={() => setOpen(false)}>
        <Chips label="תוויות">
          {[...new Set([...all, ...chosen])].map((name) => (
            <button key={name} type="button" className="chip" aria-pressed={picked.includes(name)} onClick={() => setPicked((now) => (now.includes(name) ? now.filter((n) => n !== name) : [...now, name]))}>
              {labelName(name)}
            </button>
          ))}
        </Chips>
        <div className="btns">
          <Button small disabled={busy} onClick={() => void save(picked).then((ok) => ok && setOpen(false))}>
            {busy ? 'רגע…' : 'שמירה'}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/** Following the report: every comment and change comes to the inbox. */
function Follow({ id, on: initial }: { id: number; on: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOn(initial), [initial]);
  return (
    <div className="btns">
      <Button
        small
        look="ghost"
        icon={on ? 'check' : 'mail'}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await asPerson('follows', { body: { kind: 'report', id: String(id), on: !on } });
            setOn(!on);
          } catch {
            // Nothing changed; the button stays as it was.
          } finally {
            setBusy(false);
          }
        }}
      >
        {on ? 'במעקב: עדכונים יגיעו לתיבה' : 'מעקב אחרי הדיווח'}
      </Button>
    </div>
  );
}
