import { useCallback, useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { call, dayOf } from '../stewards/call';
import { useFind } from '../stewards/Picker';
import { Button, Field, IconButton, Panel, Row, Rows, Say, SectionHead, TopBar } from '../ui';
import type { Pick, Showcases } from './showcases-pass';
import type { Route } from './+types/showcase';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'דפי תצוגה · ChassidusHub' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export function headers() {
  return { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
}

const MAX_ITEMS = 12;

/**
 * Making a showcase (thread 6, rebuilt from the old /showcase): the owner
 * picks the farbrengens and sichos a guest will see, and gets the page's
 * secret address to send. The farbrengens whose transcripts people checked
 * most are offered first. Saving fixes which recordings and scans the page
 * may give a guest; removing a showcase closes its address at once. Only the
 * platform's admin makes them; everything here is read and saved in the
 * browser through /_/showcases (routes/showcases-pass.ts), never kept.
 */
export default function Screen() {
  const [params, setParams] = useSearchParams();
  const editing = params.get('edit') ?? '';
  const [state, setState] = useState<Showcases | 'owner' | 'none' | 'down' | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const load = useCallback(async () => {
    const answer = await fetch(`/_/showcases${editing ? `?edit=${editing}` : ''}`, { headers: { accept: 'application/json' } }).catch(() => null);
    if (!answer) return setState('down');
    // Read to its end even when refused, so the request is over.
    const body = (await answer.json().catch(() => null)) as Showcases | null;
    if (answer.status === 403) return setState('owner');
    if (answer.status === 404) return setState('none');
    if (!answer.ok || !body) return setState('down');
    setState(body);
  }, [editing]);
  useEffect(() => void load(), [load]);

  return (
    <>
      <TopBar title="דפי תצוגה" />
      <main id="content" className="view wide">
        <h1>דפי תצוגה</h1>
        <p className="lede">דף אחד, נקי, בכתובת סודית משלו, להראות לאנשים שנפגשים איתם: התוועדויות לשמוע עם המילים, ושיחות עם הסריקה שלהן.</p>
        {state === null ? (
          <p className="faint" aria-busy="true">
            רגע…
          </p>
        ) : state === 'owner' ? (
          <Say>רק מנהל האתר יוצר דפי תצוגה.</Say>
        ) : state === 'none' ? (
          <Say>אין כאן דפי תצוגה.</Say>
        ) : state === 'down' ? (
          <Say tone="bad">אין חיבור לאתר כרגע. נסו שוב בעוד רגע.</Say>
        ) : (
          <>
            {saved && <Saved token={saved} />}
            {state.list.length > 0 && (
              <>
                <SectionHead title="הדפים שלכם" />
                <div className="showlist rows">
                  {state.list.map((s) => (
                    <Row
                      key={s.token}
                      title={<bdi>{s.title}</bdi>}
                      sub={[s.note, `${s.farbrengens} התוועדויות · ${s.sichos} שיחות`, dayOf(s.updated)].filter(Boolean).join(' · ')}
                      end={
                        <span className="acts">
                          <CopyLink token={s.token} />
                          <Button small look="outline" to={`/show/${s.token}`}>
                            פתיחה
                          </Button>
                          <Button small look="outline" icon="pen" onClick={() => (setSaved(null), setParams({ edit: s.token }))}>
                            עריכה
                          </Button>
                        </span>
                      }
                    />
                  ))}
                </div>
              </>
            )}
            <Editor
              key={state.current?.token ?? 'new'}
              data={state}
              onSaved={(token) => {
                setSaved(token);
                if (token !== editing) setParams({ edit: token });
                else void load();
              }}
              onRemoved={() => {
                setSaved(null);
                setParams({});
                void load();
              }}
            />
          </>
        )}
      </main>
    </>
  );
}

const addressOf = (token: string) => `${typeof location === 'undefined' ? '' : location.origin}/show/${token}`;

function CopyLink({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      small
      look="outline"
      icon={done ? 'check' : 'copy'}
      onClick={() =>
        void navigator.clipboard?.writeText(addressOf(token)).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        })
      }
    >
      {done ? 'הועתק' : 'העתקת הקישור'}
    </Button>
  );
}

function Saved({ token }: { token: string }) {
  return (
    <Say tone="good">
      נשמר. זה הקישור לשלוח:{' '}
      <a href={`/show/${token}`} dir="ltr">
        {addressOf(token)}
      </a>
      <span className="btns">
        <CopyLink token={token} />
      </span>
    </Say>
  );
}

function Editor({ data, onSaved, onRemoved }: { data: Showcases; onSaved: (token: string) => void; onRemoved: () => void }) {
  const current = data.current;
  const [title, setTitle] = useState(current?.title ?? 'ChassidusHub');
  const [note, setNote] = useState(current?.note ?? '');
  const [farbrengens, setFarbrengens] = useState<Pick[]>(current?.farbrengens ?? data.best.slice(0, 3));
  const [sichos, setSichos] = useState<Pick[]>(current?.sichos ?? data.read.slice(0, 3));
  const [originals, setOriginals] = useState<Record<string, string>>(current?.originals ?? {});
  const [numbers, setNumbers] = useState(current?.numbers ?? true);
  const [keepReadings, setKeepReadings] = useState<number[]>((current?.readings ?? []).map((_, at) => at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const has = (id: string) => farbrengens.some((p) => p.id === id) || sichos.some((p) => p.id === id);
  const addTo = (set: typeof setFarbrengens) => (pick: Pick) => set((list) => (list.some((p) => p.id === pick.id) || list.length >= MAX_ITEMS ? list : [...list, pick]));

  async function save(intent: 'save' | 'delete') {
    setBusy(true);
    setError(null);
    try {
      const answer = await call<{ token?: string }>('/_/showcases', 'POST', {
        intent,
        token: current?.token,
        title,
        note,
        numbers,
        farbrengens: farbrengens.map((p) => p.id),
        sichos: sichos.map((p) => p.id),
        originals,
        keepReadings,
      });
      if (intent === 'delete') onRemoved();
      else onSaved(answer.token!);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={current ? `עריכת הדף: ${current.title}` : 'דף חדש'}>
      <Field label="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} dir="auto" />
      <Field label="שורה מתחת לכותרת (לא חובה)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={240} dir="auto" placeholder="למשל: הוכן במיוחד עבור…" />

      <Finder has={has} onEvent={addTo(setFarbrengens)} onUnit={addTo(setSichos)} />

      <h3>התוועדויות</h3>
      <p className="faint sm">לשמוע, עם המילים. אפשר לצרף את המקור הכתוב (קישור Drive).</p>
      <Picked list={farbrengens} set={setFarbrengens} originals={originals} setOriginal={(id, link) => setOriginals((o) => ({ ...o, [id]: link }))} />

      <h3>שיחות עם הסריקה</h3>
      <p className="faint sm">הסריקה של השיחה, ולצדה הטקסט שנקרא ממנה (כשיש).</p>
      <Picked list={sichos} set={setSichos} />

      {current && current.readings.length > 0 && (
        <>
          <h3>דפים שהקורא שלנו קרא</h3>
          {current.readings.map((r, at) => (
            <label key={at} className="check">
              <input type="checkbox" checked={keepReadings.includes(at)} onChange={(e) => setKeepReadings((k) => (e.target.checked ? [...k, at] : k.filter((x) => x !== at)))} />
              <bdi>{r.title}</bdi>
            </label>
          ))}
        </>
      )}

      <label className="check">
        <input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} />
        גם האוסף במספרים
      </label>

      {error && <Say tone="bad">{error}</Say>}
      <div className="btns">
        <Button onClick={() => save('save')} disabled={busy}>
          {busy ? 'שומר…' : 'שמירה וקבלת קישור'}
        </Button>
        {current &&
          (removing ? (
            <span className="sure">
              <span className="sm">הקישור יפסיק לעבוד מיד.</span>
              <Button small onClick={() => save('delete')} disabled={busy}>
                מחיקה
              </Button>
              <Button small look="ghost" onClick={() => setRemoving(false)}>
                ביטול
              </Button>
            </span>
          ) : (
            <Button look="outline" onClick={() => setRemoving(true)}>
              מחיקת הדף
            </Button>
          ))}
      </div>

      {data.best.length > 0 && (
        <>
          <h3>התמלולים הטובים ביותר</h3>
          <p className="faint sm">התוועדויות שהתמלול שלהן נבדק הכי הרבה, אחר כך הארוכות.</p>
          <Rows>
            {data.best.map((b) => (
              <Row
                key={b.id}
                title={b.label}
                sub={`${b.sub} · ${b.parts} חלקים · ${b.paragraphs} פסקאות · ${b.checked} נבדקו`}
                end={
                  <Button small look="outline" icon="plus" disabled={has(b.id)} onClick={() => addTo(setFarbrengens)(b)}>
                    הוספה
                  </Button>
                }
              />
            ))}
          </Rows>
        </>
      )}
      {data.read.length > 0 && (
        <>
          <h3>שיחות שהקורא שלנו קרא</h3>
          <p className="faint sm">
            <span className="machine">מכונה</span> לקוטי שיחות שהטקסט שלהן נקרא מהסריקה ועוד לא נבדק, החדשות קודם.
          </p>
          <Rows>
            {data.read.map((r) => (
              <Row
                key={r.id}
                title={r.label}
                sub={r.segments ? `${r.sub} · ${r.segments} פסקאות` : r.sub}
                end={
                  <Button small look="outline" icon="plus" disabled={has(r.id)} onClick={() => addTo(setSichos)(r)}>
                    הוספה
                  </Button>
                }
              />
            ))}
          </Rows>
        </>
      )}
    </Panel>
  );
}

/** What was picked, in order: up a place, or out; a farbrengen with its original's link. */
function Picked({ list, set, originals, setOriginal }: { list: Pick[]; set: (f: (list: Pick[]) => Pick[]) => void; originals?: Record<string, string>; setOriginal?: (id: string, link: string) => void }) {
  if (!list.length) return <p className="faint">לא נבחר עדיין.</p>;
  return (
    <Rows>
      {list.map((p, at) => (
        <div key={p.id} className="row stew">
          <span className="t">
            <b>{p.label}</b>
            <span>{p.sub}</span>
            {setOriginal && (
              <span className="field">
                <input aria-label={`המקור של ${p.label} (קישור Drive, לא חובה)`} placeholder="המקור: קישור Drive (לא חובה)" value={originals?.[p.id] ?? ''} onChange={(e) => setOriginal(p.id, e.target.value)} dir="ltr" />
              </span>
            )}
          </span>
          <span className="acts">
            <IconButton small icon="chevron-up" label={`למעלה: ${p.label}`} disabled={at === 0} onClick={() => set((l) => [...l.slice(0, at - 1), l[at]!, l[at - 1]!, ...l.slice(at + 1)])} />
            <IconButton small icon="close" label={`הסרה: ${p.label}`} onClick={() => set((l) => l.filter((x) => x.id !== p.id))} />
          </span>
        </div>
      ))}
    </Rows>
  );
}

/** Finding farbrengens and sichos by name or date (GET /_/find). */
function Finder({ has, onEvent, onUnit }: { has: (id: string) => boolean; onEvent: (p: Pick) => void; onUnit: (p: Pick) => void }) {
  const [q, setQ] = useState('');
  const found = (useFind(q) ?? []).filter((f) => f.type === 'event' || f.type === 'unit');
  const id = useId();
  return (
    <>
      <div className="field">
        <label htmlFor={id}>חיפוש התוועדות או שיחה (שם, תאריך, חלק)</label>
        <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} dir="auto" autoComplete="off" />
      </div>
      {found.length > 0 && (
        <Rows>
          {found.map((f) => (
            <Row
              key={f.id}
              title={f.label}
              sub={f.sub}
              end={
                <Button small look="outline" icon="plus" disabled={has(f.id)} onClick={() => (f.type === 'event' ? onEvent : onUnit)({ id: f.id, label: f.label, sub: f.sub })}>
                  הוספה
                </Button>
              }
            />
          ))}
        </Rows>
      )}
    </>
  );
}
