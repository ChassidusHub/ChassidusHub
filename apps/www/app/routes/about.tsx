import { Suspense } from 'react';
import { Await, Link } from 'react-router';
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
 * page. The page never waits for it: it comes after, and the page still
 * shows when it does not come.
 */
export function loader({ context }: Route.LoaderArgs) {
  const toCheck = context.api
    .machineToCheck({ limit: 1 })
    .then((found) => found.totals.transcripts + found.totals.texts + found.totals.scans)
    .catch(() => null);
  return { toCheck };
}

/** Opened from inside the site, the page is drawn at once; the number follows. */
export function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  return { toCheck: serverLoader().then((data) => data.toCheck) };
}

/** The number, when it comes; nothing in its place until then. */
function Count({ of }: { of: Promise<number | null> }) {
  return (
    <Suspense fallback={null}>
      <Await resolve={of} errorElement={null}>
        {(count) => (count ? count.toLocaleString('he') : null)}
      </Await>
    </Suspense>
  );
}

/** The same for everyone, and changes slowly. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=300, s-maxage=600' };
}

const REPO = 'https://github.com/ChassidusHub/ChassidusHub';

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
 * much machine text waits for a person), the pages about the catalog as a
 * whole, where the code, the docs and the API are, asking for a takedown,
 * and the licences. Linked from the account sheet.
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
            end={<Count of={toCheck} />}
          />
          <Row start={<Icon name="pen" />} title="תיקון טעות" sub="בכל טקסט באתר: מסמנים את המילים ומתקנים. צריך להיכנס לחשבון." />
          <Row to="/add" start={<Icon name="upload" />} title="הוספת חומר חסר" sub="הנחה, הקלטה, ספר או מכתב שאין עדיין באתר. המכונה מציעה לאן זה שייך, ושומרי האוסף בודקים." />
          <Row to="/back" start={<Icon name="check" />} title="בדיקת תיקונים שעלו" sub="שומרי הספר משאירים או מבטלים את מה שעלה לאתר בלי לחכות." />
          <Row to="/missing" start={<Icon name="search" />} title="הוספת מה שחסר" sub="התוועדויות בלי הקלטה או הנחה, ספרים בלי סריקה. יש לכם אחד מהם? מוסיפים אותו בדף שלו." />
          <Row to="/projects" start={<Icon name="people" />} title="פרויקטים" sub="עובדים יחד על חוסר אחד, פריט אחרי פריט." />
        </Rows>

        <SectionHead title="הקטלוג כולו" />
        <ul className="links">
          <li>
            <Link to="/health">
              <Icon name="library" />
              <span>מצב הקטלוג: כמה הוא מלא, ואיפה צריך עזרה</span>
            </Link>
          </li>
          <li>
            <Link to="/status">
              <Icon name="check" />
              <span>מצב האתר: האם הכל עובד עכשיו</span>
            </Link>
          </li>
          <li>
            <Link to="/mirrors">
              <Icon name="download" />
              <span>הורדת כל הקטלוג ואתרי מראה</span>
            </Link>
          </li>
          <li>
            <Link to="/models">
              <Icon name="scan" />
              <span>המודלים שקוראים וכותבים, ומדדי הביצוע שלהם</span>
            </Link>
          </li>
        </ul>

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
            <Link to="/developers">
              <Icon name="book" />
              <span>התיעוד למפתחים</span>
            </Link>
          </li>
          <li>
            <Link to="/developers/getting-started">
              <Icon name="next" />
              <span>איך מתחילים לעבוד עם ה-API</span>
            </Link>
          </li>
          <li>
            <Link to="/developers/reference">
              <Icon name="globe" />
              <span>
                מדריך ה-API, כל הנתיבים (<bdi>OpenAPI</bdi>)
              </span>
            </Link>
          </li>
          <li>
            <Link to="/developers/agents">
              <Icon name="link" />
              <span>
                לסוכני AI: <bdi>MCP</bdi> ו-<bdi>llms.txt</bdi>
              </span>
            </Link>
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
