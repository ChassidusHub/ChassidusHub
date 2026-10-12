import { describeDateKey } from '@chassidushub/hebrew';
import { Suspense, useId, useState, type FormEvent } from 'react';
import { Await, Link } from 'react-router';
import { useAccount } from '../lib/account';
import { call, hebrewOf, nameOf } from '../stewards/call';
import { KINDS } from '../stewards/organize';
import { Button, Field, Icon, Say, Segmented, TopBar } from '../ui';
import { Area, Choice } from '../ui/Writing';
import type { Route } from './+types/add';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'הוספת חומר חסר · ChassidusHub' }, { name: 'robots', content: 'noindex' }];
}

type What = 'hanacha' | 'recording' | 'document';
type Rights = 'mine' | 'public-domain' | 'free' | 'unsure';
type DocumentAs = 'sefer' | 'letter' | 'document';

/** What the address says: what is added (`?what=`; a sefer or a letter is a document), and the page it was asked from (`?for=`). */
function fromAddress(request: Request) {
  const url = new URL(request.url);
  const asked = url.searchParams.get('what') ?? '';
  const what: What = asked === 'sefer' || asked === 'letter' || asked === 'document' ? 'document' : asked === 'recording' ? 'recording' : 'hanacha';
  return { what, asked: asked === 'letter' ? ('letter' as const) : ('sefer' as const), target: url.searchParams.get('for') ?? '' };
}

/**
 * What the page starts from, the same for everyone: what the address says,
 * at once, and after it the page it was asked from and the library's top
 * sets, where a new sefer may go. The page never waits for those two.
 */
export function loader({ request, context }: Route.LoaderArgs) {
  const { target, ...frame } = fromAddress(request);
  const data = Promise.all([
    /^rh-[0-9a-z]+$/.test(target) ? context.api.getItem({ id: target }).catch(() => null) : null,
    context.api.catalogTree({ depth: 1, limit: 100 }).catch(() => null),
  ]).then(([place, tree]) => {
    const placeData = place?.data as { name?: unknown; title?: unknown; label?: unknown } | undefined;
    return {
      given: place ? { id: place.id, type: place.type, label: nameOf(placeData?.name ?? placeData?.title ?? placeData?.label, place.id) } : null,
      sets: (tree?.children ?? []).filter((c) => c.type === 'set').map((c) => ({ id: c.id, label: nameOf(c.name, c.id) })),
    };
  });
  return { ...frame, data };
}

/** Opened from inside the site, the page is drawn at once; the place and the sets follow. */
export function clientLoader({ request, serverLoader }: Route.ClientLoaderArgs) {
  const { what, asked } = fromAddress(request);
  return { what, asked, data: serverLoader().then((d) => d.data) };
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=300, s-maxage=600' };
}

interface Candidate {
  id: string;
  type: string;
  path: string | null;
  label: unknown;
  date: string | null;
  why: 'date' | 'name';
}

/** What POST /v1/uploads/propose answers: the machine's guess, from the name (and a date in it). */
interface Proposal {
  date: string | null;
  as: 'sefer' | 'printing' | 'teshura' | 'letter' | 'document' | null;
  candidates: Candidate[];
  usedBy: { id: string; type: string; path: string | null }[];
}

const WHATS: { value: What; label: string; hint: string }[] = [
  { value: 'hanacha', label: 'הנחה של התוועדות או שיחה', hint: 'PDF, או הטקסט עצמו' },
  { value: 'recording', label: 'הקלטה של התוועדות', hint: 'קובץ שמע: MP3, M4A, OGG, WAV, FLAC' },
  { value: 'document', label: 'ספר, מכתב או מסמך אחר', hint: 'PDF של ספר, הדפסה, מכתב או תשורה' },
];
const KINDS_OF_HANACHA = [
  { value: 'bilti-mugah', label: 'בלתי מוגה' },
  { value: 'mugah', label: 'מוגה' },
  { value: 'maamar', label: 'מאמר' },
  { value: 'hagahos', label: 'הגהות' },
  { value: 'hosofos', label: 'הוספות' },
  { value: 'english', label: 'תרגום לאנגלית' },
  { value: 'other', label: 'אחר' },
];
const RIGHTS: { value: Rights; label: string }[] = [
  { value: 'mine', label: 'שלי, ואני נותן אותו לכולם' },
  { value: 'public-domain', label: 'נחלת הכלל' },
  { value: 'free', label: 'יצא לחלוקה חינם' },
  { value: 'unsure', label: 'לא בטוח (נשמר ולא מוצג עד ששומר יחליט)' },
];
const AS: { value: DocumentAs; label: string }[] = [
  { value: 'sefer', label: 'ספר חדש' },
  { value: 'letter', label: 'מכתב' },
  { value: 'document', label: 'מסמך אחר' },
];
const DATE_KEY = /^\d{4}-\w{2,3}-\d{2}$/;

const dateOf = (key: string | null) => {
  if (!key) return '';
  try {
    return describeDateKey(key);
  } catch {
    return key;
  }
};

async function sha256Of(file: File): Promise<string | null> {
  if (!globalThis.crypto?.subtle || file.size > 200 * 1024 * 1024) return null;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const titleOfFile = (name: string) => name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_+/g, ' ');
const sizeOf = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Adding what the catalog does not have yet (thread 6, rebuilt from the old
 * /add), one step at a time: say what it is and give the file (or a
 * hanacha's words); the machine proposes where it belongs, from the date and
 * words in its name, and says it is the machine's proposal; the person
 * confirms it or picks another place (or a farbrengen the catalog lacks),
 * says whose the rights are, sees what will be sent, and sends it. It goes
 * as a Suggestion, for the keepers to approve, like every change.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const account = useAccount();
  const waiting = (
    <p className="faint" aria-busy="true">
      רגע…
    </p>
  );
  return (
    <>
      <TopBar title="הוספת חומר חסר" />
      <main id="content" className="view">
        <h1>הוספת חומר חסר</h1>
        <p className="lede">הנחה, הקלטה, ספר או מכתב שאין עדיין באתר. המכונה מציעה לאן זה שייך, אתם מאשרים, ושומרי האוסף בודקים לפני שזה עולה.</p>
        {account === undefined ? (
          waiting
        ) : account === null ? (
          <>
            <Say>כדי להוסיף צריך להיכנס. כל מה שמוסיפים נשלח לבדיקה בשמכם.</Say>
            <Button to="/signin?return=%2Fadd">כניסה</Button>
          </>
        ) : (
          <Suspense fallback={waiting}>
            <Await resolve={loaderData.data} errorElement={<Say>הדף לא נטען כרגע. נסו שוב בעוד רגע.</Say>}>
              {({ given, sets }) => <Adding first={loaderData.what} asked={loaderData.asked} given={given} sets={sets} />}
            </Await>
          </Suspense>
        )}
      </main>
    </>
  );
}

/** The steps themselves, once the page it was asked from and the sets are known (they are where it may go). */
function Adding({ first, asked, given, sets }: { first: What; asked: DocumentAs; given: { id: string; type: string; label: string } | null; sets: { id: string; label: string }[] }) {
  const [what, setWhat] = useState<What>(first);
  const [asText, setAsText] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [place, setPlace] = useState(given?.id ?? '');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [as, setAs] = useState<DocumentAs>(asked);
  const [set, setSet] = useState('');
  const [year, setYear] = useState('');
  const [kind, setKind] = useState('bilti-mugah');
  const [credit, setCredit] = useState('');
  const [rights, setRights] = useState<Rights>('mine');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [have, setHave] = useState<Proposal['usedBy'] | null>(null);
  const [over, setOver] = useState(false);
  const fileId = useId();

  if (sent !== null)
    return (
      <>
        <Say tone="good">
          נשלח לבדיקה (הצעה #{sent}). ההצעה מחכה לשומרי האוסף, ועד שתאושר היא לא מופיעה באתר.
        </Say>
        <div className="btns">
          <Button look="outline" icon="plus" onClick={() => location.assign('/add')}>
            להוסיף עוד
          </Button>
        </div>
      </>
    );

  const textMode = what === 'hanacha' && asText;
  const accept = what === 'recording' ? 'audio/*' : 'application/pdf';
  const candidates = proposal?.candidates ?? [];
  const needsPlace = what !== 'document';
  const shown = candidates.filter((c) => needsPlace || (as === 'letter' && c.type === 'unit'));
  const hasInput = textMode ? content.trim().length > 0 : file !== null;
  const placeOk = !needsPlace || (place && (place !== 'new' || (eventTitle.trim() && DATE_KEY.test(eventDate))));
  const ready = hasInput && placeOk && (what !== 'document' || name || file);
  const reset = () => (setProposal(null), setHave(null));
  const labelOf = (c: Candidate) => nameOf(c.label, c.id);
  const placeName = place === 'new' ? `התוועדות שאין עדיין באתר${eventTitle ? `: ${eventTitle}` : ''}` : given && place === given.id ? given.label : (candidates.find((c) => c.id === place) ? labelOf(candidates.find((c) => c.id === place)!) : '');

  async function propose(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sha256 = file ? await sha256Of(file) : null;
      const answer = await call<Proposal>('/_/uploads/propose', 'POST', { what, name: name || (file ? titleOfFile(file.name) : ''), ...(sha256 ? { sha256 } : {}) });
      setProposal(answer);
      setHave(answer.usedBy?.length ? answer.usedBy : null);
      if (!given) setPlace(answer.candidates[0]?.id ?? (what === 'document' ? '' : 'new'));
      if (answer.date && !eventDate) setEventDate(answer.date);
      if (!eventTitle) setEventTitle(name || (file ? titleOfFile(file.name) : ''));
      if (answer.as === 'letter' || answer.as === 'document' || answer.as === 'sefer') setAs(answer.as);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const newEvent = place === 'new';
    try {
      let answer: { suggestion?: number; existed?: boolean; usedBy?: Proposal['usedBy'] };
      if (textMode) {
        answer = await call('/_/hanachos/text', 'POST', { ...(newEvent ? { eventTitle, eventDate } : { for: place }), content, rights, ...(credit.trim() ? { credit: credit.trim() } : {}) });
      } else {
        const query: Record<string, string> = { what, rights, title: name || titleOfFile(file!.name) };
        if (what === 'document') {
          query.as = as;
          if (set) query.set = set;
          if (year.trim()) query.year = year.trim();
          if (as === 'letter' && place && place !== 'new') query.unit = place;
          if (proposal?.date) query.date = proposal.date;
        } else if (newEvent) Object.assign(query, { eventTitle, eventDate });
        else query.for = place;
        if (what === 'hanacha') query.kind = kind;
        let response: Response;
        try {
          response = await fetch(`/_/uploads?${new URLSearchParams(query)}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': file!.type || accept, accept: 'application/json' }, body: file });
        } catch {
          throw new Error(hebrewOf('down', 502));
        }
        answer = (await response.json().catch(() => ({}))) as typeof answer & { message?: string };
        if (!response.ok) throw new Error(hebrewOf((answer as { message?: string }).message, response.status));
      }
      if (answer.existed) setHave(answer.usedBy ?? []);
      else setSent(answer.suggestion ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {given && (
        <p className="faint sm">
          מהדף: <bdi>{given.label}</bdi>
        </p>
      )}
      <form onSubmit={proposal ? send : propose}>
        <ol className="addsteps">
          <li>
            <Choice legend="מה מוסיפים?" name="what" value={what} onChange={(v) => (setWhat(v as What), reset())} options={WHATS.map((w) => ({ value: w.value, label: <>{w.label} <span className="hint">· {w.hint}</span></> }))} />
            {what === 'hanacha' && (
              <Segmented
                label="בצורה"
                value={asText ? 'text' : 'file'}
                onChange={(v) => (setAsText(v === 'text'), reset())}
                options={[
                  { value: 'file', label: 'קובץ PDF' },
                  { value: 'text', label: 'טקסט' },
                ]}
              />
            )}
          </li>

          <li>
            <h2>{textMode ? 'הטקסט' : 'הקובץ'}</h2>
            {textMode ? (
              <>
                <Area label="הטקסט (שורה ריקה בין פסקאות)" rows={10} value={content} onChange={(e) => (setContent(e.target.value), reset())} dir="auto" />
                <div className="field">
                  <label htmlFor={`${fileId}-txt`}>או קובץ טקסט</label>
                  <input id={`${fileId}-txt`} type="file" accept="text/plain,.txt,.md" onChange={async (e) => (setContent(await (e.target.files?.[0]?.text() ?? Promise.resolve(content))), reset())} />
                </div>
              </>
            ) : (
              <label
                className={['drop', over && 'over', file && 'has'].filter(Boolean).join(' ')}
                onDragOver={(e) => (e.preventDefault(), setOver(true))}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) (setFile(dropped), reset());
                }}
              >
                <input className="sr-only" type="file" accept={accept} onChange={(e) => (setFile(e.target.files?.[0] ?? null), reset())} />
                <Icon name="upload" size="l" />
                {file ? (
                  <span className="t">
                    <b dir="auto">{file.name}</b>
                    <span>{sizeOf(file.size)} · להחלפה לוחצים כאן</span>
                  </span>
                ) : (
                  <span className="t">
                    <b>בחירת קובץ</b>
                    <span>או גוררים אותו לכאן · {what === 'recording' ? 'MP3, M4A, OGG, WAV, FLAC' : 'PDF'}</span>
                  </span>
                )}
              </label>
            )}
            <Field label="השם, כמו שמופיע (עם התאריך עוזר: י׳ שבט תשמ״ב)" hint="לא חובה" value={name} onChange={(e) => (setName(e.target.value), reset())} maxLength={300} dir="auto" placeholder={file ? titleOfFile(file.name) : ''} />
            {!proposal && (
              <div className="btns">
                <Button type="submit" disabled={busy || (textMode ? !content.trim() : !file && !name)}>
                  {busy ? 'המכונה קוראת את השם…' : 'המשך: לאן זה שייך'}
                </Button>
              </div>
            )}
          </li>

          <li>
            <h2>{what === 'document' ? 'מה זה?' : 'לאן זה שייך?'}</h2>
            {!proposal ? (
              <p className="faint">כשתתנו קובץ או שם, המכונה תקרא אותו ותציע כאן מקום.</p>
            ) : (
              <>
                {have && (
                  <Say>
                    הקובץ הזה כבר אצלנו:{' '}
                    {have.map((u, at) => (
                      <span key={u.id}>
                        {at > 0 && ', '}
                        <Link to={u.path ?? `/${u.id}`}>
                          {KINDS[u.type] ?? u.type} <bdi dir="ltr">{u.id}</bdi>
                        </Link>
                      </span>
                    ))}
                  </Say>
                )}
                <p className="proposal">
                  <span className="machine">הצעת מכונה</span>
                  {proposal.date && <span>תאריך שזוהה: <b>{dateOf(proposal.date)}</b></span>}
                </p>
                {(needsPlace || as === 'letter') && <p className="faint sm">{shown.length ? 'לפי מה שנקרא בשם, נראה שזה שייך לכאן. אפשר לאשר או לבחור מקום אחר.' : 'המכונה לא מצאה מקום מתאים. בחרו התוועדות חדשה, או תנו שם עם תאריך ונסו שוב.'}</p>}
                {what === 'document' && <Choice legend="מה זה?" name="as" value={as} onChange={(v) => setAs(v as DocumentAs)} options={AS.map((a) => ({ value: a.value, label: <>{a.label}{proposal.as === a.value && <span className="hint"> · הצעת המכונה</span>}</> }))} />}
                {(needsPlace || shown.length > 0) && (
                  <Choice
                    legend="המקום"
                    name="place"
                    value={place}
                    onChange={setPlace}
                    options={[
                      ...(given && !candidates.some((c) => c.id === given.id) ? [{ value: given.id, label: <>{given.label} <span className="hint">· {KINDS[given.type] ?? given.type} · הדף שממנו באתם</span></> }] : []),
                      ...shown.map((c, at) => ({
                        value: c.id,
                        label: (
                          <>
                            {labelOf(c)}{' '}
                            <span className="hint">
                              · {[KINDS[c.type] ?? c.type, dateOf(c.date), c.why === 'date' ? 'לפי התאריך' : 'לפי השם', at === 0 ? 'הבחירה של המכונה' : ''].filter(Boolean).join(' · ')}
                            </span>
                          </>
                        ),
                      })),
                      ...(needsPlace ? [{ value: 'new', label: 'התוועדות שאין עדיין באתר' }] : []),
                    ]}
                  />
                )}
                {needsPlace && place === 'new' && (
                  <>
                    <Field label="שם ההתוועדות" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} required maxLength={300} dir="auto" />
                    <Field label="התאריך (למשל 5742-05-10)" hint={DATE_KEY.test(eventDate) ? dateOf(eventDate) : undefined} value={eventDate} onChange={(e) => setEventDate(e.target.value)} required pattern="\d{4}-\w{2,3}-\d{2}" dir="ltr" />
                  </>
                )}
                {what === 'document' && (
                  <>
                    <Choice legend="באיזה סט" name="set" value={set} onChange={setSet} options={[{ value: '', label: 'עוד לא יודע' }, ...sets.map((s) => ({ value: s.id, label: s.label }))]} />
                    <Field label="שנה" hint="לא חובה" value={year} onChange={(e) => setYear(e.target.value)} maxLength={20} dir="auto" placeholder="תשמ״ב" />
                  </>
                )}
                {what === 'hanacha' && !textMode && <Choice legend="סוג ההנחה" name="kind" value={kind} onChange={setKind} options={KINDS_OF_HANACHA} />}
                {textMode && <Field label="למי לתת קרדיט (לא חובה)" value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={300} dir="auto" />}
              </>
            )}
          </li>

          <li>
            <h2>של מי הזכויות?</h2>
            {proposal ? <Choice legend="הזכויות" name="rights" value={rights} onChange={(v) => setRights(v as Rights)} options={RIGHTS} /> : <p className="faint">אחרי שהמקום נבחר.</p>}
          </li>

          {proposal && (
            <li>
              <h2>מה נשלח</h2>
              <dl className="terms">
                <div>
                  <dt>מה</dt>
                  <dd>
                    {WHATS.find((w) => w.value === what)!.label}
                    {what === 'hanacha' && !textMode ? ` · ${KINDS_OF_HANACHA.find((k) => k.value === kind)!.label}` : ''}
                    {what === 'document' ? ` · ${AS.find((a) => a.value === as)!.label}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>{textMode ? 'הטקסט' : 'הקובץ'}</dt>
                  <dd dir="auto">{textMode ? `${content.trim().split(/\s+/).filter(Boolean).length} מילים` : file ? `${name || titleOfFile(file.name)} · ${sizeOf(file.size)}` : '—'}</dd>
                </div>
                {needsPlace && (
                  <div>
                    <dt>לאן</dt>
                    <dd>{placeName || '—'}</dd>
                  </div>
                )}
                <div>
                  <dt>זכויות</dt>
                  <dd>{RIGHTS.find((r) => r.value === rights)!.label}</dd>
                </div>
              </dl>
              <p className="faint sm">נשלח כהצעה. שומרי האוסף רואים אותה ומאשרים; עד אז היא לא מופיעה באתר. מכונות מכינות מהקובץ עותק לקריאה, ומסמנות את מה שעשו כשל מכונה.</p>
              <Button type="submit" icon="upload" disabled={busy || !ready}>
                {busy ? 'שולח…' : 'שליחה לבדיקה'}
              </Button>
            </li>
          )}
        </ol>
        {error && <Say tone="bad">{error}</Say>}
      </form>
    </>
  );
}
