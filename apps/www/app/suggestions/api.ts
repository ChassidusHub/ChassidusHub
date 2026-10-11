/**
 * A Suggestion's calls from the browser, as the person: through the site's own
 * /_/suggestions/* (routes/suggestions-pass.ts) to the API's /v1/suggestions/*,
 * so the session cookie is this site's. What the API refuses comes back said
 * in Hebrew.
 */

/** A refusal, said as the page says it. */
export class Refused extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const SAID: [RegExp, string][] = [
  [/sign in/i, 'כדי לעשות את זה צריך להיכנס.'],
  [/keepers|may not approve|not allowed|forbidden|steward/i, 'רק שומרי הספר יכולים לעשות את זה.'],
  [/only (its|the) author|your own|not yours/i, 'רק מי ששלח את ההצעה יכול לעשות את זה.'],
  [/clash/i, 'יש התנגשויות שעוד לא הוחלט עליהן.'],
  [/not open|is merged|is withdrawn|already/i, 'ההצעה כבר לא פתוחה לזה. רעננו את הדף.'],
  [/no such user|unknown user|not found/i, 'לא מצאנו את מי שביקשתם.'],
  [/empty|say something|body/i, 'כתבו כמה מילים קודם.'],
];

/** The API's message (English, for developers), as this page says it to people. */
export function hebrewOf(message: string | undefined, status: number): string {
  if (status === 401) return SAID[0]![1];
  if (status >= 500 || status === 0) return 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.';
  for (const [pattern, said] of SAID) if (message && pattern.test(message)) return said;
  if (status === 403) return 'אין לכם הרשאה לעשות את זה.';
  return 'משהו השתבש. נסו שוב.';
}

/** One call: GET when there is no body, else POST (or the method given). */
export async function call<T>(path: string, init?: { method?: 'POST' | 'PATCH' | 'DELETE'; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/_/suggestions/${path}`, {
      method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: init?.body === undefined ? (init?.method ? '{}' : undefined) : JSON.stringify(init.body),
    });
  } catch {
    throw new Refused(hebrewOf(undefined, 0), 0);
  }
  const json = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Refused(hebrewOf(json.message, response.status), response.status);
  return json;
}

/** What failed, as a sentence. */
export const failed = (error: unknown) => (error instanceof Refused ? error.message : 'משהו השתבש. נסו שוב.');
