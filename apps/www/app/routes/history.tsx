import { useState } from 'react';
import { Link } from 'react-router';
import { useAccount } from '../lib/account';
import { Changes } from '../tools/Changes';
import { act, between, dayOf, said, type Version } from '../tools/common';
import { itemHead } from '../tools/item.server';
import { ItemTop } from '../tools/ItemTop';
import { Button, Icon, Say, Segmented } from '../ui';
import type { Route } from './+types/history';
import { KEPT_PAGE } from '../lib/caching';

/**
 * An item's history: every version, newest first, as a pull request's
 * commits are: who changed it and in what words, who approved it and when,
 * and the change itself (the words that changed marked, any other field by
 * its name). Any two versions can be compared. "Restore this version" sends
 * the older version for review like any Suggestion: nothing is ever lost.
 */
export async function loader({ params, context: { api } }: Route.LoaderArgs) {
  const [head, history] = await Promise.all([itemHead(api, params.id), api.itemHistory({ id: params.id }).catch(() => ({ history: [] }))]);
  return { head, history: history.history as unknown as Version[] };
}

export const headers = () => ({ 'Cache-Control': KEPT_PAGE });

export const handle = { section: 'library' };

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `היסטוריה: ${data.head.name} · ChassidusHub` : 'ChassidusHub' }];
}

const nameOf = (id: string, name: string | null, bot?: boolean) => name || (bot ? 'ייבוא' : id === 'system' ? 'המערכת' : 'מישהו');

export default function History({ loaderData: { head, history } }: Route.ComponentProps) {
  const account = useAccount();
  const [side, setSide] = useState<'side' | 'in'>('side');
  const [pick, setPick] = useState<number[]>([]);
  const toggle = (rev: number) => setPick((was) => (was.includes(rev) ? was.filter((r) => r !== rev) : [...was.slice(-1), rev]));
  const order = (rev: number) => history.findIndex((h) => h.rev === rev);
  const [older, newer] = pick.length === 2 ? [...pick].sort((a, b) => order(b) - order(a)) : [];
  const compared = older !== undefined && newer !== undefined ? between(history, older, newer) : undefined;
  const when = (rev: number) => dayOf(history.find((h) => h.rev === rev)?.at);

  // Everyone who changed it, most changes first.
  const people = new Map<string, { name: string; n: number }>();
  for (const h of history) people.set(h.author, { name: nameOf(h.author, h.authorName, h.authorIsBot), n: (people.get(h.author)?.n ?? 0) + 1 });
  const who = [...people.values()].sort((a, b) => b.n - a.n);

  return (
    <>
      <ItemTop head={head} tool="history" />
      <main id="content" className="view it-text">
        <h1>היסטוריה</h1>
        <p className="faint sm">
          <Link to={head.to}>{head.name}</Link> · {history.length} גרסאות
        </p>
        <p className="lede muted">כל שינוי שאושר נשמר כגרסה. החזרה של גרסה ישנה נשלחת לבדיקה כמו כל הצעה.</p>
        {who.length > 0 && <p className="faint sm">שינו כאן: {who.map((p) => `${p.name} (${p.n})`).join(', ')}</p>}

        {history.length === 0 ? (
          <p className="faint">לדף הזה עוד אין גרסאות.</p>
        ) : (
          <>
            <div className="it-bar">
              <Segmented
                label="איך להראות שינוי"
                value={side}
                onChange={setSide}
                options={[
                  { value: 'side', label: 'לפני ואחרי' },
                  { value: 'in', label: 'בתוך הטקסט' },
                ]}
              />
              {history.length > 1 && <span className="faint sm">לבחור שתי גרסאות כדי להשוות.</span>}
            </div>

            {older !== undefined && newer !== undefined && (
              <section className="it-compare" aria-live="polite" aria-labelledby="compare-h">
                <div className="it-compare-h">
                  <h2 id="compare-h">
                    מ־{when(older)} עד {when(newer)}
                  </h2>
                  <Button look="ghost" small onClick={() => setPick([])}>
                    סגירה
                  </Button>
                </div>
                {compared === null ? (
                  <p className="faint sm">את שתי הגרסאות האלה אי אפשר להשוות כאן; השינויים של כל גרסה פתוחים ברשימה.</p>
                ) : compared && compared.length ? (
                  <Changes changes={compared} side={side === 'side'} />
                ) : (
                  <p className="faint sm">אין הבדל בין שתי הגרסאות.</p>
                )}
                {account && order(older) > 0 && <Restore item={head.id} rev={older} />}
              </section>
            )}

            <ol className="it-versions">
              {history.map((h, i) => {
                const author = nameOf(h.author, h.authorName, h.authorIsBot);
                const approver = nameOf(h.mergedBy, h.mergedByName);
                const picked = pick.includes(h.rev);
                return (
                  <li key={h.commit} id={`v${h.rev}`} className={i === 0 ? 'now' : undefined}>
                    <div className="it-version-h">
                      <h2>{h.message || `גרסה ${history.length - i}`}</h2>
                      {history.length > 1 && (
                        <button type="button" className="chip" aria-pressed={picked} onClick={() => toggle(h.rev)}>
                          {picked ? (h.rev === older ? 'הישנה' : h.rev === newer ? 'החדשה' : 'נבחרה') : 'להשוות'}
                        </button>
                      )}
                    </div>
                    <p className="faint sm">
                      {dayOf(h.at)} · {h.mergedBy !== h.author ? `הצעה של ${author}, אישר ${approver}` : author}
                      {i === 0 ? ' · הגרסה שמוצגת עכשיו' : ''}
                    </p>
                    {h.created ? (
                      <p className="sm">הדף נוצר.</p>
                    ) : h.deleted ? (
                      <p className="sm">הדף נמחק.</p>
                    ) : i === 0 ? (
                      <Changes changes={h.changes} side={side === 'side'} />
                    ) : (
                      <details>
                        <summary>
                          <Icon name="chevron-down" size="s" />
                          מה השתנה
                        </summary>
                        <Changes changes={h.changes} side={side === 'side'} />
                      </details>
                    )}
                    {i > 0 && account && !h.deleted && <Restore item={head.id} rev={h.rev} />}
                  </li>
                );
              })}
            </ol>
          </>
        )}
        {account === null && history.length > 1 && (
          <p className="faint sm">
            כדי להחזיר גרסה ישנה צריך <Link to={`/signin?return=${encodeURIComponent(`/history/${head.id}`)}`}>להיכנס</Link>.
          </p>
        )}
      </main>
    </>
  );
}

/** "Restore this version": the older version, sent for review as a Suggestion. */
function Restore({ item, rev }: { item: string; rev: number }) {
  const [state, setState] = useState<{ busy?: boolean; sent?: number | null; error?: string }>({});
  if (state.sent !== undefined)
    return (
      <Say tone="good">
        נשלח לבדיקה.{' '}
        {state.sent ? <Link to={`/suggestions/${state.sent}`}>לראות את ההצעה</Link> : null}
      </Say>
    );
  return (
    <div className="btns">
      <Button
        look="outline"
        small
        icon="history"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true });
          const answer = await act('restore', { item, rev });
          setState(answer.ok ? { sent: typeof answer.suggestion === 'number' ? answer.suggestion : null } : { error: said(answer) });
        }}
      >
        {state.busy ? 'שולח…' : 'להחזיר את הגרסה הזאת'}
      </Button>
      {state.error && <Say tone="bad">{state.error}</Say>}
    </div>
  );
}
