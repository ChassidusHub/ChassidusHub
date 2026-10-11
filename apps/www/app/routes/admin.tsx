import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAccount } from '../lib/account';
import { nameOf } from '../lib/catalog';
import { call, dayOf } from '../stewards/call';
import { Button, Field, Icon, Panel, Row, Rows, Say, Segmented, TopBar } from '../ui';
import type { Route } from './+types/admin';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'כלי השומרים · ChassidusHub' }, { name: 'robots', content: 'noindex' }];
}

type Tab = 'people' | 'reports' | 'takedowns';
const TABS: { value: Tab; label: string }[] = [
  { value: 'people', label: 'אנשים' },
  { value: 'reports', label: 'דיווחים' },
  { value: 'takedowns', label: 'בקשות הסרה' },
];

/**
 * The stewards' tools (thread 6, rebuilt from the old /admin): the people
 * with accounts (a platform admin appoints stewards; a steward suspends and
 * restores), the reports readers sent (resolved or dismissed), and takedown
 * requests, where each file a request points at is taken down in one press
 * (it stops being served at once; a private copy is kept). Everything here is
 * personal and powerful: read and written in the browser as the person,
 * through /_/steward (routes/steward-pass.ts), never kept, and the API
 * decides again who may see and do each thing. The page itself is the same
 * for everyone.
 */
export default function Screen() {
  const account = useAccount();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: Tab = asked === 'reports' || asked === 'takedowns' ? asked : 'people';
  const [error, setError] = useState<string | null>(null);
  const steward = !!(account?.person.steward || account?.person.admin);
  return (
    <>
      <TopBar title="כלי השומרים" />
      <main id="content" className="view wide">
        <h1>כלי השומרים</h1>
        {account === undefined ? (
          <p className="faint" aria-busy="true">
            רגע…
          </p>
        ) : account === null ? (
          <>
            <p className="lede">הדף הזה לשומרי האתר.</p>
            <Button to="/signin?return=%2Fadmin">כניסה</Button>
          </>
        ) : !steward ? (
          <Say>רק שומרי האתר רואים את הדף הזה.</Say>
        ) : (
          <>
            <p className="lede">{account.person.admin ? 'האנשים שיש להם חשבון, ומינוי שומרים; הדיווחים שקוראים שלחו; ובקשות הסרה.' : 'האנשים שיש להם חשבון, הדיווחים שקוראים שלחו, ובקשות הסרה.'}</p>
            <Segmented
              label="חלק"
              value={tab}
              options={TABS}
              onChange={(value) => {
                setError(null);
                setParams(value === 'people' ? {} : { tab: value }, { replace: true, preventScrollReset: true });
              }}
            />
            {error && <Say tone="bad">{error}</Say>}
            {tab === 'people' ? <People onError={setError} /> : tab === 'reports' ? <Reports onError={setError} /> : <Takedowns onError={setError} />}
            <p className="faint sm">
              עוד לשומרים: <Link to="/back">החדר האחורי</Link> · <Link to="/organize">סידור הקטלוג</Link>
              {account.person.admin && (
                <>
                  {' '}
                  · <Link to="/showcase">דפי תצוגה</Link>
                </>
              )}
            </p>
          </>
        )}
      </main>
    </>
  );
}

type OnError = (message: string | null) => void;

/** A list read from /_/steward, and read again after each change. */
function useList<T>(path: string, onError: OnError, wait = 0) {
  const [value, setValue] = useState<T | null>(null);
  const load = useCallback(async () => {
    try {
      setValue(await call<T>(`/_/steward/${path}`));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [path, onError]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), wait);
    return () => clearTimeout(timer);
  }, [load, wait]);
  /** One change, then the list again; a change that cannot be quietly undone asks first, on the row itself. */
  const act = async (to: string, body: unknown) => {
    onError(null);
    try {
      await call(`/_/steward/${to}`, 'POST', body);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  return { value, act };
}

/** A button that asks once more before it acts: pressed, it becomes "בטוח?" with the real action beside a way back. */
function Sure({ label, sure, onSure }: { label: string; sure: string; onSure: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button small look="outline" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  return (
    <span className="sure">
      <span className="sm">{sure}</span>
      <Button small onClick={() => (setAsking(false), onSure())}>
        {label}
      </Button>
      <Button small look="ghost" onClick={() => setAsking(false)}>
        ביטול
      </Button>
    </span>
  );
}

interface Person {
  id: string;
  username?: string;
  displayName: string;
  steward: boolean;
  admin: boolean;
  createdAt: string;
  passkeys: number;
  google: string | null;
  suspended: boolean;
  suggestions: number;
}

function People({ onError }: { onError: OnError }) {
  const [q, setQ] = useState('');
  const { value, act } = useList<{ me: { admin: boolean }; people: Person[] }>(`admin/people${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`, onError, 250);
  return (
    <>
      <Field label="חיפוש לפי שם או מספר חשבון" type="search" value={q} onChange={(e) => setQ(e.target.value)} dir="auto" />
      {value === null ? (
        <p className="faint" aria-busy="true">
          רגע…
        </p>
      ) : value.people.length === 0 ? (
        <Say>לא נמצא אף אחד.</Say>
      ) : (
        <Rows>
          {value.people.map((p) => {
            const role = p.admin ? 'מנהל האתר' : p.steward ? 'שומר' : '';
            const sub = [
              <bdi key="id" dir="ltr">
                {p.id}
              </bdi>,
              dayOf(p.createdAt),
              p.passkeys ? `${p.passkeys} מפתחות כניסה` : '',
              p.google ? <bdi key="g">{p.google}</bdi> : '',
              p.suggestions ? `${p.suggestions} הצעות` : '',
            ].filter(Boolean);
            return (
              <div key={p.id} className="row stew">
                <span className="t">
                  <b>
                    <bdi>{p.displayName}</bdi>
                    {p.username && (
                      <span className="faint sm">
                        {' '}
                        <bdi dir="ltr">@{p.username}</bdi>
                      </span>
                    )}
                    {role && <span className="tag">{role}</span>}
                    {p.suspended && <span className="tag">מושעה</span>}
                  </b>
                  <span>{joined(sub)}</span>
                </span>
                <span className="acts">
                  {value.me.admin && !p.admin && (
                    <Button small look="outline" onClick={() => act(`admin/people/${p.id}/role`, { steward: !p.steward })}>
                      {p.steward ? 'הסרה משמירה' : 'מינוי לשומר'}
                    </Button>
                  )}
                  {value.me.admin && p.steward && !p.admin && <Sure label="מינוי למנהל" sure="מנהל יכול למנות ולהסיר שומרים. למנות?" onSure={() => act(`admin/people/${p.id}/role`, { admin: true })} />}
                  {!p.admin &&
                    (p.suspended ? (
                      <Button small look="outline" onClick={() => act(`admin/people/${p.id}/suspend`, { on: false })}>
                        החזרה
                      </Button>
                    ) : (
                      <Sure label="השעיה" sure="החשבון ייעצר, ומפתחות ה-API שלו יבוטלו." onSure={() => act(`admin/people/${p.id}/suspend`, { on: true })} />
                    ))}
                </span>
              </div>
            );
          })}
        </Rows>
      )}
    </>
  );
}

const joined = (parts: ReactNode[]) => parts.map((part, at) => (at ? [' · ', part] : part));

/** Why a reader reported, in the site's words (core's report reasons). */
const REASONS: Record<string, string> = {
  'wrong-fact': 'פרט לא נכון',
  'missing-page': 'חסר עמוד',
  'bad-scan': 'סריקה פגומה',
  'audio-problem': 'בעיה בהקלטה',
  'wrong-text': 'טעות בטקסט',
  duplicate: 'כפול',
  rights: 'זכויות',
  offensive: 'פוגעני',
  other: 'אחר',
};

interface Report {
  id: number;
  entity_id: string | null;
  reason: string;
  note: string | null;
  created_at: string;
}
interface Item {
  id: string;
  type: string;
  path: string | null;
  data: { name?: unknown; title?: unknown; label?: unknown };
}

function Reports({ onError }: { onError: OnError }) {
  const { value, act } = useList<{ reports: Report[]; items: Item[] }>('reports?status=open', onError);
  if (value === null)
    return (
      <p className="faint" aria-busy="true">
        רגע…
      </p>
    );
  if (value.reports.length === 0) return <Say>אין דיווחים פתוחים.</Say>;
  return (
    <Rows>
      {value.reports.map((r) => {
        const item = value.items.find((i) => i.id === r.entity_id);
        return (
          <div key={r.id} className="row stew">
            <Icon name="flag" />
            <span className="t">
              <b>{REASONS[r.reason] ?? r.reason}</b>
              {item && <Link to={item.path ?? `/${item.id}`}>{nameOf(item.data.name ?? item.data.title ?? item.data.label, item.id)}</Link>}
              {r.note && (
                <span className="note-text">
                  <bdi>{r.note}</bdi>
                </span>
              )}
              <span>
                #{r.id} · {dayOf(r.created_at)}
              </span>
            </span>
            <span className="acts">
              <Button small icon="check" onClick={() => act(`reports/${r.id}/close`, { outcome: 'resolved' })}>
                טופל
              </Button>
              <Button small look="ghost" onClick={() => act(`reports/${r.id}/close`, { outcome: 'dismissed' })}>
                דחייה
              </Button>
            </span>
          </div>
        );
      })}
    </Rows>
  );
}

interface Takedown {
  report: number;
  at: string;
  name: string;
  email: string;
  relation: 'rights-holder' | 'family' | 'representative' | 'other';
  target: string;
  statement: string | null;
  entityId: string | null;
  files: { sha256: string; mime: string; bytes: number; rights: string; usedBy: string | null }[];
}

const RELATIONS: Record<Takedown['relation'], string> = { 'rights-holder': 'בעלי הזכויות', family: 'המשפחה', representative: 'בשם בעלי הזכויות', other: 'אחר' };

function Takedowns({ onError }: { onError: OnError }) {
  const { value, act } = useList<{ takedowns: Takedown[] }>('admin/takedowns', onError);
  if (value === null)
    return (
      <p className="faint" aria-busy="true">
        רגע…
      </p>
    );
  if (value.takedowns.length === 0) return <Say>אין בקשות הסרה פתוחות.</Say>;
  return (
    <>
      <p className="faint sm">עונים תוך שבועיים. קובץ שמוסר מפסיק להיות מוגש מיד, ועותק פרטי שלו נשמר; שום דבר לא נמחק.</p>
      {value.takedowns.map((d) => (
        <Panel
          key={d.report}
          title={
            <>
              <bdi>{d.name}</bdi> <span className="faint sm">· {RELATIONS[d.relation] ?? d.relation} · #{d.report} · {dayOf(d.at)}</span>
            </>
          }
        >
          <dl className="terms">
            <div>
              <dt>מייל</dt>
              <dd>
                <a href={`mailto:${d.email}`} dir="ltr">
                  {d.email}
                </a>
              </dd>
            </div>
            <div>
              <dt>מה להסיר</dt>
              <dd>
                {d.entityId ? (
                  <Link to={`/${d.entityId}`} dir="ltr">
                    {d.target}
                  </Link>
                ) : (
                  <bdi dir="ltr">{d.target}</bdi>
                )}
              </dd>
            </div>
          </dl>
          {d.statement && (
            <blockquote className="quote">
              <bdi>{d.statement}</bdi>
            </blockquote>
          )}
          {d.files.length === 0 ? (
            <Say>הבקשה לא מצביעה על קובץ שאנחנו מגישים. אפשר לענות במייל.</Say>
          ) : (
            <Rows>
              {d.files.map((f) => (
                <Row
                  key={f.sha256}
                  start={<Icon name={f.mime.startsWith('audio/') ? 'listen' : 'scan'} />}
                  title={<bdi dir="ltr">{f.sha256.slice(0, 12)}…</bdi>}
                  sub={<bdi dir="ltr">{`${f.mime} · ${(f.bytes / 1024 / 1024).toFixed(1)} MB`}</bdi>}
                  end={f.rights === 'preserved' ? 'הוסר' : <Sure label="הסרת הקובץ" sure="הקובץ יפסיק להיות מוגש מיד." onSure={() => act(`admin/files/${f.sha256}/takedown`, { report: d.report })} />}
                />
              ))}
            </Rows>
          )}
          <div className="btns">
            <Button small icon="check" onClick={() => act(`reports/${d.report}/close`, { outcome: 'resolved' })}>
              טופל
            </Button>
            <Button small look="ghost" onClick={() => act(`reports/${d.report}/close`, { outcome: 'dismissed' })}>
              דחייה
            </Button>
          </div>
        </Panel>
      ))}
    </>
  );
}
