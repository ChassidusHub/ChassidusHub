import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ApiKeys, ConnectedApps } from '../account/Tokens';
import { UsernameField, useUsername } from '../account/Username';
import { authPost, failureOf, refreshAccount, signOut, useSignIn, type SignedIn } from '../lib/account';
import { Button, Field, Panel, Row, Rows, Say, Segmented, TopBar } from '../ui';
import type { Route } from './+types/account';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'החשבון שלי · ChassidusHub' }];
}

/** Why the API sent someone back here (`?error=`). */
const ERRORS: Record<string, string> = {
  'google-taken': 'חשבון ה-Google הזה כבר מכניס לחשבון אחר.',
};

const day = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', year: 'numeric' });
const when = (iso: string | null) => (iso ? day.format(new Date(iso)) : '');

/**
 * The signed-in person's account (thread 6): the name and handle others see,
 * the ways they sign in (passkeys, Google, email addresses), email updates
 * of what they follow, the AI apps they connected and their API keys, and
 * signing out. Drawn in the browser, from
 * /_/auth/me: the page itself is the same for everyone.
 */
export default function Screen() {
  const answer = useSignIn();
  const [params] = useSearchParams();
  const cameBack = ERRORS[params.get('error') ?? ''];
  const account = answer?.account;
  return (
    <>
      <TopBar title="החשבון שלי" />
      <main id="content" className="view">
        <div className="auth">
          <h1>החשבון שלי</h1>
          {cameBack && <Say tone="bad">{cameBack}</Say>}
          {answer === undefined ? (
            <p className="faint" aria-busy="true">
              רגע…
            </p>
          ) : !account ? (
            <>
              <p className="lede">עוד לא נכנסתם.</p>
              <Button to="/signin?return=%2Faccount">כניסה</Button>
            </>
          ) : (
            <>
              <Profile account={account} />
              <Passkeys account={account} />
              {(answer.google || account.googleAccounts.length > 0) && <Google account={account} canAdd={answer.google} />}
              {answer.email && <Emails account={account} />}
              {answer.email && <Updates account={account} />}
              <ConnectedApps />
              <ApiKeys />
              <div className="btns">
                <Button
                  look="outline"
                  icon="exit"
                  onClick={async () => {
                    await signOut();
                    location.assign('/');
                  }}
                >
                  יציאה מהחשבון
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

/** One change to the account: busy while it is sent, then a word saying it was done, or why not. */
function useChange() {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: 'good' | 'bad'; text: ReactNode } | null>(null);
  const run = async (work: () => Promise<unknown>, done: ReactNode) => {
    setBusy(true);
    setSaid(null);
    try {
      await work();
      await refreshAccount();
      setSaid({ tone: 'good', text: done });
    } catch (e) {
      setSaid({ tone: 'bad', text: failureOf(e) });
    } finally {
      setBusy(false);
    }
  };
  return { busy, said: said && <Say tone={said.tone}>{said.text}</Say>, run };
}

/** The name shown beside their fixes and suggestions, and their handle for @mentions. */
function Profile({ account }: { account: SignedIn }) {
  const [name, setName] = useState(account.person.displayName);
  const [username, setUsername] = useState(account.person.username ?? '');
  useEffect(() => setName(account.person.displayName), [account.person.displayName]);
  useEffect(() => setUsername(account.person.username ?? ''), [account.person.username]);
  const check = useUsername(username === (account.person.username ?? '') ? '' : username, name);
  const change = useChange();
  const nameChanged = name.trim() && name.trim() !== account.person.displayName;
  const usernameChanged = username.trim().replace(/^@/, '') && username.trim().replace(/^@/, '') !== account.person.username;
  const save = (event: FormEvent) => {
    event.preventDefault();
    void change.run(async () => {
      if (nameChanged) await authPost('name', { name: name.trim() });
      if (usernameChanged) await authPost('username', { username: username.trim() });
    }, 'נשמר.');
  };
  return (
    <Panel title="השם שלכם">
      <form onSubmit={save}>
        <Field label="השם שיופיע ליד התיקונים שלכם" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="name" dir="auto" />
        <UsernameField label="שם משתמש, לאזכורים (@). השם הקודם ימשיך להוביל אליכם." value={username} onChange={setUsername} check={check} />
        {change.said}
        <Button type="submit" small disabled={change.busy || (!nameChanged && !usernameChanged) || !check.ok}>
          {change.busy ? 'רגע…' : 'שמירה'}
        </Button>
      </form>
    </Panel>
  );
}

/** The passkeys that sign them in, and adding one for another phone or computer. */
function Passkeys({ account }: { account: SignedIn }) {
  const change = useChange();
  const add = () =>
    change.run(async () => {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const { challengeId, options } = await authPost<{ challengeId: string; options: never }>('passkey/add/options');
      const response = await startRegistration({ optionsJSON: options });
      await authPost('passkey/add/verify', { challengeId, response });
    }, 'מפתח הכניסה נוסף.');
  return (
    <Panel title="מפתחות כניסה">
      <p>כל טלפון או מחשב שנכנסים ממנו יכול לשמור מפתח משלו.</p>
      {account.passkeys.length > 0 && (
        <Rows>
          {account.passkeys.map((key, at) => (
            <Row
              key={key.credentialId}
              title={key.backedUp ? 'מפתח שמסונכרן בין המכשירים שלכם' : `מפתח ${at + 1}`}
              sub={`נוסף ב־${when(key.createdAt)}${key.lastUsedAt ? ` · שימוש אחרון ב־${when(key.lastUsedAt)}` : ''}`}
            />
          ))}
        </Rows>
      )}
      {change.said}
      <div className="btns">
        <Button small look="outline" icon="key" onClick={add} disabled={change.busy}>
          {change.busy ? 'רגע…' : 'הוספת מפתח כניסה'}
        </Button>
      </div>
    </Panel>
  );
}

/** The Google accounts that sign them in, and linking another (on chassidushub.org itself: Google sends people back only there). */
function Google({ account, canAdd }: { account: SignedIn; canAdd: boolean }) {
  const [onBeta, setOnBeta] = useState(false);
  useEffect(() => setOnBeta(location.hostname.startsWith('new.')), []);
  return (
    <Panel title="Google">
      {account.googleAccounts.length > 0 ? (
        <Rows>
          {account.googleAccounts.map((google) => (
            <Row key={`${google.email}-${google.createdAt}`} title={<bdi>{google.email ?? 'חשבון Google'}</bdi>} sub={`חובר ב־${when(google.createdAt)}`} />
          ))}
        </Rows>
      ) : (
        <p>אפשר להיכנס גם עם חשבון Google.</p>
      )}
      {canAdd && !onBeta && (
        <div className="btns">
          <a className="btn small outline" href="/_/auth/google/start?return=%2Faccount">
            חיבור חשבון Google
          </a>
        </div>
      )}
    </Panel>
  );
}

/** The addresses that sign them in by an emailed link; another is added by a link sent to it. */
function Emails({ account }: { account: SignedIn }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const change = useChange();
  const add = (event: FormEvent) => {
    event.preventDefault();
    const to = email.trim();
    void change.run(async () => {
      await authPost('email/start', { email: to, return: '/account', lang: 'he' });
      setSentTo(to);
      setEmail('');
    }, (
      <>
        שלחנו קישור אל <bdi>{to}</bdi>. הכתובת תתווסף כשתפתחו אותו.
      </>
    ));
  };
  return (
    <Panel title="כתובות מייל">
      {account.emails.length > 0 ? (
        <Rows>
          {account.emails.map((address) => (
            <Row key={address.email} title={<bdi>{address.email}</bdi>} sub={address.google ? 'מחשבון Google' : `נוספה ב־${when(address.createdAt)}`} />
          ))}
        </Rows>
      ) : (
        <p>עוד אין כתובת. עם כתובת אפשר להיכנס בקישור במייל ולקבל עדכונים.</p>
      )}
      <form onSubmit={add}>
        <Field label="הוספת כתובת" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required autoComplete="email" dir="ltr" />
        {change.said}
        <Button type="submit" small look="outline" icon="mail" disabled={change.busy || !email.trim() || sentTo === email.trim()}>
          {change.busy ? 'רגע…' : 'שליחת קישור לאישור'}
        </Button>
      </form>
    </Panel>
  );
}

const MODES = [
  { value: 'off', label: 'כבוי' },
  { value: 'daily', label: 'פעם ביום' },
  { value: 'immediate', label: 'מיד' },
] as const;

/** Email updates of what they follow: off, a daily digest, or at once; to which address, in which language. */
function Updates({ account }: { account: SignedIn }) {
  const setting = account.notifications;
  const change = useChange();
  const save = (next: Partial<SignedIn['notifications']>) => {
    const wanted = { ...setting, ...next };
    void change.run(() => authPost('notifications', { mode: wanted.mode, email: wanted.email ?? account.emails[0]?.email ?? null, lang: 'he' }), 'נשמר.');
  };
  if (account.emails.length === 0) {
    return (
      <Panel title="עדכונים במייל">
        <p>הוסיפו כתובת מייל למעלה כדי לקבל עדכונים על מה שאתם עוקבים אחריו.</p>
      </Panel>
    );
  }
  return (
    <Panel title="עדכונים במייל">
      <p>על מה שאתם עוקבים אחריו: תשובות, אזכורים ובקשות לבדיקה.</p>
      <Segmented label="כמה פעמים" value={setting.mode} options={MODES.map((mode) => ({ ...mode }))} onChange={(mode) => save({ mode })} />
      {setting.mode !== 'off' && account.emails.length > 1 && (
        <div className="chips" role="group" aria-label="לאיזו כתובת">
          {account.emails.map((address) => (
            <button key={address.email} type="button" className="chip" aria-pressed={(setting.email ?? account.emails[0]!.email) === address.email} onClick={() => save({ email: address.email })}>
              <bdi>{address.email}</bdi>
            </button>
          ))}
        </div>
      )}
      {change.said}
    </Panel>
  );
}
