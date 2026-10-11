import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAccount } from '../lib/account';
import { asPerson, day, nameOf, saidOf, threadHref, type InboxLine } from '../people/talk';
import { Button, Chips, IconButton, Say, TopBar } from '../ui';
import type { Route } from './+types/inbox';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'התיבה שלי · ChassidusHub' }];
}

/** The page is the same for everyone; only what the browser then asks is the person's. */
export const headers = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

/** The views of the inbox, each its own address (`?filter=`). */
const FILTERS = [
  { value: 'unread', label: 'שלא נקראו' },
  { value: 'all', label: 'הכול' },
  { value: 'mention', label: 'אזכורים' },
  { value: 'review_requested', label: 'בקשות לבדיקה' },
  { value: 'assigned', label: 'שויכו אליי' },
  { value: 'comment', label: 'תגובות' },
] as const;

/** Why a line is there, in a word. */
const REASONS: Record<InboxLine['reason'], string> = {
  mention: 'הזכירו אתכם',
  review_requested: 'בקשה לבדיקה',
  assigned: 'שויך אליכם',
  author: 'שלכם',
  comment: 'תגובה',
  review: 'בדיקה',
  state: 'שינוי מצב',
  followed: 'במעקב',
};

/**
 * The signed-in person's inbox (thread 6): where they were mentioned, asked
 * to review, given something, and what was said in conversations they
 * follow, one line a conversation and reason. Opening a line reads it; the
 * tick reads it without opening. Read in the browser through /_/people, never
 * on the server and never kept.
 */
export default function Inbox() {
  const account = useAccount();
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.some((f) => f.value === params.get('filter')) ? params.get('filter')! : 'unread';
  const [lines, setLines] = useState<InboxLine[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const answer = await asPerson<{ items: InboxLine[]; unread: number }>(`inbox?filter=${encodeURIComponent(filter)}&limit=50`);
      setLines(answer.items);
      setUnread(answer.unread);
      setError(null);
    } catch (e) {
      setLines([]);
      setError(saidOf(e));
    }
  }, [filter]);

  useEffect(() => {
    setLines(null);
    if (account) void load();
  }, [account, load]);

  async function mark(body: { ids?: number[]; all?: boolean; unread?: boolean }, reload = true) {
    try {
      const answer = await asPerson<{ unread: number }>('inbox/read', { body });
      setUnread(answer.unread);
      if (reload) await load();
    } catch (e) {
      setError(saidOf(e));
    }
  }

  return (
    <>
      <TopBar title="התיבה שלי" />
      <main id="content" className="view people">
        <div className="phead">
          <h1>התיבה שלי</h1>
          {account && unread > 0 && (
            <Button small look="outline" icon="check" onClick={() => void mark({ all: true })}>
              סימון הכול כנקרא
            </Button>
          )}
        </div>
        <p className="lede faint">איפה הזכירו אתכם, ביקשו מכם לבדוק, ומה נאמר בשיחות שאתם עוקבים אחריהן.</p>
        {account === undefined ? (
          <p className="faint" aria-busy="true">
            רגע…
          </p>
        ) : !account ? (
          <>
            <p>כדי לראות את התיבה צריך להיכנס.</p>
            <Button to="/signin?return=%2Finbox">כניסה</Button>
          </>
        ) : (
          <>
            <Chips label="מה להראות">
              {FILTERS.map((f) => (
                <button key={f.value} type="button" className="chip" aria-pressed={filter === f.value} onClick={() => setParams(f.value === 'unread' ? {} : { filter: f.value }, { replace: true })}>
                  {f.label}
                  {f.value === 'unread' && unread > 0 && <span className="faint">{unread}</span>}
                </button>
              ))}
            </Chips>
            {error && <Say tone="bad">{error}</Say>}
            {lines === null ? (
              <p className="faint" aria-busy="true">
                רגע…
              </p>
            ) : lines.length === 0 ? (
              !error && <p className="pempty">{filter === 'unread' ? 'אין כאן שום דבר חדש.' : 'אין כאן כלום.'}</p>
            ) : (
              <ul className="threads inbox" aria-label="התיבה">
                {lines.map((line) => {
                  const { subject } = line;
                  const title = subject.title ?? (nameOf(subject.name) || subject.path || subject.id);
                  const to = threadHref(subject.kind, subject.number, subject.id, subject.path) ?? '/inbox';
                  return (
                    <li key={line.id} className={line.read ? undefined : 'unread'}>
                      <Link to={to} className="thread" onClick={() => !line.read && void mark({ ids: [line.id] }, false)}>
                        <span className="t">
                          <b dir="auto">
                            {title}
                            {subject.number ? <span className="faint"> #{subject.number}</span> : null}
                          </b>
                          <span>
                            <span className="tag">{REASONS[line.reason] ?? line.reason}</span> {line.actorName ? <bdi>{line.actorName}</bdi> : null}
                            {line.count > 1 ? ` · ${line.count} פעמים` : ''} · {day(line.at)}
                          </span>
                        </span>
                      </Link>
                      <IconButton small icon={line.read ? 'mail' : 'check'} label={line.read ? 'סימון כלא נקרא' : 'סימון כנקרא'} onClick={() => void mark({ ids: [line.id], unread: line.read })} />
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
