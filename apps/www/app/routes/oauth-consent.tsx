import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAccount } from '../lib/account';
import { Button, Icon, Panel, Row, Rows, Say, TopBar } from '../ui';
import type { Route } from './+types/oauth-consent';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'חיבור אפליקציה · ChassidusHub' }];
}

/** A request to connect, as the API's /v1/oauth/requests/:id describes it. */
interface ConnectRequest {
  id: string;
  client: { id: string; name: string; uri: string | null; kind: 'registered' | 'metadata'; host: string | null };
  redirectUri: string;
  redirectHost: string;
  loopback: boolean;
  scopes: ('read' | 'write')[];
}

/** Why the API sent someone here without a request (`?error=`). */
const ERRORS: Record<string, string> = {
  invalid_client: 'האפליקציה לא מוכרת כאן: היא לא נרשמה, או שאי אפשר היה לקרוא את התיאור שלה. בקשו ממנה להתחבר מחדש.',
  invalid_redirect: 'הכתובת שהאפליקציה ביקשה לחזור אליה אינה אחת מהכתובות שרשמה, ולכן לא נחזיר אתכם אליה.',
};
const INVALID = 'הבקשה לחיבור אינה תקינה. התחילו שוב מתוך האפליקציה.';
const OVER = 'הבקשה הזאת כבר לא בתוקף (נענתה, או שעברה חצי שעה). התחילו שוב מתוך האפליקציה.';
const DOWN = 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.';

async function ask<T>(id: string, body?: unknown): Promise<T> {
  const response = await fetch(`/_/oauth/requests/${encodeURIComponent(id)}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) throw Object.assign(new Error(response.status === 404 ? OVER : DOWN), { status: response.status });
  return json;
}

/**
 * Connecting an app to the person's account (thread 6; the API's OAuth,
 * services/api/src/oauth.ts): Claude or another agent sends them here from
 * /oauth/authorize, and they say yes or no. The app as it names itself,
 * where it will send them back (what really tells apps apart), and what it
 * may do: reading always, sending suggestions as them only if they leave it
 * ticked. The page is the same for everyone; the request is read by the
 * browser, as the person, and the answer sends the browser back to the app.
 */
export default function Screen() {
  const [params] = useSearchParams();
  const id = params.get('request');
  const error = params.get('error');
  const account = useAccount();
  const [request, setRequest] = useState<ConnectRequest | null | undefined>(undefined);
  const [write, setWrite] = useState(true);
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !account) return;
    ask<ConnectRequest>(id)
      .then((found) => {
        setRequest(found);
        setWrite(found.scopes.includes('write'));
      })
      .catch((e: Error) => {
        setRequest(null);
        setFailure(e.message);
      });
  }, [id, account]);

  async function answer(approve: boolean) {
    if (!request) return;
    setBusy(approve ? 'allow' : 'deny');
    setFailure(null);
    try {
      const { redirect } = await ask<{ redirect: string }>(request.id, { approve, scopes: write ? ['read', 'write'] : ['read'] });
      // Back to the app, with its code or with the person's no.
      window.location.assign(redirect);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : DOWN);
      setBusy(null);
    }
  }

  const here = `/oauth/consent?${params.toString()}`;
  let body;
  if (error || !id) {
    body = <Say tone="bad">{ERRORS[error ?? ''] ?? INVALID}</Say>;
  } else if (account === null) {
    body = (
      <Panel title="קודם נכנסים">
        <p>כדי לחבר אפליקציה לחשבון, קודם נכנסים אליו.</p>
        <Button className="block" icon="key" to={`/signin?return=${encodeURIComponent(here)}`}>
          כניסה
        </Button>
      </Panel>
    );
  } else if (account === undefined || request === undefined) {
    body = (
      <p className="faint" aria-busy="true">
        רגע…
      </p>
    );
  } else if (request === null) {
    body = <Say tone="bad">{failure ?? OVER}</Say>;
  } else {
    body = (
      <>
        {failure && <Say tone="bad">{failure}</Say>}
        <Rows>
          <Row start={<Icon name="user" />} title={account.person.displayName} sub="מחוברים בתור" end={<a href={`/signin?return=${encodeURIComponent(here)}`}>לא אתם?</a>} />
          <Row
            start={<Icon name="globe" />}
            title={<bdi>{request.client.name}</bdi>}
            sub={request.client.kind === 'metadata' ? <bdi dir="ltr">{request.client.id}</bdi> : 'נרשמה בעצמה, בלי חשבון'}
          />
          <Row
            start={<Icon name="exit" />}
            title={
              <bdi dir="ltr">
                <b>{request.redirectHost}</b>
              </bdi>
            }
            sub={
              <>
                אחרי התשובה תחזרו אל <bdi dir="ltr" className="code">{request.redirectUri}</bdi>
              </>
            }
          />
        </Rows>
        {request.loopback && <Say>האפליקציה מחזירה אתכם למחשב שלכם (localhost). כל תוכנה במחשב יכולה להציג את השם הזה. אשרו רק אם פתחתם את החיבור עכשיו, מתוכנה שאתם סומכים עליה.</Say>}
        <fieldset className="field choice">
          <legend>מה היא תוכל לעשות</legend>
          <label>
            <input type="checkbox" checked disabled />
            <span>
              <b>לקרוא</b>
              <span className="hint"> את הקטלוג, ואת מה ששלכם: מה שאתם עוקבים אחריו, והמקומות שבהם עצרתם.</span>
            </span>
          </label>
          {request.scopes.includes('write') && (
            <label>
              <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
              <span>
                <b>לשלוח הצעות בשמכם</b>
                <span className="hint"> תיקונים, הצעות, דיווחים ותגובות, תחת השם שלכם. כל הצעה נבדקת כמו כל הצעה אחרת.</span>
              </span>
            </label>
          )}
        </fieldset>
        <p className="faint sm">לעולם לא: להיכנס לחשבון, לנהל מפתחות או להשתמש בכלי המנהלים.</p>
        <div className="btns">
          <Button icon="check" onClick={() => void answer(true)} disabled={busy !== null}>
            {busy === 'allow' ? 'חוזרים לאפליקציה…' : 'אישור'}
          </Button>
          <Button look="outline" onClick={() => void answer(false)} disabled={busy !== null}>
            ביטול
          </Button>
        </div>
        <p className="note">אפשר לנתק את האפליקציה בכל עת, בדף החשבון.</p>
      </>
    );
  }

  const title = request ? `לחבר את ${request.client.name} לחשבון שלכם?` : 'חיבור אפליקציה';
  return (
    <>
      <TopBar title="חיבור אפליקציה" />
      <main id="content" className="view">
        <div className="auth">
          <h1>
            <bdi>{title}</bdi>
          </h1>
          <p className="lede">אפליקציה מבקשת לפעול בשמכם ב-ChassidusHub. אשרו רק אם אתם מכירים אותה ופתחתם את החיבור בעצמכם.</p>
          {body}
        </div>
      </main>
    </>
  );
}
