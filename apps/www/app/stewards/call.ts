/**
 * The stewards' pages talk to the API from the browser, as the person, through
 * the site's own narrow pass-throughs (/_/organize, /_/steward, /_/uploads,
 * /_/showcases): what they read is personal and never kept. A refusal comes
 * back as an Error whose message is said in Hebrew.
 */

export const DOWN = 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.';

/** The API's refusals these pages meet most, as the site says them; anything else keeps the API's own words, after a plain lead. */
const SAID: [RegExp, string][] = [
  [/sign in first|unauthori[sz]ed/i, 'צריך להיכנס קודם.'],
  [/only (stewards|platform admins|the owner)/i, 'רק שומרי האתר יכולים לעשות את זה.'],
  [/you cannot suspend yourself/, 'אי אפשר להשעות את עצמכם.'],
  [/new accounts wait a day/i, 'חשבון חדש מחכה יום לפני שמוסיפים קבצים.'],
  [/allowance|too many/i, 'הגעתם למספר המרבי להיום. נסו שוב מחר.'],
  [/too large|too big/i, 'הקובץ גדול מדי.'],
];

export function hebrewOf(message: string | undefined, status: number): string {
  if (status >= 500 || message === 'down') return DOWN;
  const known = SAID.find(([pattern]) => message && pattern.test(message));
  if (known) return known[1];
  return message ? `הבקשה לא עברה: ${message}` : 'משהו השתבש. נסו שוב.';
}

/** One call to the site's `/_/…` address, JSON in and out, with the person's session. */
export async function call<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(DOWN);
  }
  const json = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(hebrewOf(json.message, response.status));
  return json;
}

const day = new Intl.DateTimeFormat('he', { day: 'numeric', month: 'long', year: 'numeric' });
export const dayOf = (iso: string | null | undefined) => (iso ? day.format(new Date(iso)) : '');

/**
 * An item's name in Hebrew, as lib/catalog.ts's nameOf gives it (a plain
 * string, or one per language; markup some imports left in names dropped).
 * The stewards' pages keep their own copy here: importing lib/catalog.ts made
 * it a script of its own on every reading page, and a file of its own made
 * one more on /add, each over the budget of 10 scripts.
 */
export function nameOf(name: unknown, fallback = ''): string {
  return plainName(name) || fallback;
}

function plainName(name: unknown): string {
  if (typeof name === 'string') return name.replace(/<[^>]*>/g, '').trim();
  if (name && typeof name === 'object') {
    const names = name as Record<string, unknown>;
    const found = names.he ?? names.en ?? Object.values(names).find((v) => typeof v === 'string');
    if (typeof found === 'string') return plainName(found);
  }
  return '';
}
