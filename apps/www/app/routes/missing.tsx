import { describeDateKey } from '@chassidushub/hebrew';
import { Link } from 'react-router';
import { SeeAlso } from '../community/parts';
import { capped, count, dayName, hebrewName, itemName, yearName, type ArchiveGap, type CatalogHealth, type Name } from '../community/data';
import { Button, Icon, Row, Rows, Say, SectionHead, TopBar } from '../ui';
import type { Route } from './+types/missing';

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'מה חסר · ChassidusHub' },
    { name: 'description', content: 'מה שעוד חסר בקטלוג ושכל אחד יכול לעזור בו: התוועדויות בלי הקלטה או הנחה, ספרים בלי סריקה, וקבצים שהארכיון לא הצליח להשיג.' },
  ];
}

const KINDS = ['recordings', 'texts', 'scans', 'files'] as const;
type Kind = (typeof KINDS)[number];
const TAB: Record<Kind, string> = { recordings: 'הקלטות', texts: 'הנחות', scans: 'סריקות', files: 'קבצים' };
const HEAD: Record<Kind, string> = { recordings: 'התוועדויות בלי הקלטה', texts: 'התוועדויות בלי הנחה', scans: 'ספרים בלי סריקה', files: 'קבצים שהארכיון לא השיג' };
const HOW: Record<Kind, string> = {
  recordings: 'יש לכם הקלטה של אחת מהן? בדף שלה אפשר להוסיף אותה.',
  texts: 'יש לכם הנחה של אחת מהן? בדף שלה אפשר להוסיף אותה.',
  scans: 'יש לכם סריקה של אחד מהם? בדף שלו אפשר להוסיף אותה.',
  files: 'הקישור שהארכיון ניסה כבר לא עונה. יש לכם את הקובץ? בדף של הפריט אפשר להוסיף אותו.',
};

/** Rows a page, and how deep the pages go (the API lists up to 500 at a time). */
const PAGE = 50;
const DEEPEST = 500;

type Event = { id: string; path: string | null; type: string; data: Record<string, unknown> };

/**
 * The Missing board is the same for everyone: the list of one kind (of one
 * year, for farbrengens), each kind's count for the tabs, and each year's
 * gaps for the years beside the list (from the health of the catalog).
 * `?kind=`, `?year=` and `?page=` choose; plain links, so it works without
 * script.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const asked = url.searchParams.get('kind') ?? '';
  const kind: Kind = (KINDS as readonly string[]).includes(asked) ? (asked as Kind) : 'recordings';
  const byYear = kind === 'recordings' || kind === 'texts';
  const yearAsked = url.searchParams.get('year') ?? '';
  const year = byYear && /^\d{4}$/.test(yearAsked) ? yearAsked : undefined;
  const page = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), DEEPEST / PAGE);
  const [list, counts, health] = await Promise.all([
    context.api.missing({ kind, within: year, limit: page * PAGE }).catch(() => null),
    Promise.all(KINDS.map((k) => context.api.missing({ kind: k, within: k === 'recordings' || k === 'texts' ? year : undefined, limit: 1 }).then((r) => r.total, () => null))),
    byYear ? (context.api.health({ limit: 1 }).catch(() => null) as Promise<CatalogHealth | null>) : null,
  ]);
  const from = (page - 1) * PAGE;
  const rows = (list?.items ?? []).slice(from);
  return {
    kind,
    year,
    page,
    total: list?.total ?? null,
    events: kind === 'files' ? [] : (rows as Event[]).map((e) => ({ id: e.id, path: e.path, type: e.type, data: { title: e.data.title, label: e.data.label, name: e.data.name, date: e.data.date } })),
    files: kind === 'files' ? (rows as unknown as ArchiveGap[]) : [],
    counts: Object.fromEntries(KINDS.map((k, at) => [k, counts[at] ?? null])) as Record<Kind, number | null>,
    years: (health?.years ?? []).map((y) => ({ year: y.year, missing: y.events - (kind === 'texts' ? y.withText : y.withRecording) })).reverse(),
  };
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=300, s-maxage=600' };
}

const address = (kind: Kind, year?: string, page?: number) => {
  const query = new URLSearchParams();
  if (kind !== 'recordings') query.set('kind', kind);
  if (year && (kind === 'recordings' || kind === 'texts')) query.set('year', year);
  if (page && page > 1) query.set('page', String(page));
  return `/missing${query.size ? `?${query}` : ''}`;
};

/**
 * The Missing board (thread 6, rebuilt from the old site): what the catalog
 * still lacks that anyone could help with. Farbrengens without a recording
 * or a text, by year; sefarim with no scan of any printing; and the files
 * Sichos-Kodesh's archive wanted and could not get. Each row leads to its
 * page, where the thing can be added.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { kind, year, page, total, events, files, counts, years } = loaderData;
  const byYear = kind === 'recordings' || kind === 'texts';
  const pages = Math.max(1, Math.ceil(Math.min(total ?? 0, DEEPEST) / PAGE));
  const shown = events.length + files.length;
  return (
    <>
      <TopBar title="מה חסר" />
      <main id="content" className="view">
        <h1>מה חסר</h1>
        <p className="lede">מה שעוד חסר בקטלוג, וכל אחד יכול לעזור בו.</p>

        <nav className="chips" aria-label="מה חסר">
          {KINDS.map((k) => (
            <Link key={k} to={address(k, year)} className={k === kind ? 'chip on' : 'chip'} aria-current={k === kind ? 'page' : undefined}>
              {TAB[k]}
              {counts[k] !== null && <span className="faint">{capped(counts[k]!)}</span>}
            </Link>
          ))}
        </nav>

        {byYear && years.length > 0 && (
          <details className="fold years" open={!!year}>
            <summary>
              <span>{year ? `שנת ${yearName(Number(year))}` : 'בחירת שנה'}</span>
              <Icon name="chevron-down" size="s" />
            </summary>
            <div className="numgrid">
              {year && (
                <Link to={address(kind)} className="all">
                  כל השנים
                </Link>
              )}
              {years.map((y) => (
                <Link key={y.year} to={address(kind, String(y.year))} className={y.missing ? 'has' : undefined} aria-current={year === String(y.year) ? 'page' : undefined} aria-label={`${yearName(y.year)}: ${count(y.missing)} חסרות`}>
                  <span>{yearName(y.year)}</span>
                  <small>{count(y.missing)}</small>
                </Link>
              ))}
            </div>
          </details>
        )}

        <SectionHead title={`${HEAD[kind]}${byYear && year ? ` בשנת ${yearName(Number(year))}` : ''}${total !== null ? ` (${capped(total)})` : ''}`} />
        <p className="faint sm">{HOW[kind]}</p>
        {total === null ? (
          <Say tone="bad">הרשימה לא נטענה. נסו שוב בעוד רגע.</Say>
        ) : shown === 0 ? (
          <Say tone="good">{kind === 'files' ? 'הארכיון קיבל כל קובץ שחיפש.' : year ? 'בשנה הזאת לא חסר כלום.' : 'לא חסר כאן כלום.'}</Say>
        ) : kind === 'files' ? (
          <Rows>
            {files.map((gap) => (
              <FileRow key={`${gap.collection}/${gap.item_id}/${gap.kind}/${gap.role}/${gap.url}`} gap={gap} />
            ))}
          </Rows>
        ) : (
          <Rows>
            {events.map((item) =>
              kind === 'scans' ? (
                <Row key={item.id} to={item.path ?? `/${item.id}`} start={<Icon name="book" className="faint" />} title={itemName(item)} />
              ) : (
                <Row
                  key={item.id}
                  to={item.path ?? `/${item.id}`}
                  title={typeof item.data.date === 'string' ? describeDateKey(item.data.date) || item.data.date : itemName(item)}
                  sub={hebrewName(item.data.title as Name) || undefined}
                />
              ),
            )}
          </Rows>
        )}

        {pages > 1 && (
          <div className="btns pager">
            {page > 1 && (
              <Button small look="outline" to={address(kind, year, page - 1)}>
                הקודמים
              </Button>
            )}
            <span className="faint sm">
              עמוד {page} מתוך {pages}
            </span>
            {page < pages && (
              <Button small look="outline" to={address(kind, year, page + 1)}>
                הבאים
              </Button>
            )}
          </div>
        )}
        {total !== null && total > DEEPEST && page === pages && <p className="faint sm">{byYear && !year ? 'מוצגים 500 הראשונים; בחרו שנה כדי לראות את כולם.' : 'מוצגים 500 הראשונים.'}</p>}

        <SectionHead title="איך עוזרים" />
        <SeeAlso
          links={[
            { to: '/projects', icon: 'people', label: 'פרויקטים', sub: 'עובדים יחד על שנה שלמה, פריט אחרי פריט' },
            { to: '/health', icon: 'library', label: 'מצב הקטלוג', sub: 'כמה מלא הקטלוג, שנה אחרי שנה' },
          ]}
        />
      </main>
    </>
  );
}

/** One file the archive could not get: its item (or the archive's own name for it), what it is, why, and where it was looked for. */
function FileRow({ gap }: { gap: ArchiveGap }) {
  const date = gap.hebrew_date && /^\d{4}-/.test(gap.hebrew_date) ? describeDateKey(gap.hebrew_date) : null;
  const why = gap.http_status ? `HTTP ${gap.http_status}` : gap.status === 'error' ? 'לא ענה' : 'לא נמצא';
  const sub = [date, gap.kind === 'audio' ? 'הקלטה' : 'הנחה', gap.label && gap.entity ? gap.label : null, gap.entity ? null : 'אין לו עדיין דף בקטלוג', gap.checked_at ? `נבדק ב־${dayName(gap.checked_at)}` : null].filter(Boolean).join(' · ');
  return (
    <div className="row">
      <Icon name={gap.kind === 'audio' ? 'listen' : 'scan'} className="faint" />
      <span className="t">
        {gap.entity ? (
          <Link to={gap.entity.path ?? `/${gap.entity.id}`} className="title-link">
            {itemName(gap.entity, gap.label ?? gap.item_id)}
          </Link>
        ) : (
          <b>{gap.label ?? gap.item_id}</b>
        )}
        <span>
          {sub} · <bdi dir="ltr">{why}</bdi>
        </span>
      </span>
      <a className="r" href={gap.url} rel="noopener nofollow" title={gap.url}>
        איפה חיפשו
      </a>
    </div>
  );
}
