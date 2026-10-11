import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Field, Panel, Row, Rows, Say, Segmented, useToast } from '../ui';

/**
 * The person's API keys and the apps they connected (docs/developers/auth.md),
 * on the account page: one list from the API's /v1/tokens, through
 * /_/tokens. A key is shown once, when it is made, and never again; a key or
 * an app is revoked here and stops working at once.
 */

interface Token {
  id: string;
  kind: 'personal' | 'oauth';
  name: string;
  prefix: string;
  scopes: ('read' | 'write')[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  client?: { id: string; name: string; uri: string | null; host: string | null };
}

const DOWN = 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.';

/** The API's refusals (core's tokens.ts), as the site says them. */
const REFUSED: [RegExp, string][] = [
  [/a name of 1 to 80/, 'תנו למפתח שם, עד 80 תווים (מה ישתמש בו).'],
  [/at most \d+ tokens/, 'הגעתם למספר המפתחות המרבי. בטלו מפתח שאתם כבר לא צריכים.'],
];

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/_/tokens${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(DOWN);
  }
  const json = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(REFUSED.find(([pattern]) => json.message && pattern.test(json.message))?.[1] ?? (response.status >= 500 ? DOWN : 'משהו השתבש. נסו שוב.'));
  return json;
}

const day = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', year: 'numeric' });
const when = (iso: string) => day.format(new Date(iso));

/** The list, read once the account part of the page is drawn; `reload` after a change. */
function useTokens() {
  const [tokens, setTokens] = useState<Token[] | null | undefined>(undefined);
  const reload = useCallback(() => {
    call<{ tokens: Token[] }>('')
      .then((answer) => setTokens(answer.tokens.filter((token) => !token.revokedAt)))
      .catch(() => setTokens(null));
  }, []);
  useEffect(reload, [reload]);
  return { tokens, reload };
}

/** One key or app, with what it may do and when it was last used, and the button that ends it. */
function TokenRow({ token, title, onRevoke }: { token: Token; title: string; onRevoke: (token: Token) => void }) {
  const expired = token.expiresAt && new Date(token.expiresAt) < new Date();
  const sub = [
    token.scopes.includes('write') ? 'קריאה ושליחת הצעות' : 'קריאה',
    `${token.kind === 'oauth' ? 'חוברה' : 'נוצר'} ב־${when(token.createdAt)}`,
    token.lastUsedAt ? `שימוש אחרון ב־${when(token.lastUsedAt)}` : 'עוד לא נעשה בו שימוש',
    expired ? 'פג תוקף' : token.expiresAt ? `בתוקף עד ${when(token.expiresAt)}` : '',
  ].filter(Boolean);
  return (
    <Row
      title={<bdi>{title}</bdi>}
      sub={sub.join(' · ')}
      end={
        <Button small look="outline" onClick={() => onRevoke(token)}>
          {token.kind === 'oauth' ? 'ניתוק' : 'ביטול'}
        </Button>
      }
    />
  );
}

/** The AI apps connected to the account (through the connect page), each to disconnect. */
export function ConnectedApps() {
  const { tokens, reload } = useTokens();
  const [failure, setFailure] = useState<string | null>(null);
  const apps = tokens?.filter((token) => token.kind === 'oauth') ?? [];
  const revoke = (token: Token) => {
    setFailure(null);
    call(`/${token.id}`, 'DELETE').then(reload, (e: Error) => setFailure(e.message));
  };
  return (
    <Panel title="אפליקציות AI מחוברות">
      <p>אפליקציות כמו Claude שחיברתם לחשבון. כל אחת פועלת בשמכם רק במה שאישרתם.</p>
      {tokens === null && <Say tone="bad">הרשימה לא נטענה. נסו שוב בעוד רגע.</Say>}
      {failure && <Say tone="bad">{failure}</Say>}
      {apps.length > 0 ? (
        <Rows>
          {apps.map((app) => (
            <TokenRow key={app.id} token={app} title={app.client?.host ? `${app.client.name} · ${app.client.host}` : (app.client?.name ?? app.name)} onRevoke={revoke} />
          ))}
        </Rows>
      ) : (
        tokens && <p className="faint sm">עוד לא חיברתם אפליקציה.</p>
      )}
      <div className="btns">
        <Button small look="outline" icon="globe" to="/connect">
          איך מחברים את Claude
        </Button>
      </div>
    </Panel>
  );
}

const EXPIRY = [
  { value: '30', label: '30 יום' },
  { value: '365', label: 'שנה' },
  { value: 'never', label: 'ללא הגבלה' },
] as const;

/** Personal API keys for a script or an agent: made here, shown once, revoked here. */
export function ApiKeys() {
  const { tokens, reload } = useTokens();
  const toast = useToast();
  const [name, setName] = useState('');
  const [write, setWrite] = useState(false);
  const [expiry, setExpiry] = useState<(typeof EXPIRY)[number]['value']>('365');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const keys = tokens?.filter((token) => token.kind === 'personal') ?? [];

  const make = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    call<{ token: string }>('', 'POST', { name: name.trim(), scopes: write ? ['read', 'write'] : ['read'], ...(expiry === 'never' ? {} : { expiresInDays: Number(expiry) }) })
      .then((answer) => {
        setMade(answer.token);
        setName('');
        reload();
      })
      .catch((e: Error) => setFailure(e.message))
      .finally(() => setBusy(false));
  };
  const revoke = (token: Token) => {
    setFailure(null);
    call(`/${token.id}`, 'DELETE').then(reload, (e: Error) => setFailure(e.message));
  };

  return (
    <Panel title="מפתחות API">
      <p>
        מפתח אישי מאפשר לסקריפט או לסוכן AI לפעול בשמכם דרך ה-API. שמרו אותו בסוד. <Link to="/about">למפתחים</Link>
      </p>
      {failure && <Say tone="bad">{failure}</Say>}
      {made && (
        <div className="token">
          <Say tone="good">המפתח נוצר. הוא מוצג פעם אחת בלבד: העתיקו אותו עכשיו.</Say>
          <div className="copyline">
            <input aria-label="המפתח החדש" readOnly value={made} dir="ltr" onFocus={(e) => e.target.select()} />
            <Button
              small
              look="outline"
              icon="copy"
              onClick={() =>
                void navigator.clipboard.writeText(made).then(
                  () => toast('הועתק'),
                  () => toast('לא הצלחנו להעתיק. סמנו והעתיקו ביד.'),
                )
              }
            >
              העתקה
            </Button>
          </div>
        </div>
      )}
      {keys.length > 0 && (
        <Rows>
          {keys.map((key) => (
            <TokenRow key={key.id} token={key} title={`${key.name} · ${key.prefix}…`} onRevoke={revoke} />
          ))}
        </Rows>
      )}
      <form onSubmit={make}>
        <Field label="שם למפתח חדש (מה ישתמש בו)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required dir="auto" />
        <fieldset className="field choice">
          <legend>מה הוא יוכל לעשות</legend>
          <label>
            <input type="checkbox" checked disabled />
            <span>קריאה (מה שאתם עוקבים אחריו, המקומות שלכם)</span>
          </label>
          <label>
            <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
            <span>שליחת הצעות, תיקונים ותגובות בשמכם</span>
          </label>
        </fieldset>
        <Segmented label="תוקף" value={expiry} onChange={setExpiry} options={EXPIRY.map((option) => ({ ...option }))} />
        <div className="btns">
          <Button type="submit" small icon="key" disabled={busy || !name.trim()}>
            {busy ? 'רגע…' : 'יצירת מפתח'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
