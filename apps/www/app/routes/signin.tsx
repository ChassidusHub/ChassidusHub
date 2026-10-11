import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { authPost, failureOf, refreshAccount, safeReturn, useSignIn } from '../lib/account';
import { UsernameField, useUsername } from '../account/Username';
import { Button, Field, Panel, Say, TopBar } from '../ui';
import type { Route } from './+types/signin';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'כניסה · ChassidusHub' }];
}

/** Why a Google sign-in came back here (the API's `?error=`). */
const GOOGLE_ERRORS: Record<string, string> = {
  'google-failed': 'הכניסה עם Google לא הצליחה. נסו שוב.',
  'google-cancelled': 'הכניסה בוטלה. אפשר לנסות שוב.',
  'google-expired': 'עבר יותר מדי זמן. נסו שוב.',
  'google-off': 'כניסה עם Google עוד לא פועלת באתר.',
};

type Options = { challengeId: string; options: never };

/** The device's own passkey prompt, loaded only when someone presses a button that needs it. */
const webauthn = () => import('@simplewebauthn/browser');

/**
 * Signing in (thread 6). A passkey first: nothing to choose or forget, it
 * lives on the person's phone or computer and opens with their fingerprint,
 * face or screen lock. Or Google, or a link sent by email, where the site
 * has them. New here: a name to be known by, a handle for @mentions, and
 * the device makes the passkey. A link from an email comes back here
 * (`?email-token=`) and the page asks once more before using it, so a mail
 * program that opens links to check them cannot use it up.
 */
export default function Screen() {
  const [params] = useSearchParams();
  const answer = useSignIn();
  const account = answer?.account;
  const returnTo = safeReturn(params.get('return'));
  const emailToken = params.get('email-token');
  const [error, setError] = useState<string | null>(GOOGLE_ERRORS[params.get('error') ?? ''] ?? null);
  const [busy, setBusy] = useState<'in' | 'new' | null>(null);
  const [supported, setSupported] = useState(true);
  // Google sends people back only to chassidushub.org itself, so the beta leaves it out until the switch-over.
  const [onBeta, setOnBeta] = useState(false);
  useEffect(() => {
    setSupported(typeof window.PublicKeyCredential === 'function');
    setOnBeta(location.hostname.startsWith('new.'));
  }, []);

  const done = async () => {
    await refreshAccount();
    location.assign(returnTo);
  };

  async function signIn() {
    setBusy('in');
    setError(null);
    try {
      const { startAuthentication } = await webauthn();
      const { challengeId, options } = await authPost<Options>('passkey/sign-in/options');
      const response = await startAuthentication({ optionsJSON: options });
      await authPost('passkey/sign-in/verify', { challengeId, response });
      await done();
    } catch (e) {
      setError(failureOf(e));
    } finally {
      setBusy(null);
    }
  }

  async function create(name: string, username: string) {
    setBusy('new');
    setError(null);
    try {
      const { startRegistration } = await webauthn();
      const handle = username.trim() || undefined;
      const { challengeId, options } = await authPost<Options>('passkey/register/options', { name, username: handle });
      const response = await startRegistration({ optionsJSON: options });
      await authPost('passkey/register/verify', { challengeId, name, username: handle, response });
      await done();
    } catch (e) {
      setError(failureOf(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <TopBar title="כניסה" />
      <main id="content" className="view">
        <div className="auth">
          <h1>כניסה</h1>
          <p className="lede">כדי לתקן טקסט, לערוך דף ולעקוב אחרי מה שחשוב לכם. לקרוא ולשמוע אפשר גם בלי.</p>
          {error && <Say tone="bad">{error}</Say>}

          {account ? (
            <Panel title="אתם כבר בפנים">
              <p>
                נכנסתם בתור <b>{account.person.displayName}</b>.
              </p>
              <div className="btns">
                <Button to="/account">לחשבון שלי</Button>
                {returnTo !== '/account' && (
                  <Button look="outline" to={returnTo}>
                    חזרה לדף
                  </Button>
                )}
              </div>
            </Panel>
          ) : emailToken ? (
            <EmailLink token={emailToken} onDone={done} />
          ) : (
            <>
              {!supported && <Say>הדפדפן הזה לא תומך במפתחות כניסה. אפשר להיכנס בדרך אחרת, או מדפדפן אחר.</Say>}
              <Panel title="יש לי חשבון">
                <p>היכנסו עם מפתח הכניסה ששמור בטלפון או במחשב.</p>
                <Button className="block" icon="key" onClick={signIn} disabled={busy !== null || !supported || answer === undefined}>
                  {busy === 'in' ? 'רגע…' : 'כניסה עם מפתח כניסה'}
                </Button>
                {answer?.google && !onBeta && (
                  <>
                    <p className="or">או</p>
                    {/* A whole-page visit: the browser goes to Google and comes back. */}
                    <a className="btn outline block" href={`/_/auth/google/start?return=${encodeURIComponent(returnTo)}`}>
                      כניסה עם Google
                    </a>
                  </>
                )}
                {answer?.email && <EmailStart returnTo={returnTo} />}
              </Panel>
              <NewAccount busy={busy} disabled={busy !== null || !supported || answer === undefined} onCreate={create} />
            </>
          )}

          <p className="note">
            <b>מה זה מפתח כניסה?</b> במקום סיסמה: הטלפון או המחשב שלכם שומרים מפתח שפועל רק באתר הזה, ונפתח בטביעת אצבע, בפנים או בנעילת המסך. אין מה לזכור, ואין סיסמה שאפשר לגנוב.
          </p>
        </div>
      </main>
    </>
  );
}

/** A new account: the name they go by, a handle for @mentions (one is suggested from the name), and a passkey. */
function NewAccount({ busy, disabled, onCreate }: { busy: 'in' | 'new' | null; disabled: boolean; onCreate: (name: string, username: string) => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const check = useUsername(username, name);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && check.ok) onCreate(name.trim(), username);
  };
  return (
    <Panel title="חשבון חדש">
      <form onSubmit={submit}>
        <Field label="השם שיופיע ליד התיקונים שלכם" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="name" dir="auto" />
        <UsernameField value={username} onChange={setUsername} check={check} />
        <Button type="submit" className="block" look="outline" icon="key" disabled={disabled || !name.trim() || !check.ok}>
          {busy === 'new' ? 'רגע…' : 'פתיחת חשבון'}
        </Button>
      </form>
    </Panel>
  );
}

/** Asking for a sign-in link by email. */
function EmailStart({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authPost('email/start', { email, return: returnTo, lang: 'he' });
      setSentTo(email.trim());
    } catch (e) {
      setError(failureOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="or">או קישור במייל</p>
      {sentTo ? (
        <Say tone="good">
          שלחנו קישור אל <bdi>{sentTo}</bdi>. פתחו אותו מהמייל כדי להיכנס.
        </Say>
      ) : (
        <form onSubmit={send}>
          <Field label="כתובת מייל" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required autoComplete="email" dir="ltr" hint="נשלח קישור שמכניס אתכם, בלי סיסמה." />
          {error && <Say tone="bad">{error}</Say>}
          <Button type="submit" className="block" look="outline" icon="mail" disabled={busy || !email.trim()}>
            {busy ? 'רגע…' : 'שליחת קישור'}
          </Button>
        </form>
      )}
    </>
  );
}

/** Arriving from the link in an email: what it is for, a new person's name, and one button that uses it. */
function EmailLink({ token, onDone }: { token: string; onDone: () => void }) {
  const [info, setInfo] = useState<{ email: string; known: boolean; adding: { displayName: string } | null; suggestedName: string | null } | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const check = useUsername(username, name);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    authPost<NonNullable<typeof info>>('email/check', { token })
      .then((answer) => {
        setInfo(answer);
        setName(answer.suggestedName ?? '');
      })
      .catch((e: unknown) => setError(failureOf(e)));
  }, [token]);

  const isNew = info && !info.known && !info.adding;
  async function use(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const answer = await authPost<{ added?: string }>('email/verify', { token, name: name.trim() || undefined, username: (isNew && username.trim()) || undefined });
      if (answer.added) setAdded(true);
      else onDone();
    } catch (e) {
      setError(failureOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="קישור מהמייל">
      {error && <Say tone="bad">{error}</Say>}
      {added && <Say tone="good">הכתובת נוספה לחשבון.</Say>}
      {info && !added && (
        <form onSubmit={use}>
          <p>
            {info.adding ? `הוספת הכתובת לחשבון של ${info.adding.displayName}: ` : info.known ? 'כניסה עם ' : 'חשבון חדש עם '}
            <bdi>
              <b>{info.email}</b>
            </bdi>
          </p>
          {isNew && (
            <>
              <Field label="השם שיופיע ליד התיקונים שלכם" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="name" dir="auto" />
              <UsernameField value={username} onChange={setUsername} check={check} />
            </>
          )}
          <Button type="submit" className="block" disabled={busy || (!!isNew && (!name.trim() || !check.ok))}>
            {busy ? 'רגע…' : 'המשך'}
          </Button>
        </form>
      )}
    </Panel>
  );
}
