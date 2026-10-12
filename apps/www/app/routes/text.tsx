import { useId, useState } from 'react';
import { data, Link } from 'react-router';
import { useAccount } from '../lib/account';
import { act, said } from '../tools/common';
import { itemName, orNothing } from '../tools/item.server';
import { Button, Field, Icon, IconButton, Say, SectionHead, TopBar } from '../ui';
import type { Route } from './+types/text';
import { KEPT_PAGE } from '../lib/caching';

/** One page of a scan's text (GET /v1/scans/{id}/text). */
interface ScanPage {
  pages: number;
  engine: { name?: string; version?: string } | null;
  level?: number;
  lines: Array<{ id: string; text: string; checked: boolean; level?: number }>;
  layers?: Array<{ id: string; kind: 'machine-ocr' | 'uploaded-ocr' | 'community'; engine: { name: string; version: string } | null; seeds: boolean }>;
}

/** A served scan's page images (GET /v1/scans/{id}/pages). */
interface ScanImages {
  pages: Array<{ page: number; width: number; height: number; image: string }>;
}

const LEVELS = ['עוד לא הוגה', 'הוגה פעם אחת', 'הוגה פעמיים'] as const;
const level = (n: number | undefined) => Math.min(2, Math.max(0, n ?? 0)) as 0 | 1 | 2;

/**
 * A scan's text, page by page (the plan, section 7: "Fix this line"): the
 * page of the scan and the lines read from it side by side, so a line is
 * checked against the page itself. What the machine read is labelled until
 * a person checks it; a signed-in reader fixes a line, and the fix goes for
 * review. The strip of pages shows how far each is proofread, and "This page
 * is right" raises a page a level. Beneath, the text's layers (the
 * machine's, and OCR people uploaded) and a form to upload one's own.
 * A search hit opens here at its line (?line=).
 */
export async function loader({ request, params, context: { api } }: Route.LoaderArgs) {
  if (!/^rh-[\w-]+$/i.test(params.scan)) throw data('not found', { status: 404 });
  const url = new URL(request.url);
  const page = Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1);
  const scan = await orNothing(api.getItem({ id: params.scan }));
  if (!scan || scan.type !== 'scan') throw data('not found', { status: 404 });
  const fields = scan.data as { publication?: string };
  const [text, progress, publication, images] = await Promise.all([
    orNothing(api.scanText({ id: scan.id, page })) as Promise<ScanPage | null>,
    api.scanProgress({ id: scan.id }).catch(() => null),
    fields.publication ? orNothing(api.getItem({ id: fields.publication })) : null,
    api.scanPages({ id: scan.id }).catch(() => null) as Promise<ScanImages | null>,
  ]);
  const image = images?.pages?.find((p) => p.page === page) ?? null;
  return {
    id: scan.id,
    name: publication ? itemName(publication) : 'טקסט של סריקה',
    to: publication ? (publication.path ?? `/${publication.id}`) : null,
    page,
    pages: text?.pages ?? images?.pages?.length ?? progress?.levels.length ?? 0,
    levels: (progress?.levels ?? []).map(level),
    found: url.searchParams.get('line'),
    image: image && { src: image.image, width: image.width, height: image.height },
    text: text && {
      level: level(text.level),
      engine: text.engine?.name ? `${text.engine.name} ${text.engine.version ?? ''}`.trim() : null,
      lines: text.lines.map((l) => ({ id: l.id, text: l.text, level: level(l.level ?? (l.checked ? 1 : 0)) })),
      layers: (text.layers ?? []).filter((l) => l.kind !== 'community').map((l) => ({ id: l.id, kind: l.kind, engine: l.engine ? `${l.engine.name} ${l.engine.version}` : null, seeds: l.seeds })),
    },
  };
}

export const headers = () => ({ 'Cache-Control': KEPT_PAGE });

export const handle = { section: 'library' };

export function meta({ data: text }: Route.MetaArgs) {
  return [{ title: text ? `${text.name} · עמוד ${text.page} · ChassidusHub` : 'ChassidusHub' }];
}

export default function Text({ loaderData: text }: Route.ComponentProps) {
  const account = useAccount();
  const to = (page: number) => `/text/${text.id}?page=${page}`;
  const lines = text.text?.lines ?? [];
  const unchecked = lines.filter((l) => l.level === 0).length;
  return (
    <>
      <TopBar
        title={text.name}
        sub={`עמוד ${text.page}${text.pages ? ` מתוך ${text.pages}` : ''}`}
        end={
          <nav className="it-pager" aria-label="עמודי הסריקה">
            {text.page > 1 ? (
              <Link className="ib" to={to(text.page - 1)} rel="prev" aria-label="העמוד הקודם" title="העמוד הקודם">
                <Icon name="chevron-right" />
              </Link>
            ) : (
              <IconButton icon="chevron-right" label="העמוד הקודם" disabled />
            )}
            {!text.pages || text.page < text.pages ? (
              <Link className="ib" to={to(text.page + 1)} rel="next" aria-label="העמוד הבא" title="העמוד הבא">
                <Icon name="chevron-left" />
              </Link>
            ) : (
              <IconButton icon="chevron-left" label="העמוד הבא" disabled />
            )}
          </nav>
        }
      />
      <main id="content" className="view wide it-text">
        <h1>
          {text.name} · עמוד {text.page}
        </h1>
        <p className="faint sm">
          {text.to && (
            <>
              <Link to={text.to}>לדף של הדפוס</Link> ·{' '}
            </>
          )}
          {text.text ? `${LEVELS[text.text.level]} · ${lines.length} שורות` : 'העמוד הזה עוד לא נקרא'}
          {text.text?.engine ? (
            <>
              {' '}
              · נקרא בידי <bdi dir="ltr">{text.text.engine}</bdi>
            </>
          ) : null}
        </p>
        {unchecked > 0 && (
          <p className="mach">
            <span className="machine">{unchecked === 1 ? 'שורה אחת נקראה במכונה ועוד לא נבדקה בידי אדם' : `${unchecked} שורות נקראו במכונה ועוד לא נבדקו בידי אדם`}</span>
          </p>
        )}

        {text.levels.length > 1 && <Strip id={text.id} page={text.page} levels={text.levels} />}

        {!text.image && <p className="faint sm">לעמוד הזה עוד אין תמונה.</p>}
        <div className={text.image ? 'it-split' : undefined}>
          {text.image && (
            <figure className="it-scan">
              <img src={text.image.src} width={text.image.width} height={text.image.height} alt={`${text.name}, עמוד ${text.page}`} />
            </figure>
          )}
          <section aria-labelledby="lines-h">
            <h2 id="lines-h" className="sr-only">
              שורות העמוד
            </h2>
            {text.text ? (
              <ol className="it-lines">
                {lines.map((line, at) => (
                  <Line key={line.id} n={at + 1} scan={text.id} page={text.page} line={line} canFix={!!account} found={line.id === text.found} />
                ))}
              </ol>
            ) : (
              <p className="faint">את העמוד הזה עוד לא קראו, לא אדם ולא מכונה.</p>
            )}
            {text.text && account && text.text.level < 2 && <Confirm key={text.page} scan={text.id} page={text.page} />}
            {account === null && (
              <p className="faint sm">
                כדי לתקן שורות צריך <Link to={`/signin?return=${encodeURIComponent(to(text.page))}`}>להיכנס</Link>.
              </p>
            )}
          </section>
        </div>

        {text.text && (text.text.layers.length > 1 || (account && text.text.layers.length > 0)) && <Layers scan={text.id} layers={text.text.layers} signedIn={!!account} />}
        {account && <Upload scan={text.id} />}
      </main>
    </>
  );
}

/** The scan's pages as squares, each in the shade of how far it is proofread; the page shown is ringed. */
function Strip({ id, page, levels }: { id: string; page: number; levels: Array<0 | 1 | 2> }) {
  const count = (n: number) => levels.filter((l) => l === n).length;
  return (
    <nav className="it-strip" aria-label="הגהה לפי עמודים">
      <p className="faint sm">
        {LEVELS.map((name, n) => (
          <span key={n} className="it-key">
            <i className={`l${n}`} aria-hidden="true" />
            {name} {count(n)}
          </span>
        ))}
      </p>
      <ol>
        {levels.map((l, at) => (
          <li key={at}>
            <Link to={`/text/${id}?page=${at + 1}`} className={`l${l}`} aria-current={at + 1 === page ? 'page' : undefined} title={`עמוד ${at + 1}: ${LEVELS[l]}`} preventScrollReset>
              {levels.length <= 120 ? at + 1 : <span className="sr-only">{at + 1}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** One line read from the page: its words, how far it was checked, and for a signed-in reader a way to fix it. */
function Line({ n, scan, page, line, canFix, found }: { n: number; scan: string; page: number; line: { id: string; text: string; level: 0 | 1 | 2 }; canFix: boolean; found: boolean }) {
  const id = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (editing !== null)
    return (
      <li className="it-line editing">
        <span className="n">{n}</span>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setState('busy');
            setError(null);
            const answer = await act('line', { scan, page, line: line.id, text: editing });
            if (!answer.ok) {
              setState('idle');
              return setError(said(answer));
            }
            setState('sent');
            setEditing(null);
          }}
        >
          <label htmlFor={id} className="sr-only">
            שורה {n}
          </label>
          <input id={id} className="it-input torah-face" value={editing} onChange={(e) => setEditing(e.target.value)} dir="rtl" autoFocus />
          <div className="btns">
            <Button type="submit" small disabled={state === 'busy' || !editing.trim() || editing.trim() === line.text}>
              שליחה לבדיקה
            </Button>
            <Button look="ghost" small onClick={() => setEditing(null)}>
              ביטול
            </Button>
          </div>
          {error && <Say tone="bad">{error}</Say>}
        </form>
      </li>
    );
  return (
    <li id={`line-${line.id}`} className={`it-line l${line.level}${found ? ' found' : ''}`} aria-current={found ? 'true' : undefined}>
      <span className="n">{n}</span>
      <span className="torah-face t">{found ? <mark>{line.text}</mark> : line.text}</span>
      <span className="r">
        {state === 'sent' ? (
          <span className="faint sm">נשלח לבדיקה</span>
        ) : line.level === 0 ? (
          <span className="machine">מכונה</span>
        ) : (
          <span className="faint sm">{line.level === 2 ? 'נבדקה פעמיים' : 'נבדקה'}</span>
        )}
        {canFix && state !== 'sent' && <IconButton icon="pen" small label={`לתקן את שורה ${n}`} onClick={() => setEditing(line.text)} />}
      </span>
    </li>
  );
}

/** "This page is right": raises the page a proofreading level, as a Suggestion. */
function Confirm({ scan, page }: { scan: string; page: number }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (state === 'sent') return <Say tone="good">נשלח: העמוד יעלה דרגה כשההצעה תאושר.</Say>;
  return (
    <div className="btns">
      <Button
        look="outline"
        small
        icon="check"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          setError(null);
          const answer = await act('confirm', { scan, page });
          if (answer.ok) setState('sent');
          else {
            setState('idle');
            setError(said(answer));
          }
        }}
      >
        העמוד הזה נכון
      </Button>
      <span className="faint sm">קראתם את כל העמוד מול הסריקה, וכל שורה בו נכונה.</span>
      {error && <Say tone="bad">{error}</Say>}
    </div>
  );
}

/** The text's layers: what the machine read, OCR people uploaded, and which one the page starts from. */
function Layers({ scan, layers, signedIn }: { scan: string; layers: Array<{ id: string; kind: string; engine: string | null; seeds: boolean }>; signedIn: boolean }) {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <SectionHead title="שכבות הטקסט" />
      <ul className="it-list">
        {layers.map((layer) => (
          <li key={layer.id}>
            {layer.kind === 'machine-ocr' ? 'קריאת מכונה' : 'OCR שהועלה'}
            {layer.engine && (
              <span className="faint sm">
                {' '}
                · <bdi dir="ltr">{layer.engine}</bdi>
              </span>
            )}{' '}
            {layer.seeds ? <span className="faint sm">· ממנה העמוד מתחיל</span> : layer.kind === 'machine-ocr' ? <span className="machine">מכונה</span> : null}
            {sent === layer.id && <span className="faint sm"> · נשלח לבדיקה</span>}
            {signedIn && !layer.seeds && sent !== layer.id && (
              <>
                {' '}
                <button
                  type="button"
                  className="chip"
                  onClick={async () => {
                    setError(null);
                    const answer = await act('seed', { scan, layer: layer.id });
                    if (answer.ok) setSent(layer.id);
                    else setError(said(answer));
                  }}
                >
                  להתחיל ממנה
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <Say tone="bad">{error}</Say>}
    </>
  );
}

/** OCR made elsewhere (hOCR, ALTO or plain text, page by page), uploaded as a layer of its own. */
function Upload({ scan }: { scan: string }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [engine, setEngine] = useState('');
  const [version, setVersion] = useState('');
  const [first, setFirst] = useState('1');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="panel it-upload">
      <summary>העלאת OCR משלכם</summary>
      {state === 'sent' ? (
        <Say tone="good">הועלה. השכבה החדשה תופיע ברשימה.</Say>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!file) return;
            setState('busy');
            setError(null);
            const answer = await act('ocr', { scan, content: await file.text(), engine, version, firstPage: Number(first) || 1 });
            if (answer.ok) setState('sent');
            else {
              setState('idle');
              setError(said(answer));
            }
          }}
        >
          <p className="faint sm">hOCR, ALTO או טקסט, עמוד אחר עמוד. מה שתעלו הוא שכבה נוספת: הוא לא מחליף את מה שכבר נבדק.</p>
          <div className="field">
            <label htmlFor={id}>הקובץ</label>
            <input id={id} type="file" accept=".hocr,.html,.htm,.xml,.txt,text/html,text/xml,application/xml,text/plain" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Field label="התוכנה שקראה" value={engine} onChange={(e) => setEngine(e.target.value)} required maxLength={80} dir="ltr" />
          <Field label="הגרסה שלה" value={version} onChange={(e) => setVersion(e.target.value)} required maxLength={40} dir="ltr" />
          <Field label="העמוד הראשון בקובץ" value={first} onChange={(e) => setFirst(e.target.value)} inputMode="numeric" dir="ltr" />
          {error && <Say tone="bad">{error}</Say>}
          <Button type="submit" small disabled={state === 'busy' || !file || !engine.trim() || !version.trim()}>
            {state === 'busy' ? 'שולח…' : 'העלאה'}
          </Button>
        </form>
      )}
    </details>
  );
}
