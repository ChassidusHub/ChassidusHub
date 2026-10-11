import { Button, Icon, Panel, Row, Rows, SectionHead, TopBar, type IconName } from '../ui';
import type { Route } from './+types/about';

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'אודות · ChassidusHub' },
    { name: 'description', content: 'ChassidusHub הוא המפתח הפתוח לתורת חב״ד ולהקלטותיה, שנבנה בידי הקהל. איך שינוי נכנס, איך עוזרים, הקוד והרישיונות.' },
  ];
}

/**
 * Only how much machine text waits to be checked, the one number on the
 * page; the page still shows when it does not come.
 */
export async function loader({ context }: Route.LoaderArgs) {
  const toCheck = await context.api.machineToCheck({ limit: 1 }).catch(() => null);
  return { toCheck: toCheck ? toCheck.totals.transcripts + toCheck.totals.texts + toCheck.totals.scans : null };
}

/** The same for everyone, and changes slowly. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=300, s-maxage=600' };
}

const REPO = 'https://github.com/ChassidusHub/ChassidusHub';
const API = 'https://api.chassidushub.org';

/** How a change gets in, in the plan's words: a Report, a Suggestion, Approve, and the history keeps every version. */
const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'flag', title: 'דיווח', text: 'מישהו מוצא טעות ואומר במשפט אחד מה לא נכון. בלי חשבון.' },
  { icon: 'pen', title: 'הצעה', text: 'מישהו מתקן: מילה בטקסט, תאריך, מראה מקום. תיקון קטן בטקסט עולה מיד, אחרי בדיקה אוטומטית; שינוי גדול מחכה לבדיקה.' },
  { icon: 'check', title: 'אישור', text: 'שומרי הספר בודקים מול המקור, ומשאירים או מבטלים.' },
  { icon: 'versions', title: 'היסטוריה', text: 'כל גרסה נשמרת, ואפשר תמיד לחזור לקודמת.' },
];

const LICENCES = [
  { what: 'עובדות הקטלוג', id: 'CC0' },
  { what: 'מה שהקהילה כתבה', id: 'CC BY-SA 4.0' },
  { what: 'הקוד', id: 'AGPL-3.0' },
];

/**
 * About, help and for developers, on one page (thread 6): what
 * ChassidusHub is, how a change gets in, the ways anyone helps (with how
 * much machine text waits for a person), where the code and the API are,
 * asking for a takedown, and the licences. Linked from the account sheet.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { toCheck } = loaderData;
  return (
    <>
      <TopBar title="אודות" />
      <main id="content" className="view">
        <h1>אודות ChassidusHub</h1>
        <p className="lede">המפתח הפתוח לתורת חב״ד ולהקלטותיה, שנבנה בידי הקהל: כל ספר וכל הוצאה שלו, כל סריקה, הטקסט של כל אחד מהם, כל התוועדות וכל הקלטה.</p>
        <p>כל אחד יכול לדווח על טעות או לתקן. כל שינוי נשמר בהיסטוריה, כך ששום דבר לא הולך לאיבוד. הקטלוג כולו פתוח ומיוצא לכל אחד, כדי שלעולם לא יינעל.</p>

        <SectionHead title="איך שינוי נכנס" />
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <span className="bk">
                <Icon name={step.icon} />
              </span>
              <span>
                <b>{step.title}</b>
                <span className="s">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>

        <SectionHead title="איך עוזרים" />
        <Rows>
          <Row
            to="/back"
            start={<Icon name="scan" />}
            title="בדיקת מה שמכונה כתבה"
            sub="תמלולים של הקלטות ודפים שנקראו מסריקה. קוראים או מקשיבים, ומתקנים. כל בדיקה מתקנת את האתר ומלמדת את המכונה הבאה."
            end={toCheck ? toCheck.toLocaleString('he') : undefined}
          />
          <Row start={<Icon name="pen" />} title="תיקון טעות" sub="בכל טקסט באתר: מסמנים את המילים ומתקנים. צריך להיכנס לחשבון." />
          <Row to="/back" start={<Icon name="check" />} title="בדיקת תיקונים שעלו" sub="שומרי הספר משאירים או מבטלים את מה שעלה לאתר בלי לחכות." />
        </Rows>

        <SectionHead title="למפתחים" />
        <ul className="links">
          <li>
            <a href={REPO}>
              <Icon name="text" />
              <span>הקוד ב-GitHub</span>
            </a>
          </li>
          <li>
            <a href={`${REPO}/blob/main/CONTRIBUTING.md`}>
              <Icon name="pen" />
              <span>איך תורמים קוד</span>
            </a>
          </li>
          <li>
            <a href={`${REPO}/blob/main/GOVERNANCE.md`}>
              <Icon name="check" />
              <span>איך מחליטים</span>
            </a>
          </li>
          <li>
            <a href={`${API}/openapi.json`}>
              <Icon name="globe" />
              <span>
                ה-API הפתוח (<bdi>OpenAPI</bdi>)
              </span>
            </a>
          </li>
          <li>
            <a href={`${REPO}/tree/main/docs/developers`}>
              <Icon name="book" />
              <span>מדריכים למפתחים</span>
            </a>
          </li>
        </ul>

        <Panel title="בקשת הסרה">
          <p>בעלי זכויות ומשפחות יכולים לבקש שנפסיק להגיש קובץ. אין צורך בחשבון, ועונים תוך שבועיים.</p>
          <Button small look="outline" icon="flag" to="/takedown">
            בקשת הסרה
          </Button>
        </Panel>

        <SectionHead title="רישיונות" />
        <dl className="terms">
          {LICENCES.map((licence) => (
            <div key={licence.id}>
              <dt>{licence.what}</dt>
              <dd>
                <bdi>{licence.id}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      </main>
    </>
  );
}
