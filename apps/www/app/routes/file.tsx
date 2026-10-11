import { data } from 'react-router';
import { dayOf, KINDS, sizeOf } from '../tools/common';
import { itemName, orNothing } from '../tools/item.server';
import { Row, Rows, SectionHead, TopBar } from '../ui';
import type { Route } from './+types/file';

/** A file as GET /v1/files/{sha256}/about tells of it. */
interface FileAbout {
  sha256: string;
  bytes: number;
  mime: string;
  rights: 'open' | 'credit' | 'link' | 'preserved';
  credit: string | null;
  url: string | null;
  sources: Array<{ source: string; url: string | null; fetchedAt: string | null; uploaded: boolean; at: string }>;
  derivations: Array<{ profile: string; sha256: string; encoder: string }>;
  derivedFrom: Array<{ profile: string; sha256: string }>;
  measured: { pages: number | null; durationMs: number | null } | null;
  pageImages: number;
  covers: Array<{ entity: string; page: number; machine: boolean }>;
  usedBy: { total: number; items: Array<{ id: string; type: string; path: string | null; data: unknown }> };
}

/** What a file's rights let the site do with it. */
const RIGHTS: Record<string, string> = {
  open: 'פתוח: מוצג באתר ומותר להורדה',
  credit: 'מוצג באתר, עם קרדיט',
  link: 'קישור בלבד: שמור אצלנו ולא מוצג',
  preserved: 'שמור לשימור בלבד',
};

/** Where files came from, by the source's key. */
const SOURCES: Record<string, string> = {
  sefaria: 'ספריא',
  hebrewbooks: 'היברו בוקס',
  chabadlibrary: 'ספריית חב״ד',
  mafteiach: 'מפתח',
  other: 'מקור',
  jem: 'JEM',
  'igros-app': 'אגרות קודש',
  kehot: 'קה״ת',
  nli: 'הספרייה הלאומית',
  'chabad-org': 'chabad.org',
  youtube: 'YouTube',
  contribution: 'תרומה',
  upload: 'העלאה',
  otzar: 'אוצר החכמה',
};

const kindOf = (mime: string) =>
  mime === 'application/pdf' ? 'קובץ PDF' : mime.startsWith('audio/') ? 'קובץ שמע' : mime.startsWith('image/') ? 'תמונה' : mime.startsWith('text/') ? 'קובץ טקסט' : 'קובץ';

const short = (sha: string) => sha.slice(0, 12);

/**
 * A file's own page (/files/<sha256>): a file is kept once, by its sha256,
 * whatever uses it. What it is and what its rights let the site do with it
 * (open it here, or only keep it), where it came from, what jobs made from
 * it (a reading copy, page images: a machine's work, labelled so), what was
 * measured in it, and every item that uses it. Who uploaded it is not said.
 */
export async function loader({ params, context: { api } }: Route.LoaderArgs) {
  const sha = params.sha256.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) throw data('not found', { status: 404 });
  const file = (await orNothing(api.fileAbout({ sha256: sha, limit: 200 }))) as FileAbout | null;
  if (!file) throw data('not found', { status: 404 });
  const ids = [...new Set(file.covers.map((c) => c.entity))];
  const covered = ids.length ? (await api.getItems({ ids: ids.join(',') }).catch(() => ({ items: [] }))).items : [];
  const names = Object.fromEntries(covered.map((item) => [item.id, { name: itemName(item), to: item.path ?? `/${item.id}` }]));
  return {
    sha256: file.sha256,
    bytes: file.bytes,
    mime: file.mime,
    rights: file.rights,
    credit: file.credit,
    url: file.url,
    pages: file.measured?.pages ?? null,
    minutes: file.measured?.durationMs ? Math.round(file.measured.durationMs / 60_000) : null,
    pageImages: file.pageImages ?? 0,
    sources: file.sources,
    derivations: file.derivations,
    derivedFrom: file.derivedFrom,
    covers: file.covers.map((c) => ({ ...c, name: names[c.entity]?.name ?? c.entity, to: names[c.entity]?.to ?? `/${c.entity}` })),
    total: file.usedBy.total,
    usedBy: file.usedBy.items.map((item) => ({ id: item.id, kind: KINDS[item.type] ?? item.type, name: itemName(item), to: item.path ?? `/${item.id}` })),
  };
}

export const headers = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=3600' });

export function meta({ data: file }: Route.MetaArgs) {
  return [{ title: file ? `${kindOf(file.mime)} ${short(file.sha256)} · ChassidusHub` : 'ChassidusHub' }];
}

export default function FilePage({ loaderData: file }: Route.ComponentProps) {
  const measured = [file.pages ? `${file.pages} עמודים` : null, file.minutes ? `${file.minutes} דק׳` : null, file.pageImages ? `${file.pageImages} תמונות עמודים` : null].filter(Boolean).join(' · ');
  return (
    <>
      <TopBar title="קובץ" sub={kindOf(file.mime)} />
      <main id="content" className="view it-text">
        <h1>
          {kindOf(file.mime)}{' '}
          <bdi className="it-hash" dir="ltr">
            {short(file.sha256)}
          </bdi>
        </h1>
        <p className="faint sm">
          <bdi dir="ltr">{file.mime}</bdi> · <bdi dir="ltr">{sizeOf(file.bytes)}</bdi>
          {measured ? ` · ${measured}` : ''}
        </p>
        <p className="lede">{RIGHTS[file.rights] ?? file.rights}</p>
        <div className="btns">
          {file.url ? (
            <a className="btn" href={file.url} target="_blank" rel="noopener">
              פתיחת הקובץ
            </a>
          ) : (
            <span className="faint sm">הקובץ שמור אצלנו ולא מוצג באתר.</span>
          )}
        </div>

        <SectionHead title={`משתמשים בו (${file.total})`} />
        {file.usedBy.length ? (
          <Rows>
            {file.usedBy.map((item) => (
              <Row key={item.id} title={item.name} end={item.kind} to={item.to} />
            ))}
          </Rows>
        ) : (
          <p className="faint">אף דף עוד לא משתמש בקובץ הזה.</p>
        )}
        {file.total > file.usedBy.length && <p className="faint sm">{`מוצגים ${file.usedBy.length} מתוך ${file.total}`}</p>}

        {file.covers.length > 0 && (
          <>
            <SectionHead title="השער של" />
            <Rows>
              {file.covers.map((cover) => (
                <Row key={cover.entity} title={cover.name} sub={`עמוד ${cover.page} בקובץ`} end={cover.machine ? <span className="machine">מכונה</span> : 'נבחר בידי אדם'} to={cover.to} />
              ))}
            </Rows>
          </>
        )}

        {(file.derivations.length > 0 || file.derivedFrom.length > 0) && (
          <>
            <SectionHead title="מה נעשה ממנו" />
            <p className="faint sm">
              <span className="machine">מכונה</span> מכונה הכינה את אלה מהקובץ, ואיש עוד לא בדק אותם.
            </p>
            <Rows>
              {file.derivedFrom.map((d) => (
                <Row key={`from-${d.sha256}-${d.profile}`} title={<>נעשה מהקובץ <bdi dir="ltr">{short(d.sha256)}</bdi></>} end={<bdi dir="ltr">{d.profile}</bdi>} to={`/files/${d.sha256}`} />
              ))}
              {file.derivations.map((d) => (
                <Row key={`to-${d.sha256}-${d.profile}`} title={<bdi dir="ltr">{short(d.sha256)}</bdi>} end={<bdi dir="ltr">{`${d.profile} · ${d.encoder}`}</bdi>} to={`/files/${d.sha256}`} />
              ))}
            </Rows>
          </>
        )}

        {file.sources.length > 0 && (
          <>
            <SectionHead title="מאיפה הגיע" />
            <ul className="it-list">
              {file.sources.map((source, at) => (
                <li key={at}>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noopener">
                      {SOURCES[source.source] ?? source.source}
                    </a>
                  ) : (
                    SOURCES[source.source] ?? source.source
                  )}
                  <span className="faint sm"> · {dayOf(source.fetchedAt ?? source.at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <SectionHead title="פרטים" />
        <dl className="it-facts">
          <dt>סוג</dt>
          <dd>
            <bdi dir="ltr">{file.mime}</bdi>
          </dd>
          <dt>גודל</dt>
          <dd>
            <bdi dir="ltr">{sizeOf(file.bytes)}</bdi>
          </dd>
          <dt>זכויות</dt>
          <dd>{RIGHTS[file.rights] ?? file.rights}</dd>
          {file.credit && (
            <>
              <dt>קרדיט</dt>
              <dd>{file.credit}</dd>
            </>
          )}
          <dt>טביעת אצבע (sha256)</dt>
          <dd>
            <code className="it-hash" dir="ltr">
              {file.sha256}
            </code>
          </dd>
        </dl>
        <p className="note">כל קובץ נשמר אצלנו פעם אחת, לפי טביעת האצבע שלו, כמה דפים שלא ישתמשו בו.</p>
      </main>
    </>
  );
}
