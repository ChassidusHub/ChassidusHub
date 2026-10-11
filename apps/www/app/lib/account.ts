import { useEffect, useState } from 'react';

/**
 * Who is signed in, asked by the browser after the page has loaded
 * (/_/auth/me, routes/auth.ts). Pages are the same for everyone and may be
 * kept as such; only this answer is personal, and it is never kept.
 * `undefined` while it is being asked, `null` when nobody is signed in.
 */

export interface SignedIn {
  person: { id: string; displayName: string; username?: string; steward?: boolean; admin?: boolean };
  passkeys: { credentialId: string; deviceType: string | null; backedUp: boolean; createdAt: string; lastUsedAt: string | null }[];
  googleAccounts: { email: string | null; createdAt: string }[];
  /** Addresses that sign this person in by an emailed link (their Google accounts' too). */
  emails: { email: string; createdAt: string; google: boolean }[];
  /** Email updates of what they follow. */
  notifications: { mode: 'off' | 'daily' | 'immediate'; email: string | null; lang: 'he' | 'en' };
}

interface Answer {
  account: SignedIn | null;
  /** Whether the site can sign in with Google. */
  google: boolean;
  /** Whether the site can send email (sign-in links, updates). */
  email: boolean;
}

type MeBody = Partial<Omit<SignedIn, 'person'>> & { person: SignedIn['person'] | null; google?: boolean; email?: boolean };

let asked: Promise<Answer> | null = null;
const listeners = new Set<(value: Answer) => void>();

function ask(): Promise<Answer> {
  asked ??= fetch('/_/auth/me', { credentials: 'same-origin', headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? (r.json() as Promise<MeBody>) : ({ person: null } as MeBody)))
    .then((body) => ({
      account: body.person
        ? {
            person: body.person,
            passkeys: body.passkeys ?? [],
            googleAccounts: body.googleAccounts ?? [],
            emails: body.emails ?? [],
            notifications: body.notifications ?? { mode: 'off' as const, email: null, lang: 'he' as const },
          }
        : null,
      google: body.google ?? false,
      email: body.email ?? false,
    }))
    .catch(() => ({ account: null, google: false, email: false }));
  return asked;
}

/** Forgets the answer (after signing in or out, or a change on the account page) and tells every part of the page that shows it. */
export function refreshAccount(): Promise<Answer> {
  asked = null;
  return ask().then((value) => {
    listeners.forEach((listen) => listen(value));
    return value;
  });
}

/** Everything /_/auth/me says: who is signed in, and which ways of signing in the site has. */
export function useSignIn(): Answer | undefined {
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const listen = (value: Answer) => live && setAnswer(value);
    listeners.add(listen);
    void ask().then(listen);
    return () => {
      live = false;
      listeners.delete(listen);
    };
  }, []);
  return answer;
}

export const useAccount = (): SignedIn | null | undefined => {
  const answer = useSignIn();
  return answer === undefined ? undefined : answer.account;
};

/** A refusal from the API, said in Hebrew. */
export class AuthError extends Error {}

/** Sends one step of signing in, or a change to the account, to the API through the site (/_/auth/…). */
export async function authPost<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/_/auth/${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new AuthError(SAID.down);
  }
  const json = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new AuthError(hebrew(json.message, response.status));
  return json;
}

const SAID = {
  down: 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.',
  cancelled: 'הכניסה בוטלה. אפשר לנסות שוב.',
  other: 'משהו השתבש. נסו שוב.',
};

/** The API's messages (services/api/src/auth.ts, core's usernames.ts), as the site says them. */
const MESSAGES: [RegExp, string][] = [
  [/expired; try again/, 'עבר יותר מדי זמן. נסו שוב.'],
  [/could not be verified/, 'לא הצלחנו לאמת את מפתח הכניסה. נסו שוב.'],
  [/not known here/, 'מפתח הכניסה הזה לא מוכר כאן. אפשר לפתוח חשבון חדש למטה.'],
  [/already belongs to an account; sign in/, 'מפתח הכניסה הזה כבר שייך לחשבון. היכנסו איתו.'],
  [/already belongs to an account/, 'מפתח הכניסה הזה כבר שייך לחשבון.'],
  [/you are signed in; add a passkey/, 'אתם כבר בפנים. מפתח נוסף מוסיפים בדף החשבון.'],
  [/a name of 1 to 60/, 'שם של עד 60 תווים.'],
  [/username is \d+ to \d+/, 'שם משתמש: 2 עד 39 אותיות לטיניות, ספרות ומקפים בודדים, לא בהתחלה ולא בסוף.'],
  [/kept for the site itself/, 'המילה הזאת שמורה לאתר. בחרו אחרת.'],
  [/someone already has that username/, 'שם המשתמש הזה תפוס. בחרו אחר.'],
  [/an email address, like/, 'כתובת מייל, למשל name@example.com.'],
  [/already signs into another account/, 'הכתובת הזאת כבר מכניסה לחשבון אחר.'],
  [/signs into another account; sign out first|adds the address to another account/, 'הקישור הזה שייך לחשבון אחר. צאו קודם מהחשבון.'],
  [/too many links/, 'נשלחו יותר מדי קישורים לכתובת הזאת בשעה האחרונה. נסו שוב מאוחר יותר.'],
  [/has been used or has expired/, 'הקישור כבר שומש או שפג תוקפו. בקשו קישור חדש.'],
  [/by email is not switched on/, 'כניסה במייל עוד לא פועלת באתר.'],
  [/not one of yours; add it first/, 'הכתובת הזאת לא שלכם. הוסיפו אותה קודם.'],
  [/add an email address first/, 'הוסיפו קודם כתובת מייל.'],
  [/sign in first/, 'צריך להיכנס קודם.'],
  [/sign-in happens on the site's own pages/, 'הכניסה נעשית רק מדפי האתר עצמו.'],
];

export function hebrew(message: string | undefined, status?: number): string {
  if (message === 'down' || (status && status >= 500)) return SAID.down;
  for (const [pattern, said] of MESSAGES) if (message && pattern.test(message)) return said;
  return SAID.other;
}

/** What a failed step says: the device's own "no" is not a failure, only a change of mind. */
export function failureOf(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) return SAID.cancelled;
  return SAID.other;
}

/** Only an address on this site may be returned to after signing in. */
export function safeReturn(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/account';
}

/** Signs this browser out, and tells every part of the page. */
export async function signOut(): Promise<void> {
  await authPost('sign-out').catch(() => undefined);
  await refreshAccount();
}
