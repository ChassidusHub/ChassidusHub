import { Suspense, type ReactNode } from 'react';
import { Await, Link } from 'react-router';
import { count, dayName, type MirrorsInfo } from '../community/data';
import { Icon, Say, SectionHead, TopBar } from '../ui';
import type { Route } from './+types/mirrors';

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'הורדה ואתרי מראה · ChassidusHub' },
    { name: 'description', content: 'כל הקטלוג פתוח: כל אחד יכול להוריד אותו, לשמור עותק מלא ולהגיש אותו מאתר משלו. מהדורות חתומות, מראת git ואיך מקימים מראה.' },
  ];
}

const API = 'https://api.chassidushub.org';

/**
 * Everything a mirror needs (GET /v1/mirrors): the same for everyone, and
 * changes once a week. The page never waits for it: what the page says
 * itself shows at once, and the lists come after.
 */
export function loader({ context }: Route.LoaderArgs) {
  return { data: context.api.mirrors().catch(() => null) as Promise<MirrorsInfo | null> };
}

/** Opened from inside the site, the page is drawn at once; the lists follow. */
export function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  return { data: serverLoader().then((d) => d.data) };
}

/** One part of the page that needs the lists: `waiting` in its place until they come, as if they had not been read if they fail. */
function When({ data, waiting = null, children }: { data: Promise<MirrorsInfo | null>; waiting?: ReactNode; children: (mirrors: MirrorsInfo | null) => ReactNode }) {
  return (
    <Suspense fallback={waiting}>
      <Await resolve={data} errorElement={children(null)}>
        {children}
      </Await>
    </Suspense>
  );
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=600, s-maxage=3600' };
}

function size(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit++;
  }
  return `${n.toLocaleString('en-US', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
}

/**
 * Download everything, and keep a copy (thread 6, rebuilt from the old site;
 * the plan: it belongs to the community, so it can never be locked away):
 * the git mirror, every catalog edition's files with their sizes and
 * sha256, the keys they are signed with, and how to keep a mirror up to
 * date (docs/mirrors.md). Commands and hashes read left to right.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { data } = loaderData;
  const busy = <p className="faint" aria-busy="true">רגע…</p>;
  return (
    <>
      <TopBar title="הורדה ואתרי מראה" />
      <main id="content" className="view">
        <h1>הורדה ואתרי מראה</h1>
        <p className="lede">כל הקטלוג פתוח: כל אחד יכול להוריד אותו, לשמור עותק מלא ולהגיש אותו מאתר משלו.</p>
        <p className="muted">
          עובדות הקטלוג ב-<bdi>CC0</bdi>, מה שהקהילה כתבה (תיקונים, תרגומים, סנכרון) ב-<bdi>CC BY-SA</bdi>, וכל טקסט ממקור אחר שומר על הרישיון שלו. קבצים (סריקות, הקלטות) אינם בהורדה, רק הגיבובים שלהם.
        </p>
        <When data={data}>{(mirrors) => !mirrors && <Say tone="bad">לא הצלחנו לקרוא את הרשימה כרגע. נסו שוב בעוד רגע.</Say>}</When>

        <SectionHead title="מראת git" />
        <p className="muted">כל הקטלוג כקבצים: קובץ JSON לכל פריט, טקסטים כ-Markdown, סנכרון כ-WebVTT, ו-commit אחד לכל שינוי שאושר.</p>
        <When data={data} waiting={busy}>
          {(mirrors) => (mirrors?.git.length ? <pre className="cmd" dir="ltr" lang="en" tabIndex={0}>{mirrors.git.map((url) => `git clone ${url}`).join('\n')}</pre> : <p className="faint">כתובת המראה תפורסם כאן כשתעלה.</p>)}
        </When>

        <When data={data} waiting={<SectionHead title="מהדורות הקטלוג" />}>
          {(mirrors) => <SectionHead title={`מהדורות הקטלוג${mirrors?.editions.length ? ` (${count(mirrors.editions.length)})` : ''}`} />}
        </When>
        <p className="muted">כל שבוע נחתמת מהדורה: כל הקטלוג כפי שהיה ברגע אחד, כ-SQLite וכ-JSON Lines, עם רשימה חתומה (Ed25519) ו-sha256 לכל קובץ.</p>
        <When data={data} waiting={busy}>
          {(mirrors) =>
            mirrors?.editions.length ? (
              mirrors.editions.map((edition, at) => (
                <section key={edition.tag} className="panel edition" aria-label={edition.tag}>
                  <h3>
                    <bdi dir="ltr" className="code">
                      {edition.tag}
                    </bdi>
                    {at === 0 && <span className="tag">אחרונה</span>}
                    <span className="faint sm">
                      {dayName(edition.created_at)} · שינוי {count(edition.commit_seq)}
                    </span>
                  </h3>
                  {edition.notes && (
                    <p dir="auto" className="muted">
                      {edition.notes}
                    </p>
                  )}
                  {edition.dumps ? (
                    <>
                      <ul className="files" dir="ltr" lang="en">
                        {edition.dumps.files.map((file) => (
                          <li key={file.name}>
                            <a href={file.url} download>
                              <Icon name="download" size="s" />
                              {file.name}
                            </a>
                            <span className="faint sm">{size(file.bytes)}</span>
                            <code className="sha" title={file.sha256}>
                              sha256 {file.sha256}
                            </code>
                          </li>
                        ))}
                      </ul>
                      <p className="faint sm">
                        {edition.dumps.signature ? (
                          <>
                            חתומה במפתח <bdi className="code">{edition.dumps.signature.keyId}</bdi>
                          </>
                        ) : (
                          'לא חתומה'
                        )}
                        {' · '}
                        <a href={edition.dumps.manifest} dir="ltr">
                          manifest.json
                        </a>
                        {' · '}
                        <a href={edition.dumps.sha256sums} dir="ltr">
                          SHA256SUMS
                        </a>
                      </p>
                    </>
                  ) : (
                    <p className="faint">הקבצים בהכנה.</p>
                  )}
                </section>
              ))
            ) : (
              <p className="faint">עוד אין מהדורה עם קבצים להורדה.</p>
            )
          }
        </When>

        <SectionHead title="מפתחות החתימה" />
        <p className="muted">החלק הציבורי של המפתחות שהמהדורות נחתמות בהם. אתר מראה שומר את המפתח אצלו ובודק כל מהדורה מולו.</p>
        <When data={data} waiting={busy}>
          {(mirrors) =>
            mirrors?.keys.length ? (
              <ul className="files" dir="ltr" lang="en">
                {mirrors.keys.map((key) => (
                  <li key={key.keyId}>
                    <b>{`${key.alg} ${key.keyId}`}</b>
                    <code className="sha">{key.publicKey}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="faint">המפתח יפורסם כאן עם המהדורה החתומה הראשונה.</p>
            )
          }
        </When>

        <SectionHead title="איך מקימים מראה" />
        <p className="muted">הפקודה מורידה כל מהדורה, בודקת את החתימה ואת ה-sha256 של כל קובץ, ומשאירה תיקייה שכל שרת אינטרנט יכול להגיש כמו שהיא. מריצים אותה מ-cron כמה שרוצים: מה שכבר ירד לא יורד שוב.</p>
        {/* The command is there at once; the key it pins is filled in when the lists come. */}
        <When data={data} waiting={<Pull pin="<public key>" />}>
          {(mirrors) => <Pull pin={mirrors?.keys[0]?.publicKey ?? '<public key>'} />}
        </When>
        <p className="faint sm">
          ההסבר המלא: <Link to="/developers/dumps">הורדות ואתרי מראה, בתיעוד למפתחים</Link>. הכל גם כ-JSON:{' '}
          <a href={`${API}/v1/mirrors`} dir="ltr">
            {`${API}/v1/mirrors`}
          </a>
        </p>

        <When data={data}>
          {(mirrors) =>
            mirrors?.others.length ? (
              <>
                <SectionHead title="אתרי מראה" />
                <ul className="links">
                  {mirrors.others.map((other) => (
                    <li key={other.url}>
                      <a href={other.url}>
                        <Icon name="globe" />
                        <span>
                          {other.name}{' '}
                          <bdi dir="ltr" className="faint sm">
                            {other.url.replace(/^https?:\/\//, '')}
                          </bdi>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null
          }
        </When>
      </main>
    </>
  );
}

/** How a mirror is kept up to date, with the key it checks every edition against. */
function Pull({ pin }: { pin: string }) {
  return (
    <pre className="cmd" dir="ltr" lang="en" tabIndex={0}>
      {`git clone https://github.com/ChassidusHub/ChassidusHub && cd ChassidusHub && npm ci
npm run chassidushub -- mirror-pull --api ${API} --out /srv/chassidushub --key ${pin}
# or by hand, for one edition:
curl -O ${API}/v1/editions/<tag>/SHA256SUMS && sha256sum -c SHA256SUMS`}
    </pre>
  );
}
