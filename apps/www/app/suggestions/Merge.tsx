import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button, Say } from '../ui';
import { call, failed } from './api';
import { fieldName, suggestionPath, valueText } from './view';

/** How a clash is settled, as Approve takes it: the site's version, the suggestion's, or words of one's own. */
export type Resolution = { take: 'ours' } | { take: 'theirs' } | { value: unknown };
export type Resolutions = Record<string, Record<string, Resolution>>;

type Stage = 'draft' | 'sent_back' | 'blocked' | 'clashes' | 'ready' | 'merged' | 'withdrawn';

interface Clash {
  entityId: string;
  path: string;
  base?: unknown;
  ours?: unknown;
  theirs?: unknown;
  cut?: boolean;
  withheld?: string;
  decided: Resolution | null;
}

/** What approving would do now (GET or POST /v1/suggestions/:id/merge-check), as the person: it changes nothing. */
export interface MergeCheck {
  stage: Stage;
  status: string;
  ready: boolean;
  mayApprove: boolean | null;
  reason: string | null;
  behind: number;
  approvals: number;
  blocking: { check: string; message: string; entityId?: string }[];
  clashes: Clash[];
  problems: { entityId: string; message: string }[];
  dangling: { from: string; field: string; to: string }[];
  overlaps: { id: number; number: number | null; title: string; shared: number }[];
  named?: Record<string, { name: string | null }>;
}

const STAGES: Record<Stage, string> = {
  draft: 'טיוטה',
  sent_back: 'הוחזרה למציע',
  blocked: 'נעצרה: יש מה לתקן',
  clashes: 'מחכה להחלטה על התנגשויות',
  ready: 'מוכנה להיכנס',
  merged: 'נכנסה לספרייה',
  withdrawn: 'נסגרה',
};

const keyOf = (c: { entityId: string; path: string }) => `${c.entityId}\u0000${c.path}`;

/** The choices as Approve takes them: each item's fields. */
function resolutionsOf(choices: Map<string, Resolution>): Resolutions {
  const out: Resolutions = {};
  for (const [key, resolution] of choices) {
    const [entityId, path] = key.split('\u0000') as [string, string];
    (out[entityId] ??= {})[path] = resolution;
  }
  return out;
}

const sideOf = (r: Resolution | null | undefined) => (!r ? null : 'take' in r ? r.take : 'own');

/** What was typed, read back as the field's kind: words stay words; anything else must be JSON of the same kind. */
function readTyped(text: string, like: unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof like === 'string' || like === undefined) return { ok: true, value: text };
  try {
    const value = JSON.parse(text) as unknown;
    const kind = (v: unknown) => (Array.isArray(v) ? 'list' : v === null ? 'null' : typeof v);
    return like === null || kind(value) === kind(like) ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}
const editable = (value: unknown) => (typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value, null, 2));

/**
 * A Suggestion's way into the library, for those signed in while it is open:
 * where it stands, what would stop it, each field that clashes with what the
 * site changed since (the site's version and the suggestion's side by side,
 * and a choice for each, or for all at once), the other suggestions changing
 * the same items, and for its author (or a steward) Bring up to date. Every
 * choice is checked against the site at once (the API's merge check changes
 * nothing), so Approve is known to go through before it is pressed. The
 * choices go up to the review box, which sends them with Approve.
 */
export function Merge({ id, mayUpdate, onChoices, onChanged }: { id: number; mayUpdate: boolean; onChoices: (resolutions: Resolutions, ready: boolean) => void; onChanged: () => void }) {
  const [check, setCheck] = useState<MergeCheck | null>(null);
  const [choices, setChoices] = useState<Map<string, Resolution>>(new Map());
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const asking = useRef(0);
  const resolutions = resolutionsOf(choices);
  const key = JSON.stringify(resolutions);

  // The check with the choices so far: the newest answer wins.
  const recheck = useCallback(async () => {
    const ask = ++asking.current;
    try {
      const fresh = choices.size ? await call<MergeCheck>(`${id}/merge-check`, { body: { resolutions: resolutionsOf(choices) } }) : await call<MergeCheck>(`${id}/merge-check`);
      if (ask === asking.current) setCheck(fresh);
    } catch (error) {
      if (ask === asking.current) setSaid({ tone: 'bad', text: failed(error) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  useEffect(() => {
    const wait = setTimeout(() => void recheck(), check ? 250 : 0);
    return () => clearTimeout(wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recheck]);

  useEffect(() => {
    onChoices(resolutions, Boolean(check?.ready));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, check?.ready]);

  if (!check)
    return (
      <section className="panel sg-merge" aria-busy="true">
        <h2>הדרך לספרייה</h2>
        <p className="faint">{said?.text ?? 'בודקים מול האתר…'}</p>
      </section>
    );

  const nameOf = (entity: string) => check.named?.[entity]?.name ?? entity;
  const choose = (clash: Clash, resolution: Resolution | null) =>
    setChoices((now) => {
      const next = new Map(now);
      if (resolution) next.set(keyOf(clash), resolution);
      else next.delete(keyOf(clash));
      return next;
    });
  const undecided = check.clashes.filter((c) => !choices.has(keyOf(c)) && c.decided === null).length;

  async function bringUpToDate() {
    setBusy(true);
    setSaid(null);
    try {
      const done = await call<{ updated: number; check: MergeCheck }>(`${id}/update`, { body: { resolutions } });
      setChoices(new Map());
      setCheck(done.check);
      setSaid({ tone: 'good', text: `עודכנה מול האתר: ${done.updated} פריטים.` });
      onChanged();
    } catch (error) {
      setSaid({ tone: 'bad', text: failed(error) });
      void recheck();
    }
    setBusy(false);
  }

  return (
    <section className="panel sg-merge" aria-labelledby="sg-merge-h">
      <h2 id="sg-merge-h">הדרך לספרייה</h2>
      <p role="status">
        <b>{STAGES[check.stage]}</b>
        {check.approvals > 0 && <span className="faint">{` · ${check.approvals === 1 ? 'אישור אחד' : `${check.approvals} אישורים`}`}</span>}
      </p>
      {check.behind > 0 && <p className="faint sm">{`${check.behind} פריטים השתנו באתר מאז שההצעה נכתבה. הם נכנסים שדה אחר שדה.`}</p>}
      {check.blocking.length + check.problems.length > 0 && (
        <>
          <h3>מה עוצר אותה</h3>
          <ul className="sg-list">
            {check.blocking.map((b, at) => (
              <li key={`b${at}`}>
                {b.entityId && <Link to={`/${b.entityId}`}>{nameOf(b.entityId)}</Link>} <bdi>{b.message}</bdi>
              </li>
            ))}
            {check.problems.map((p, at) => (
              <li key={`p${at}`}>
                <Link to={`/${p.entityId}`}>{nameOf(p.entityId)}</Link>: <bdi>{p.message}</bdi>
              </li>
            ))}
          </ul>
        </>
      )}
      {check.dangling.length > 0 && (
        <>
          <h3>פריטים באתר שיצביעו על פריט שנמחק כאן</h3>
          <ul className="sg-list">
            {check.dangling.slice(0, 20).map((d, at) => (
              <li key={at}>
                <Link to={`/${d.from}`}>{nameOf(d.from)}</Link> ← <Link to={`/${d.to}`}>{nameOf(d.to)}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {check.clashes.length > 0 && (
        <>
          <h3>{`התנגשויות (${check.clashes.length})`}</h3>
          <p className="faint sm">מאז שההצעה נכתבה, השדות האלה השתנו באתר אחרת. בוחרים לכל אחד מה נשאר, או לכולם בבת אחת.</p>
          <div className="btns">
            <Button small look="outline" disabled={busy} onClick={() => setChoices(new Map(check.clashes.map((c) => [keyOf(c), { take: 'ours' }] as const)))}>
              בכולן: מה שבאתר
            </Button>
            <Button small look="outline" disabled={busy} onClick={() => setChoices(new Map(check.clashes.map((c) => [keyOf(c), { take: 'theirs' }] as const)))}>
              בכולן: ההצעה
            </Button>
            {choices.size > 0 && (
              <Button small look="ghost" disabled={busy} onClick={() => setChoices(new Map())}>
                לנקות בחירות
              </Button>
            )}
          </div>
          {check.clashes.slice(0, 100).map((clash) => {
            const k = keyOf(clash);
            const side = sideOf(choices.get(k) ?? clash.decided);
            const draft = drafts.get(k) ?? editable(clash.theirs);
            const typed = side === 'own' ? readTyped(draft, clash.theirs ?? clash.ours) : null;
            const group = `clash-${k}`;
            return (
              <div key={k} className="sg-clash">
                <p>
                  <Link to={`/${clash.entityId}`}>{nameOf(clash.entityId)}</Link>
                  <span className="faint">{` · ${fieldName(clash.path)}`}</span>
                </p>
                {clash.withheld ? (
                  <p className="faint sm">המילים שמורות לפי הזכויות. קוראים אותן באתר.</p>
                ) : (
                  <dl className="sg-sides">
                    <div>
                      <dt>היה</dt>
                      <dd dir="auto">{valueText(clash.base)}</dd>
                    </div>
                    <div>
                      <dt>באתר עכשיו</dt>
                      <dd dir="auto">{valueText(clash.ours)}</dd>
                    </div>
                    <div>
                      <dt>בהצעה</dt>
                      <dd dir="auto">{valueText(clash.theirs)}</dd>
                    </div>
                  </dl>
                )}
                {clash.cut && !clash.withheld && <p className="faint sm">ארוך מדי להצגה מלאה: רואים את תחילתו, ובוחרים צד.</p>}
                <fieldset className="field choice" disabled={busy}>
                  <legend>מה נשאר</legend>
                  <label>
                    <input type="radio" name={group} checked={side === 'ours'} onChange={() => choose(clash, { take: 'ours' })} />
                    <span>מה שבאתר</span>
                  </label>
                  <label>
                    <input type="radio" name={group} checked={side === 'theirs'} onChange={() => choose(clash, { take: 'theirs' })} />
                    <span>מה שבהצעה</span>
                  </label>
                  {!clash.cut && !clash.withheld && clash.path !== '' && (
                    <label>
                      <input
                        type="radio"
                        name={group}
                        checked={side === 'own'}
                        onChange={() => {
                          const read = readTyped(draft, clash.theirs ?? clash.ours);
                          choose(clash, read.ok ? { value: read.value } : null);
                          setDrafts((m) => new Map(m).set(k, draft));
                        }}
                      />
                      <span>לכתוב בעצמי</span>
                    </label>
                  )}
                </fieldset>
                {side === 'own' && (
                  <div className="field">
                    <label htmlFor={`own-${k}`}>מה שייכנס</label>
                    <textarea
                      id={`own-${k}`}
                      value={draft}
                      dir="auto"
                      onChange={(e) => {
                        const text = e.currentTarget.value;
                        setDrafts((m) => new Map(m).set(k, text));
                        const read = readTyped(text, clash.theirs ?? clash.ours);
                        if (read.ok) choose(clash, { value: read.value });
                      }}
                    />
                    {typed && !typed.ok && <span className="hint">זה לא באותה צורה כמו השדה (JSON).</span>}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
      {check.overlaps.length > 0 && (
        <>
          <h3>הצעות אחרות שמשנות את אותם פריטים</h3>
          <p className="faint sm">מכניסים אחת, ואז השנייה מראה רק מה שבאמת מתנגש. כדאי להתחיל בישנה.</p>
          <ul className="sg-list">
            {check.overlaps.map((o) => (
              <li key={o.id}>
                <Link to={suggestionPath(o)}>
                  <bdi>{o.title}</bdi>
                </Link>
                <span className="faint">{`${o.number ? ` #${o.number}` : ''} · ${o.shared} משותפים`}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {said && <Say tone={said.tone}>{said.text}</Say>}
      {mayUpdate && check.behind > 0 && (
        <div className="btns">
          <Button small look="outline" disabled={busy || undecided > 0} onClick={() => void bringUpToDate()}>
            {busy ? 'מעדכנים…' : 'לעדכן מול האתר'}
          </Button>
          <span className="faint sm">מכניס לתוך ההצעה את מה שהשתנה באתר מאז, לפי הבחירות כאן.</span>
        </div>
      )}
    </section>
  );
}
