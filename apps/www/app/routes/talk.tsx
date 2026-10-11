import { useId, useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import { useAccount, type SignedIn } from '../lib/account';
import { act, dayOf, said } from '../tools/common';
import { itemHead } from '../tools/item.server';
import { ItemTop } from '../tools/ItemTop';
import { PlainWords } from '../tools/PlainWords';
import { Button, Say } from '../ui';
import type { Route } from './+types/talk';

/** One comment on a talk page (GET /v1/entities/{id}/talk). */
interface Comment {
  id: number;
  parent: number | null;
  author: string;
  authorName: string;
  body: string | null;
  at: string;
  hidden: boolean;
}

/**
 * An item's talk page (the wiki model): the conversation about the page, a
 * topic at a time with its answers under it. Anyone reads it; a signed-in
 * person opens a topic, answers one, or hides their own. Comments are plain
 * words: web addresses, item ids, site paths, @people and #numbers in them
 * become links. Who is signed in is asked by the browser; the page itself
 * is the same for everyone.
 */
export async function loader({ params, context: { api } }: Route.LoaderArgs) {
  const [head, talk] = await Promise.all([itemHead(api, params.id), api.itemTalk({ id: params.id }).catch(() => ({ talk: [] }))]);
  const comments = (talk.talk as Partial<Comment>[]).map((c) => ({ id: c.id!, parent: c.parent ?? null, author: c.author!, authorName: c.authorName || 'מישהו', body: c.body ?? null, at: c.at!, hidden: !!c.hidden }));
  return { head, comments };
}

// Read again on every visit, so a comment just written shows at once.
export const headers = () => ({ 'Cache-Control': 'public, no-cache' });

export const handle = { section: 'library' };

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `שיחה: ${data.head.name} · ChassidusHub` : 'ChassidusHub' }];
}

/** Every answer under a topic, in the order written, however deep it was nested. */
function answersOf(comments: Comment[], root: number): Comment[] {
  const out: Comment[] = [];
  const walk = (parent: number) => {
    for (const c of comments.filter((x) => x.parent === parent)) {
      out.push(c);
      walk(c.id);
    }
  };
  walk(root);
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
}

export default function Talk({ loaderData: { head, comments } }: Route.ComponentProps) {
  const account = useAccount();
  const revalidator = useRevalidator();
  const refresh = () => void revalidator.revalidate();
  const topics = comments.filter((c) => c.parent === null);
  const shown = comments.filter((c) => !c.hidden);
  return (
    <>
      <ItemTop head={head} tool="talk" />
      <main id="content" className="view it-text">
        <h1>שיחה</h1>
        <p className="faint sm">
          <Link to={head.to}>{head.name}</Link> · {topics.length} נושאים · {shown.length} תגובות
        </p>
        <p className="lede muted">כאן מדברים על הדף: מה חסר בו, מה צריך לתקן, ומה עוד כדאי לדעת.</p>
        {topics.length === 0 && <p className="faint">עוד אין כאן נושאים.</p>}
        <ol className="it-topics">
          {topics.map((topic) => (
            <Topic key={topic.id} topic={topic} answers={answersOf(comments, topic.id)} item={head.id} me={account ?? null} onChange={refresh} />
          ))}
        </ol>
        {account ? (
          <section className="panel" aria-labelledby="new-topic">
            <h2 id="new-topic">נושא חדש</h2>
            <Composer item={head.id} label="מה רציתם לומר?" send="לפרסם" onDone={refresh} />
          </section>
        ) : account === null ? (
          <p className="faint sm">
            כדי לכתוב כאן צריך <Link to={`/signin?return=${encodeURIComponent(`/talk/${head.id}`)}`}>להיכנס</Link>.
          </p>
        ) : null}
        <p className="note">אפשר לכתוב ‎@שם כדי להזכיר מישהו, ‎#12 כדי לקשר להצעה, וכתובת או מזהה של דף הופכים לקישור.</p>
      </main>
    </>
  );
}

function Topic({ topic, answers, item, me, onChange }: { topic: Comment; answers: Comment[]; item: string; me: SignedIn | null; onChange: () => void }) {
  const [replying, setReplying] = useState<number | null>(null);
  const done = () => {
    setReplying(null);
    onChange();
  };
  return (
    <li id={`c${topic.id}`} className="it-topic">
      <Said comment={topic} me={me} onReply={() => setReplying(replying === topic.id ? null : topic.id)} onChange={onChange} />
      {replying === topic.id && <Composer item={item} parent={topic.id} label="תשובה" send="להשיב" onDone={done} onCancel={() => setReplying(null)} />}
      {answers.length > 0 && (
        <ol className="it-answers">
          {answers.map((answer) => (
            <li key={answer.id} id={`c${answer.id}`}>
              <Said comment={answer} me={me} onReply={() => setReplying(replying === answer.id ? null : answer.id)} onChange={onChange} />
              {replying === answer.id && <Composer item={item} parent={answer.id} label="תשובה" send="להשיב" onDone={done} onCancel={() => setReplying(null)} />}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/** One comment: who wrote it and when, its words, and what the reader may do with it. */
function Said({ comment, me, onReply, onChange }: { comment: Comment; me: SignedIn | null; onReply: () => void; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <p className="it-by">
        <b>{comment.authorName}</b>{' '}
        <a className="faint sm" href={`#c${comment.id}`}>
          {dayOf(comment.at)}
        </a>
      </p>
      {comment.hidden ? <p className="faint sm">התגובה הזאת הוסתרה.</p> : <PlainWords text={comment.body ?? ''} />}
      {me && !comment.hidden && (
        <div className="it-acts">
          <button type="button" className="chip" onClick={onReply}>
            להשיב
          </button>
          {(comment.author === me.person.id || me.person.steward) && (
            <button
              type="button"
              className="chip"
              onClick={async () => {
                const answer = await act('hide', { comment: comment.id });
                if (answer.ok) onChange();
                else setError(said(answer));
              }}
            >
              להסתיר
            </button>
          )}
        </div>
      )}
      {error && <Say tone="bad">{error}</Say>}
    </>
  );
}

/** Writing: a new topic at the foot of the page, or an answer inside one. */
function Composer({ item, parent, label, send, onDone, onCancel }: { item: string; parent?: number; label: string; send: string; onDone: () => void; onCancel?: () => void }) {
  const id = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="it-compose"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        setError(null);
        const answer = await act('talk', { item, body: text, ...(parent ? { parent } : {}) });
        setBusy(false);
        if (!answer.ok) return setError(said(answer));
        setText('');
        onDone();
      }}
    >
      <label htmlFor={id} className={parent ? 'sr-only' : 'faint sm'}>
        {label}
      </label>
      <textarea id={id} className="it-area" value={text} onChange={(e) => setText(e.target.value)} maxLength={10_000} rows={parent ? 3 : 4} disabled={busy} autoFocus={!!parent} />
      {error && <Say tone="bad">{error}</Say>}
      <div className="btns">
        <Button type="submit" small disabled={busy || !text.trim()}>
          {busy ? 'שולח…' : send}
        </Button>
        {onCancel && (
          <Button look="ghost" small onClick={onCancel}>
            ביטול
          </Button>
        )}
      </div>
    </form>
  );
}
