import { useCallback, useEffect, useState } from 'react';
import { data, Link, redirect, useSearchParams } from 'react-router';
import { useAccount } from '../lib/account';
import { Area, Button, Field, IconButton, Say, SectionHead, Segmented, TopBar } from '../ui';
import { call, failed } from '../suggestions/api';
import { EntryCard, type FieldComment } from '../suggestions/Changes';
import { Merge, type Resolutions } from '../suggestions/Merge';
import { Said, Timeline } from '../suggestions/Talk';
import { conversationOf, dayOf, entryView, isOpen, personName, statusWords, suggestionView, type Conversation, type EntryView, type SuggestionView } from '../suggestions/view';
import type { Route } from './+types/suggestion';

/** How many items a page of changes carries; the rest come a page at a time. */
const PAGE = 20;

/**
 * One Suggestion, read as anyone reads it (so the page is whole before
 * script and may be kept at the edge a little): its changes, a page of them,
 * and its conversation. `/suggestions/12` is its #number; an import, which
 * has none, is `/suggestions/i<id>`. A #number that is an issue goes to the
 * issue.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const asked = params.number;
  let id: number;
  if (/^\d{1,9}$/.test(asked)) {
    const thread = await context.api.threadByNumber({ number: Number(asked) }).catch((error: { status?: number }) => {
      if (error?.status === 404) return null;
      throw error;
    });
    if (!thread) throw data(null, { status: 404 });
    if (thread.kind === 'issue') throw redirect(`/issues/${asked}`);
    id = thread.id;
  } else if (/^i\d{1,9}$/.test(asked)) id = Number(asked.slice(1));
  else throw data(null, { status: 404 });
  const raw = await context.api.getSuggestion({ id, brief: '1', limit: PAGE }).catch((error: { status?: number }) => {
    if (error?.status === 404) return null;
    throw error;
  });
  if (!raw) throw data(null, { status: 404 });
  const view = suggestionView(raw);
  if (asked.startsWith('i') && view.number) throw redirect(`/suggestions/${view.number}`);
  const talk = view.number ? conversationOf(await context.api.suggestionConversation({ id }).catch(() => null)) : null;
  return { view, talk };
}

/** What is said and decided changes it; the person's own view is read again in the browser, so a short while at the edge is enough. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=0, s-maxage=20' };
}

export function meta({ data: loaded }: Route.MetaArgs) {
  if (!loaded) return [{ title: 'הצעה · ChassidusHub' }];
  return [{ title: `${loaded.view.title}${loaded.view.number ? ` #${loaded.view.number}` : ''} · הצעות · ChassidusHub` }, { name: 'robots', content: 'noindex' }];
}

type Tab = 'talk' | 'changes';

/**
 * A Suggestion as a pull request's page (the plan: "a Suggestion is a PR"):
 * where it stands, its title and who sent it; then the conversation (what it
 * is for, a few of its changes, what was checked, its way into the library
 * with its clashes, the review, and everything said and done) or all its
 * changes, each with a comment on it now or kept for the review. Those who
 * may approve it decide right under the changes: Approve, Send back with a
 * note, or only comment; its author closes it, reopens it, brings it up to
 * date or undoes it once it is in. Who may do what is the API's to say, read
 * in the browser as the person.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const account = useAccount();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'changes' ? 'changes' : 'talk';
  const [view, setView] = useState<SuggestionView>(loaderData.view);
  const [talk, setTalk] = useState<Conversation | null>(loaderData.talk);
  const [more, setMore] = useState<{ entries: EntryView[]; next: number | null }>({ entries: [], next: loaderData.view.next });
  const [pending, setPending] = useState<FieldComment[]>([]);
  const [merge, setMerge] = useState<{ resolutions: Resolutions; ready: boolean }>({ resolutions: {}, ready: false });
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const id = view.id;
  useEffect(() => {
    setView(loaderData.view);
    setTalk(loaderData.talk);
    setMore({ entries: [], next: loaderData.view.next });
  }, [loaderData]);

  // As the person: whether they may approve it, whether they wrote it, and what was said since the page was kept.
  const refresh = useCallback(async () => {
    const [fresh, conversation] = await Promise.all([
      call<Record<string, unknown>>(`${id}?brief=1&limit=${PAGE}`),
      view.number ? call<Record<string, unknown>>(`${id}/conversation`).catch(() => null) : Promise.resolve(null),
    ]);
    setView(suggestionView(fresh));
    setMore({ entries: [], next: typeof fresh.next === 'number' ? fresh.next : null });
    if (conversation) setTalk(conversationOf(conversation));
  }, [id, view.number]);
  useEffect(() => {
    if (account) void refresh().catch(() => undefined);
  }, [account, refresh]);

  /** Does one thing as the person, then reads it all again; says what failed. */
  async function act(run: () => Promise<unknown>, done?: string): Promise<boolean> {
    setBusy(true);
    setSaid(null);
    try {
      await run();
      await refresh().catch(() => undefined);
      if (done) setSaid({ tone: 'good', text: done });
      return true;
    } catch (error) {
      setSaid({ tone: 'bad', text: failed(error) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const people = { ...view.people, ...(talk?.people ?? {}) };
  const open = isOpen(view.status);
  const steward = Boolean(account?.person.steward);
  const mayEdit = Boolean(account && (view.mine || steward));
  const entries = [...view.entries, ...more.entries];
  const comment = (c: FieldComment) => act(() => call(`${id}/comments`, { body: { body: c.body, anchor: { entity: c.entity, field: c.field } } }));
  const signIn = `/signin?return=${encodeURIComponent(view.number ? `/suggestions/${view.number}` : `/suggestions/i${id}`)}`;

  async function loadMore() {
    if (more.next === null) return;
    try {
      const page = await call<Record<string, unknown>>(`${id}?brief=1&limit=${PAGE}&offset=${more.next}`);
      setMore({ entries: [...more.entries, ...((page.entries ?? []) as Parameters<typeof entryView>[0][]).map(entryView)], next: typeof page.next === 'number' ? page.next : null });
    } catch (error) {
      setSaid({ tone: 'bad', text: failed(error) });
    }
  }

  const review = (
    <Review
      view={view}
      signedIn={account}
      signIn={signIn}
      steward={steward}
      busy={busy}
      said={said}
      pending={pending}
      ready={merge.ready}
      act={act}
      send={async (verdict, note) => {
        const ok = await act(
          () =>
            verdict === 'comment' && pending.length === 0
              ? call(`${id}/comments`, { body: { body: note } })
              : call(`${id}/reviews`, { body: { verdict, body: note, comments: pending, ...(verdict === 'approve' && Object.keys(merge.resolutions).length ? { resolutions: merge.resolutions } : {}) } }),
          verdict === 'approve' ? 'אישרתם, והשינוי נכנס לספרייה.' : verdict === 'request_changes' ? 'ההצעה הוחזרה למציע עם ההערה.' : 'התגובה נשלחה.',
        );
        if (ok) setPending([]);
        return ok;
      }}
    />
  );

  return (
    <>
      <TopBar title={view.number ? `הצעה #${view.number}` : 'הצעה'} sub="הצעות" />
      <main id="content" className="view">
        <p className={`sg-state sg-${view.live ? 'live' : view.status}`}>{statusWords(view.status, view.live)}</p>
        <Title view={view} mayEdit={mayEdit} busy={busy} save={(title) => act(() => call(`${id}`, { method: 'PATCH', body: { title } }))} />
        <p className="faint sm">
          {personName(view.author, people)}
          {view.via ? <span className="machine sg-agent">{`נשלחה בידי סוכן: ${view.via.name}`}</span> : null}
          {` · ${dayOf(view.submittedAt ?? view.createdAt)} · `}
          {view.total === 1 ? 'פריט אחד' : `${view.total} פריטים`}
          {' · '}
          <Link to="/suggestions">כל ההצעות</Link>
        </p>
        {view.via && open && <p className="faint sm">סוכן כתב את ההצעה הזאת בשביל המציע. עד שאדם יבדוק אותה, היא עבודה של מכונה.</p>}
        <Segmented
          label="חלקי ההצעה"
          value={tab}
          onChange={(next) => setParams(next === 'talk' ? {} : { tab: next }, { replace: true, preventScrollReset: true })}
          options={[
            { value: 'talk', label: talk ? `שיחה (${talk.timeline.filter((i) => i.type === 'comment').length})` : 'שיחה' },
            { value: 'changes', label: `השינויים (${view.total})` },
          ]}
        />
        {tab === 'talk' ? (
          <>
            <Description view={view} mayEdit={mayEdit} busy={busy} save={(description) => act(() => call(`${id}`, { method: 'PATCH', body: { description } }))} />
            <SectionHead title="מה היא משנה" more={view.total > 2 ? { label: `כל ${view.total} השינויים`, to: '?tab=changes' } : undefined} />
            {view.entries.slice(0, 2).map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
            <Checks view={view} />
            {account && open ? <Merge id={id} mayUpdate={view.mine || steward} onChoices={(resolutions, ready) => setMerge({ resolutions, ready })} onChanged={() => void refresh()} /> : null}
            {view.mayApprove && open ? review : null}
            <SectionHead title="השיחה" />
            {talk ? (
              <Timeline items={talk.timeline} people={people} entries={entries} reply={account ? (body, parent) => act(() => call(`${id}/comments`, { body: { body, parent } })) : undefined} />
            ) : view.number ? (
              <p className="faint">השיחה לא נטענה. נסו שוב בעוד רגע.</p>
            ) : (
              <p className="faint">להצעה שיובאה אין שיחה. בודקים את השינויים ומאשרים.</p>
            )}
            {view.mayApprove && open ? null : review}
            <Details view={view} talk={talk} people={people} signedIn={Boolean(account)} busy={busy} act={act} />
          </>
        ) : (
          <>
            <SectionHead title={view.total === 1 ? 'השינוי' : `${view.total} השינויים`} />
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} onComment={account && view.number ? comment : undefined} onKeep={account && open ? (c) => setPending((now) => [...now, c]) : undefined} />
            ))}
            {more.next !== null && (
              <div className="btns">
                <Button look="outline" onClick={() => void loadMore()}>
                  {`עוד שינויים (${view.total - entries.length})`}
                </Button>
              </div>
            )}
            {review}
          </>
        )}
      </main>
    </>
  );
}

/** The title, and for its author (or a steward) a way to change it. */
function Title({ view, mayEdit, busy, save }: { view: SuggestionView; mayEdit: boolean; busy: boolean; save: (title: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(view.title);
  if (editing)
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save(title.trim())) setEditing(false);
        }}
      >
        <Field label="כותרת" value={title} maxLength={200} onChange={(e) => setTitle(e.currentTarget.value)} dir="auto" />
        <div className="btns">
          <Button small type="submit" disabled={busy || !title.trim()}>
            לשמור
          </Button>
          <Button small look="ghost" onClick={() => setEditing(false)}>
            ביטול
          </Button>
        </div>
      </form>
    );
  return (
    <div className="sg-title">
      <h1>
        <bdi>{view.title}</bdi>
        {view.number ? <span className="faint">{` #${view.number}`}</span> : null}
      </h1>
      {mayEdit && <IconButton icon="pen" label="לשנות את הכותרת" small onClick={() => (setTitle(view.title), setEditing(true))} />}
    </div>
  );
}

/** What its author wrote about it, and for them a way to change it. */
function Description({ view, mayEdit, busy, save }: { view: SuggestionView; mayEdit: boolean; busy: boolean; save: (text: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(view.description ?? '');
  if (editing)
    return (
      <div className="sg-compose">
        <Area label="תיאור" value={text} onChange={(e) => setText(e.currentTarget.value)} dir="auto" />
        <div className="btns">
          <Button small disabled={busy} onClick={async () => (await save(text.trim())) && setEditing(false)}>
            לשמור
          </Button>
          <Button small look="ghost" onClick={() => setEditing(false)}>
            ביטול
          </Button>
        </div>
      </div>
    );
  return (
    <div className="sg-desc">
      {view.description ? <Said text={view.description} /> : <p className="faint">המציע לא כתב תיאור.</p>}
      {mayEdit && (
        <Button small look="ghost" icon="pen" onClick={() => (setText(view.description ?? ''), setEditing(true))}>
          לערוך את התיאור
        </Button>
      )}
    </div>
  );
}

/** What the API checked: how many passed and each that did not; and whether a keeper has approved it yet. */
function Checks({ view }: { view: SuggestionView }) {
  const { passed, problems, more } = view.checks;
  if (!passed && !problems.length && !more && !isOpen(view.status)) return null;
  return (
    <>
      <SectionHead title="בדיקות" />
      <ul className="sg-checks">
        {passed > 0 && <li className="ok">{passed === 1 ? 'בדיקה אחת עברה' : `${passed} בדיקות עברו`}</li>}
        {problems.map((p, at) => (
          <li key={at} className={p.status}>
            {p.status === 'fail' ? 'נכשלה: ' : 'אזהרה: '}
            <bdi>{p.message}</bdi>
          </li>
        ))}
        {more > 0 && <li className="warn">{`ועוד ${more} בפריטים שבעמודים אחרים`}</li>}
        {isOpen(view.status) && <li className={view.approvals ? 'ok' : 'wait'}>{view.approvals ? 'שומר ספר אישר אותה' : 'ממתינה לאישור של שומר ספר'}</li>}
      </ul>
    </>
  );
}

type Act = (run: () => Promise<unknown>, done?: string) => Promise<boolean>;

/**
 * The review, at the foot of the conversation or under the changes: for those
 * who may approve it, a note and Approve, Send back or only comment; for
 * everyone else signed in, a comment; for its author, Close; once it is closed
 * or in, Reopen or Undo for those allowed.
 */
function Review({
  view,
  signedIn,
  signIn,
  steward,
  busy,
  said,
  pending,
  ready,
  act,
  send,
}: {
  view: SuggestionView;
  signedIn: ReturnType<typeof useAccount>;
  signIn: string;
  steward: boolean;
  busy: boolean;
  said: { tone: 'good' | 'bad'; text: string } | null;
  pending: FieldComment[];
  ready: boolean;
  act: Act;
  send: (verdict: 'approve' | 'request_changes' | 'comment', note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState('');
  const id = view.id;
  const open = isOpen(view.status);
  const message = said && <Say tone={said.tone}>{said.text}</Say>;
  if (signedIn === undefined) return message;
  if (!signedIn)
    return (
      <section className="panel sg-review" aria-label="בדיקה">
        {message}
        <p>
          כדי להגיב או לבדוק צריך <Link to={signIn}>להיכנס</Link>.
        </p>
      </section>
    );
  if (view.live)
    return (
      <section className="panel sg-review" aria-label="בדיקה">
        {message}
        <p>השינוי הזה כבר באתר. שומרי הספר משאירים או מבטלים אותו בחדר האחורי.</p>
        <Button small look="outline" to="/back">
          לחדר האחורי
        </Button>
      </section>
    );
  const sendAndClear = async (verdict: 'approve' | 'request_changes' | 'comment') => {
    if (await send(verdict, note.trim())) setNote('');
  };
  return (
    <section className="panel sg-review" aria-labelledby="sg-review-h">
      <h2 id="sg-review-h">{open && view.mayApprove ? 'ההחלטה שלכם' : 'תגובה'}</h2>
      {view.number ? (
        <Area label={open && view.mayApprove ? 'הערה למציע (לא חובה כשמאשרים)' : 'מה לכתוב'} value={note} rows={3} onChange={(e) => setNote(e.currentTarget.value)} />
      ) : null}
      {pending.length > 0 && <p className="faint sm">{`${pending.length === 1 ? 'הערה אחת על השינויים תצורף' : `${pending.length} הערות על השינויים יצורפו`} לבדיקה.`}</p>}
      {message}
      <div className="btns">
        {open && view.mayApprove ? (
          <>
            <Button icon="check" disabled={busy || !ready} onClick={() => void sendAndClear('approve')}>
              לאשר ולהכניס
            </Button>
            {!view.mine && (
              <Button look="outline" disabled={busy || !note.trim()} onClick={() => void sendAndClear('request_changes')}>
                להחזיר למציע
              </Button>
            )}
            {view.number ? (
              <Button look="ghost" disabled={busy || (!note.trim() && !pending.length)} onClick={() => void sendAndClear('comment')}>
                רק להגיב
              </Button>
            ) : null}
          </>
        ) : view.number ? (
          <Button disabled={busy || (!note.trim() && !pending.length)} onClick={() => void sendAndClear('comment')}>
            לשלוח תגובה
          </Button>
        ) : null}
        {open && view.mine && (
          <Button
            look="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm('לסגור את ההצעה? אפשר לפתוח אותה שוב אחר כך.')) void act(() => call(`${id}/withdraw`, { method: 'POST' }), 'ההצעה נסגרה.');
            }}
          >
            לסגור את ההצעה
          </Button>
        )}
        {view.status === 'withdrawn' && view.mine && (
          <Button look="outline" disabled={busy} onClick={() => void act(() => call(`${id}/reopen`, { method: 'POST' }), 'ההצעה נפתחה מחדש.')}>
            לפתוח מחדש
          </Button>
        )}
        {view.status === 'merged' && (view.mine || steward) && (
          <Button
            look="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm('לבטל את השינוי? הוא יוחזר למה שהיה, בהצעה חדשה שמבטלת אותו.')) void act(() => call(`${id}/revert`, { method: 'POST' }), 'השינוי בוטל, והמילים חזרו למה שהיו.');
            }}
          >
            לבטל את השינוי
          </Button>
        )}
      </div>
      {open && !view.mayApprove && <p className="faint sm">רק שומרי הספר מאשרים או מחזירים. כל אחד יכול להגיב.</p>}
      {open && view.mayApprove && !ready && <p className="faint sm">אפשר לאשר כשהיא מוכנה להיכנס: בלי מה שעוצר אותה, ואחרי שהוחלט על כל התנגשות.</p>}
    </section>
  );
}

/** Who is asked to review it and what each said; the reports it fixes. */
function Details({ view, talk, people, signedIn, busy, act }: { view: SuggestionView; talk: Conversation | null; people: SuggestionView['people']; signedIn: boolean; busy: boolean; act: Act }) {
  const [handle, setHandle] = useState('');
  if (!talk) return null;
  const last = new Map<string, 'approve' | 'send_back' | 'comment'>();
  for (const item of talk.timeline) if (item.type === 'review') last.set(item.author, item.verdict);
  const asked = new Set(talk.reviewRequests.map((r) => r.reviewer));
  const reviewers = [...new Set([...asked, ...last.keys()])].filter((r) => r !== view.author);
  const open = isOpen(view.status);
  const words = { approve: 'אישר/ה', send_back: 'החזיר/ה', comment: 'הגיב/ה' } as const;
  return (
    <>
      <SectionHead title="בודקים" />
      {reviewers.length ? (
        <ul className="sg-people">
          {reviewers.map((who) => {
            const verdict = last.get(who);
            const username = people[who]?.username;
            return (
              <li key={who}>
                <span>{personName(who, people)}</span>
                <span className="faint sm">{verdict ? words[verdict] : 'התבקש/ה לבדוק'}</span>
                {signedIn && open && asked.has(who) && username && (
                  <IconButton icon="close" small label={`להסיר את הבקשה מ${personName(who, people)}`} disabled={busy} onClick={() => void act(() => call(`${view.id}/review-requests/${username}`, { method: 'DELETE' }))} />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="faint sm">עוד לא התבקש אף אחד. שומרי הספר רואים כל הצעה פתוחה.</p>
      )}
      {signedIn && open && (
        <form
          className="sg-ask"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = handle.trim().replace(/^@/, '');
            if (name && (await act(() => call(`${view.id}/review-requests`, { body: { reviewers: [name] } }), `ביקשתם בדיקה מ־@${name}.`))) setHandle('');
          }}
        >
          <Field label="לבקש בדיקה משם משתמש" value={handle} onChange={(e) => setHandle(e.currentTarget.value)} dir="ltr" placeholder="@username" />
          <Button small look="outline" type="submit" disabled={busy || !handle.trim()}>
            לבקש
          </Button>
        </form>
      )}
      {talk.fixes.length > 0 && (
        <>
          <SectionHead title="דיווחים שהיא מתקנת" />
          <ul className="sg-list">
            {talk.fixes.map((f) => (
              <li key={f.number}>
                <Link to={`/issues/${f.number}`}>{`#${f.number}`}</Link> <bdi>{f.title ?? ''}</bdi>
                <span className="faint sm">{f.state === 'closed' ? ' · נסגר' : ' · ייסגר כשההצעה תאושר'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
