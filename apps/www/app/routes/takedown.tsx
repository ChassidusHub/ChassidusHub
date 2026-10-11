import { Form, useActionData, useNavigation } from 'react-router';
import { Area, Button, Choice, Field, Say, TopBar } from '../ui';
import type { Route } from './+types/takedown';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'בקשת הסרה · ChassidusHub' }];
}

/** What an item's page fills in (`?what=`), so the person does not have to copy its address. */
export function loader({ request }: Route.LoaderArgs) {
  return { what: new URL(request.url).searchParams.get('what')?.slice(0, 1000) ?? '' };
}

const RELATIONS = [
  { value: 'rights-holder', label: 'בעלי הזכויות' },
  { value: 'family', label: 'המשפחה' },
  { value: 'representative', label: 'פועלים בשם בעלי הזכויות' },
  { value: 'other', label: 'אחר' },
];

type Sent = { sent: true; id: number } | { sent: false; said: string };

/** The API's refusals (core's takedown.ts, the hourly limit), as the site says them. */
const REFUSED: [RegExp, string][] = [
  [/your name/, 'כתבו את השם שלכם, עד 200 תווים.'],
  [/email address/, 'כתבו כתובת מייל שאפשר לענות אליה.'],
  [/relation is one of/, 'בחרו מי אתם.'],
  [/what should be taken down/, 'כתבו מה להסיר: כתובת הדף או הקובץ.'],
  [/in a few words why/, 'כתבו בכמה מילים למה (10 עד 4000 תווים).'],
  [/too many requests/, 'נשלחו יותר מדי בקשות מכאן בשעה האחרונה. נסו שוב מאוחר יותר.'],
];

/**
 * The request goes on to the API's /v1/takedowns as it is, with the
 * address the person asked from, which the API keeps only as a hash for
 * its hourly limit. A plain form post: it works without JavaScript.
 */
export async function action({ request, context }: Route.ActionArgs): Promise<Sent> {
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? '').trim();
  const body = JSON.stringify({ target: field('target'), name: field('name'), email: field('email'), relation: field('relation'), statement: field('statement') });
  const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json' });
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers.set('cf-connecting-ip', ip);
  if (!context.forward) return { sent: false, said: 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.' };
  try {
    const response = await context.forward('/v1/takedowns', new Request(request.url, { method: 'POST', headers, body }));
    const answer = (await response.json().catch(() => ({}))) as { id?: number; message?: string };
    if (response.ok && typeof answer.id === 'number') return { sent: true, id: answer.id };
    if (response.status >= 500) return { sent: false, said: 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.' };
    return { sent: false, said: REFUSED.find(([pattern]) => answer.message && pattern.test(answer.message))?.[1] ?? 'הבקשה לא נשלחה. בדקו את מה שכתבתם ונסו שוב.' };
  } catch (error) {
    console.error('takedown', error);
    return { sent: false, said: 'אין חיבור לאתר כרגע. נסו שוב בעוד רגע.' };
  }
}

/**
 * Asking for a takedown (thread 6; the plan, sections 8 and 11): a rights
 * holder or a family asks for a file to stop being served, with no
 * account. Stewards answer within two weeks; a file taken down stops being
 * served at once, and nothing is deleted (docs/rights.md).
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const sent = useActionData<typeof action>();
  const busy = useNavigation().state === 'submitting';
  return (
    <>
      <TopBar title="בקשת הסרה" />
      <main id="content" className="view">
        <div className="auth">
          <h1>בקשת הסרה</h1>
          <p className="lede">בעלי זכויות ומשפחות יכולים לבקש שנפסיק להגיש קובץ. אין צורך בחשבון.</p>
          <Say>שומרי האתר עונים תוך שבועיים. עד אז שום דבר לא נמחק. קובץ שמוסר מפסיק להיות מוגש מיד, ועותק פרטי שלו נשמר.</Say>
          {sent?.sent ? (
            <Say tone="good">
              הבקשה התקבלה, ואישור נשלח אליכם במייל. מספר הבקשה: <b>{sent.id}</b>
            </Say>
          ) : (
            <Form method="post">
              {sent && !sent.sent && <Say tone="bad">{sent.said}</Say>}
              <Field label="מה להסיר: כתובת הדף באתר, או של הקובץ" name="target" defaultValue={loaderData.what} required maxLength={1000} dir="ltr" placeholder="https://chassidushub.org/…" />
              <Field label="השם שלכם" name="name" required maxLength={200} autoComplete="name" dir="auto" />
              <Field label="כתובת מייל לתשובה" name="email" type="email" required maxLength={254} autoComplete="email" dir="ltr" />
              <Choice legend="אתם" name="relation" options={RELATIONS} required />
              <Area label="למה, בכמה מילים" name="statement" rows={5} required minLength={10} maxLength={4000} dir="auto" />
              <Button type="submit" className="block" disabled={busy}>
                {busy ? 'רגע…' : 'שליחת הבקשה'}
              </Button>
            </Form>
          )}
        </div>
      </main>
    </>
  );
}
