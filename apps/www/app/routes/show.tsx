import { allSegments, inlineText, isPageText } from '@chassidushub/model';
import { describeDateKey } from '@chassidushub/hebrew';
import { Suspense, useState } from 'react';
import { Await, data, Link } from 'react-router';
import { nameOf } from '../stewards/call';
import { PlayRow } from '../listen/play';
import { PRIVATE, type Showcase } from '../stewards/showcase';
import { Button, Icon, Row, Rows, Say, SectionHead, TopBar } from '../ui';
import type { Route } from './+types/show';

type Item = { id: string; type: string; path: string | null; withheld?: boolean; data: Record<string, unknown> };

const dateOf = (key: unknown) => {
  if (typeof key !== 'string') return '';
  try {
    return describeDateKey(key);
  } catch {
    return key;
  }
};

/** The catalog in numbers: what the API counts, in the site's words. */
const COUNTED: [string, string][] = [
  ['work', 'ספרים'],
  ['unit', 'שיחות, מאמרים ומכתבים'],
  ['event', 'התוועדויות'],
  ['recording', 'הקלטות'],
  ['scan', 'סריקות'],
];

/**
 * A showcase's page, as its guest sees it: what the owner picked, read from
 * where showcases are kept (the token is the key; anything else is not
 * found). The farbrengens play on their own pages with their words; their
 * transcripts can be read here, through the showcase's own address; the
 * sichos open on their pages, their scans through the showcase's address.
 * Never kept, never indexed, never framed (lib/showcase.ts).
 *
 * The token is checked before the page answers, so a wrong one is a 404;
 * the page's frame (its title and the owner's note) comes with that answer,
 * and what it shows is read after, never waited for.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const showcase = await context.showcases?.get(params.token).catch(() => null);
  if (!showcase) throw data('not found', { status: 404, headers: PRIVATE });
  return { token: showcase.token, head: { title: showcase.title, note: showcase.note }, data: contentOf(context.api, showcase) };
}

/**
 * Opened from inside the site (Back from a farbrengen's page), nothing is
 * waited for: the frame follows the server's answer, and a wrong token says
 * so where the page's content would be.
 */
export function clientLoader({ params, serverLoader }: Route.ClientLoaderArgs) {
  const server = serverLoader();
  return { token: params.token, head: server.then((d) => d.head), data: server.then((d) => d.data) };
}

/** What the showcase shows, read from the catalog: its farbrengens and their parts, its sichos, the pages read, the numbers. */
async function contentOf(api: Route.LoaderArgs['context']['api'], showcase: Showcase) {
  const { token } = showcase;
  const ids = [...showcase.farbrengens, ...showcase.sichos];
  const [items, linked, stats] = await Promise.all([
    ids.length ? api.getItems({ ids: ids.join(',') }).then((r) => new Map((r.items as unknown as Item[]).map((i) => [i.id, i]))) : new Map<string, Item>(),
    showcase.farbrengens.length ? api.linkedOfEach({ ids: showcase.farbrengens.join(','), field: 'event', type: 'recording', limit: 80 }).then((r) => r.linked as unknown as Record<string, Item[]>).catch(() => ({}) as Record<string, Item[]>) : ({} as Record<string, Item[]>),
    showcase.extras.numbers ? api.stats().catch(() => null) : null,
  ]);
  const farbrengens = showcase.farbrengens.flatMap((id) => {
    const event = items.get(id);
    if (!event) return [];
    const d = event.data as { date?: string; title?: unknown };
    const parts = (linked[id] ?? []).filter((r) => showcase.mediaOf[r.id] !== undefined);
    const words = parts.filter((r) => showcase.transcripts.includes(r.id)).map((r) => ({ id: r.id, title: nameOf((r.data as { title?: unknown }).title, '') }));
    const original = showcase.originals?.[id];
    const title = nameOf(d.title, '');
    return [
      {
        id,
        row: { id, to: d.date ? `/listen/${d.date.slice(0, 4)}/${id}` : `/${id}`, title: dateOf(d.date) || title || id, sub: [title, parts.length > 1 ? `${parts.length} חלקים` : '', words.length ? 'עם המילים' : ''].filter(Boolean).join(' · ') },
        words,
        original: original !== undefined ? `/show/${token}/m/${original}` : null,
      },
    ];
  });
  const sichos = showcase.sichos.flatMap((id) => {
    const unit = items.get(id);
    if (!unit) return [];
    const d = unit.data as { name?: unknown; title?: unknown; label?: unknown; machineOrigin?: { checked?: boolean } };
    const scan = showcase.mediaOf[id];
    return [{ id, title: nameOf(d.name ?? d.title ?? d.label, id), to: unit.path ?? `/${id}`, scan: scan !== undefined ? `/show/${token}/m/${scan}` : null, machine: !!d.machineOrigin && !d.machineOrigin.checked }];
  });
  // Pages the old site's reader read: their words as plain paragraphs, machine-read; their scans through the showcase.
  const readings = (showcase.readings ?? []).map((r, at) => {
    const version = isPageText(r.body) ? r.body.versions[0] : undefined;
    const paragraphs = [...allSegments(version?.segments)].map((s) => inlineText(s.text).trim()).filter(Boolean).slice(0, 60);
    return { key: at, title: r.title, scan: r.media !== null ? `/show/${token}/m/${r.media}` : null, paragraphs };
  });
  const counts = stats?.counts ? COUNTED.flatMap(([type, label]) => (stats.counts[type] ? [{ label, count: stats.counts[type]! }] : [])) : [];
  return { farbrengens, sichos, readings, counts };
}

export function headers() {
  return PRIVATE;
}

export function meta({ data: page }: Route.MetaArgs) {
  // The title is known when the server answered the address; opened from inside the site it comes after.
  const head = page && !(page.head instanceof Promise) ? page.head : null;
  return [{ title: `${head?.title ?? 'ChassidusHub'} · ChassidusHub` }, { name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }];
}

/**
 * A showcase, for the people the owner meets (thread 6, rebuilt from the old
 * /show): what ChassidusHub is, then the farbrengens he picked, to hear with
 * their words, the sichos with their scans, and the catalog in numbers. What
 * a machine heard or read and nobody checked is said to be so.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { token, head, data: page } = loaderData;
  const waiting = (
    <p className="faint" aria-busy="true">
      רגע…
    </p>
  );
  return (
    <>
      <Suspense fallback={<TopBar title="ChassidusHub" />}>
        <Await resolve={head} errorElement={<TopBar title="ChassidusHub" />}>
          {({ title }) => <TopBar title={title} />}
        </Await>
      </Suspense>
      <main id="content" className="view">
        <Suspense fallback={waiting}>
          <Await resolve={head} errorElement={<Say>הדף הזה לא נמצא.</Say>}>
            {({ title, note }) => (
              <>
                <h1>{title}</h1>
                {note && <p className="lede">{note}</p>}
              </>
            )}
          </Await>
        </Suspense>
        <p>ChassidusHub הוא המפתח הפתוח לתורת חב״ד ולהקלטותיה, שנבנה בידי הקהל: כל ספר וכל הוצאה שלו, כל סריקה והטקסט שלה, כל התוועדות וכל הקלטה. מכונות קוראות את הסריקות ושומעות את ההקלטות, ואנשים בודקים ומתקנים.</p>

        <Suspense fallback={waiting}>
          <Await resolve={page} errorElement={<p className="faint">מה שבדף לא נטען כרגע. נסו שוב בעוד רגע.</p>}>
            {({ farbrengens, sichos, readings, counts }) => (
              <>
                {farbrengens.length > 0 && (
                  <>
                    <SectionHead title="התוועדויות" />
                    <p className="faint sm">לוחצים לנגן, והמילים מוארות בזמן השמיעה בדף ההתוועדות.</p>
                    {farbrengens.map((f) => (
                      <Farbrengen key={f.id} token={token} farbrengen={f} />
                    ))}
                  </>
                )}

                {sichos.length > 0 && (
                  <>
                    <SectionHead title="שיחות והסריקה שלהן" />
                    <Rows>
                      {sichos.map((s) => (
                        <Row
                          key={s.id}
                          start={<Icon name="book" />}
                          title={s.title}
                          sub={s.machine ? 'הטקסט נקרא בידי מכונה' : undefined}
                          to={s.to}
                          end={s.machine ? <span className="machine">מכונה</span> : undefined}
                        />
                      ))}
                    </Rows>
                    {sichos.some((s) => s.scan) && (
                      <p className="faint sm">
                        הסריקות:{' '}
                        {sichos
                          .filter((s) => s.scan)
                          .map((s, at) => (
                            <span key={s.id}>
                              {at > 0 && ' · '}
                              <a href={s.scan!} target="_blank" rel="noreferrer">
                                {s.title}
                              </a>
                            </span>
                          ))}
                      </p>
                    )}
                  </>
                )}

                {readings.map((r) => (
                  <section key={r.key} aria-label={r.title}>
                    <SectionHead title={r.title} />
                    <p className="faint sm">
                      <span className="machine">מכונה</span> נקרא מהסריקה בידי הקורא שלנו, ועוד לא נבדק.
                      {r.scan && (
                        <>
                          {' '}
                          <a href={r.scan} target="_blank" rel="noreferrer">
                            הסריקה
                          </a>
                        </>
                      )}
                    </p>
                    <div className="torah showwords">
                      {r.paragraphs.map((p, at) => (
                        <p key={at}>{p}</p>
                      ))}
                    </div>
                  </section>
                ))}

                {counts.length > 0 && (
                  <>
                    <SectionHead title="האוסף במספרים" />
                    <dl className="terms">
                      {counts.map((c) => (
                        <div key={c.label}>
                          <dt>{c.label}</dt>
                          <dd>{c.count.toLocaleString('he')}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </>
            )}
          </Await>
        </Suspense>
        <p className="faint sm">
          <Link to="/about">אודות ChassidusHub</Link>
        </p>
      </main>
    </>
  );
}

type Shown = Awaited<ReturnType<typeof contentOf>>['farbrengens'][number];
type Words = { id: string; paragraphs: { id: string; content: string; checked?: boolean }[] };

/** One farbrengen: play it, and read its words here (through the showcase's address) when it has them. */
function Farbrengen({ token, farbrengen }: { token: string; farbrengen: Shown }) {
  const [words, setWords] = useState<Words[] | 'loading' | 'failed' | null>(null);
  const open = async () => {
    if (words) return setWords(null);
    setWords('loading');
    const all = await Promise.all(
      farbrengen.words.map((w) =>
        fetch(`/show/${token}/t/${w.id}`, { headers: { accept: 'application/json' } })
          .then((r) => (r.ok ? (r.json() as Promise<Omit<Words, 'id'>>) : null))
          .then((t) => (t ? { id: w.id, paragraphs: t.paragraphs ?? [] } : null))
          .catch(() => null),
      ),
    );
    const found = all.filter((t): t is Words => !!t && t.paragraphs.length > 0);
    setWords(found.length ? found : 'failed');
  };
  const shown = Array.isArray(words) ? words : [];
  const unchecked = shown.some((t) => t.paragraphs.some((p) => !p.checked));
  return (
    <div className="showcard">
      <PlayRow row={farbrengen.row} />
      {(farbrengen.words.length > 0 || farbrengen.original) && (
        <div className="btns">
          {farbrengen.words.length > 0 && (
            <Button small look="outline" icon="words" onClick={open} aria-expanded={Array.isArray(words)}>
              {Array.isArray(words) ? 'הסתרת המילים' : 'המילים'}
            </Button>
          )}
          {farbrengen.original && (
            <Button small look="ghost" icon="scan" onClick={() => window.open(farbrengen.original!, '_blank', 'noreferrer')}>
              המקור הכתוב
            </Button>
          )}
        </div>
      )}
      {words === 'loading' && <p className="faint sm">המילים נטענות…</p>}
      {words === 'failed' && <Say>המילים לא נטענו.</Say>}
      {shown.length > 0 && (
        <div className="showwords">
          {unchecked && (
            <p>
              <span className="machine">מכונה</span> <span className="faint sm">את המילים כתבה מכונה, ואנשים בודקים אותן.</span>
            </p>
          )}
          {shown.map((t) => (
            <div key={t.id}>
              {t.paragraphs.slice(0, 40).map((p) => (
                <p key={p.id}>{p.content}</p>
              ))}
              {t.paragraphs.length > 40 && (
                <p className="faint sm">
                  ועוד {t.paragraphs.length - 40} פסקאות, <Link to={farbrengen.row.to}>בדף ההתוועדות</Link>.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
