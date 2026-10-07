import { Link, redirect } from 'react-router';
import type { LocalName } from '@chassidushub/model';
import type { Route } from './+types/sets';
import type { Cover, Entity } from '../lib/api.js';
import { siteOf } from '../lib/context.server.js';
import { langFrom, nameOf, t, type Lang } from '../lib/i18n.js';
import { num } from '../lib/i18nUi.js';
import { href, itemPath, setPath } from '../lib/links.js';
import { pageMeta } from '../lib/seo.js';
import { additionOf, byOrder, everyAddition, everyWork, shelvesOf, type Shelf } from '../lib/shelves.js';
import { REBBEIM } from '../lib/rebbeim.js';
import { Icon } from '../ui/Icon.js';
import { isEditing } from '../lib/editMode.js';
import { PageBar } from '../ui/page/PageBar.js';
import { Shaar } from '../ui/Shaar.js';
import '../styles/pages/library.css';

/**
 * The library, as design/system draws it (boards 15 to 17 and 21): four
 * levels, one tap each. On a phone the first level is a list: a box to
 * find a sefer, the Rebbeim, the farbrengens and the day's learning, and
 * the other shelves with how much each holds; a shelf with nothing on it
 * is never shown. A shelf (the second level) shows its sets as sections,
 * each a row of title pages that scrolls sideways, and opens the sefer's
 * own page (the third level, its volumes and contents). On a wide screen
 * the shelves are a column down the side and the Rebbe's shelf is open.
 * Which shelf is in the address (`/sets?shelf=the-rebbe`), so the page
 * works without script and is the same for everyone. The shelves hold the
 * official sefarim only; an addition sits with its sefer (lib/shelves.ts).
 */

const slugOfShelf = (set: { path?: string | null }) => (set.path ?? '').replace(/^\/sets\//, '');

const W = {
  rebbeim: { he: 'רבותינו נשיאינו', en: 'The Rebbeim' },
  more: { he: 'מדפים נוספים', en: 'More shelves' },
  parts: { he: 'חלקים', en: 'volumes' },
  continue: { he: 'לספר', en: 'Open the sefer' },
  others: { he: 'מהדורות ואוספים נוספים', en: 'Other editions and collections' },
  loose: { he: 'הוספות', en: 'Additions' },
  missing: { he: 'חסר כאן ספר?', en: 'A sefer missing here?' },
  addSefer: { he: 'הוספת ספר', en: 'Add a sefer' },
  organize: { he: 'סידור הספרייה', en: 'Organize the library' },
  empty: { he: 'אין עדיין ספרים במדף הזה.', en: 'No sefarim on this shelf yet.' },
  farbrengens: { he: 'לוח ההתוועדויות', en: 'The farbrengens calendar' },
  library: { he: 'ספרייה', en: 'Library' },
  find: { he: 'חיפוש ספר, שיחה, מכתב', en: 'Find a sefer, a sicha, a letter' },
  findGo: { he: 'חיפוש', en: 'Search' },
  farbrengensRow: { he: 'התוועדויות', en: 'Farbrengens' },
  farbrengensHint: { he: 'לפי שנה ויום', en: 'By year and day' },
  dailyRow: { he: 'חת״ת ורמב״ם', en: 'Chitas and Rambam' },
  dailyHint: { he: 'השיעורים של היום', en: "Today's shiurim" },
  sefarim: { he: 'ספרים', en: 'sefarim' },
  andMore: { he: 'ועוד {n} בדף הספר', en: 'and {n} more on its page' },
} as const;
const w = (lang: Lang, key: keyof typeof W) => W[key][lang];

/** How a sefer is divided, as its row says it: by volume, year, month, day. */
const BY: Record<string, { he: string; en: string }> = {
  volume: { he: 'לפי חלקים', en: 'By volume' },
  part: { he: 'לפי חלקים', en: 'By part' },
  year: { he: 'לפי שנה', en: 'By year' },
  month: { he: 'לפי חודש', en: 'By month' },
  day: { he: 'לפי יום', en: 'By day' },
  chapter: { he: 'לפי פרקים', en: 'By chapter' },
  parsha: { he: 'לפי פרשה', en: 'By parsha' },
};

/** What an addition is, in a word under its name. */
const KINDS: Record<string, { he: string; en: string }> = {
  commentary: { he: 'ביאור', en: 'Commentary' },
  index: { he: 'מפתח', en: 'Index' },
  about: { he: 'על הספר', en: 'About it' },
  collection: { he: 'אוסף', en: 'Collection' },
  translation: { he: 'תרגום', en: 'Translation' },
};

const titleOf = (e: Entity, lang: Lang) => nameOf((e.data as { title?: LocalName; name?: LocalName }).title ?? (e.data as { name?: LocalName }).name, lang);

/** A card on the shelf: a sefer, or a set of sefarim under one name (Likkutei Sichos and the books gathered with it). */
interface Card {
  id: string;
  title: string;
  /** The sefer the card opens and whose volumes it shows. */
  main: { id: string; path: string; hint: string | null };
  /** The other sefarim kept with it on its set. */
  with: Array<{ id: string; path: string; title: string; sub: string | null }>;
}

const hintOf = (work: Entity, lang: Lang) => {
  const level = (work.data as { levels?: string[] }).levels?.[0];
  return level && BY[level] ? BY[level][lang] : null;
};

function cardsOf(shelf: Shelf<Entity>, lang: Lang): Card[] {
  const name = (x: Entity) => titleOf(x, lang);
  const items = byOrder([...shelf.sets.map((s) => s.set), ...shelf.works], name);
  return items.flatMap((x): Card[] => {
    const inner = shelf.sets.find((s) => s.set.id === x.id);
    if (!inner) return [{ id: x.id, title: name(x), main: { id: x.id, path: itemPath(x), hint: hintOf(x, lang) }, with: [] }];
    const setName = nameOf((x.data as { name?: LocalName }).name, lang);
    const inSet = [...everyWork(inner), ...everyAddition(inner)];
    // The sefer the set is named for opens it (the shortest address among those of its name: /likkutei-sichos), else the first.
    const named = inSet.filter((wk) => !additionOf(wk) && name(wk) === setName).sort((a, b) => itemPath(a).length - itemPath(b).length)[0];
    const main = named ?? inSet[0];
    if (!main) return [];
    const rest = inSet.filter((wk) => wk !== main);
    return [
      {
        id: x.id,
        title: setName,
        main: { id: main.id, path: itemPath(main), hint: hintOf(main, lang) },
        with: rest.map((r) => ({ id: r.id, path: itemPath(r), title: name(r), sub: KINDS[additionOf(r)?.kind ?? '']?.[lang] ?? null })),
      },
    ];
  });
}

/** Every sefer the shelves list, page after page (the API gives five hundred at a time). */
async function shelfWorks(api: ReturnType<typeof siteOf>['api']): Promise<Entity[]> {
  const out: Entity[] = [];
  let after: string | undefined;
  for (let page = 0; page < 4; page++) {
    const { items, next } = await api.list({ type: 'work', limit: 500, shelf: true, after });
    out.push(...items);
    if (!next) break;
    after = next;
  }
  return out;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { api, siteUrl } = siteOf(context);
  const lang = langFrom(request);
  const params = new URL(request.url).searchParams;
  // The library's Edit is Organize (docs/plans/redesign.md): `/sets?edit` opens it on the shelf asked for.
  if (isEditing(`?${params}`)) {
    const asking = params.get('shelf');
    const set = asking ? (await api.list({ type: 'set', limit: 500 })).items.find((x) => slugOfShelf(x) === asking) : undefined;
    throw redirect(href('/organize', lang, set ? { root: set.id } : {}));
  }
  const [sets, works] = await Promise.all([api.list({ type: 'set', limit: 500 }), shelfWorks(api)]);
  const name = (x: Entity) => titleOf(x, lang);
  const isFarbrengens = (set: Entity) => set.path === '/sets/farbrengens';
  const all = shelvesOf(sets.items, works, name, isFarbrengens);
  // The Rebbeim's shelves first, the Rebbe's first of all; then the others as the catalog orders them.
  const rank = (sh: Shelf<Entity>) => {
    const i = REBBEIM.findIndex((r) => r.slug === slugOfShelf(sh.set));
    return i < 0 ? REBBEIM.length : i;
  };
  const shelves = [...all].sort((a, b) => rank(a) - rank(b));
  const asked = params.get('shelf');
  const shelf = shelves.find((sh) => slugOfShelf(sh.set) === asked) ?? shelves[0] ?? null;
  const cards = shelf && !isFarbrengens(shelf.set) ? cardsOf(shelf, lang) : [];
  // Each sefer's title page, where the jobs have drawn one from a PDF the site serves: one read for the whole shelf.
  const covers = cards.length ? await api.covers(cards.flatMap((c) => [c.main.id, ...c.with.map((x) => x.id)])).catch(() => ({}) as Record<string, Cover>) : ({} as Record<string, Cover>);
  const loose = shelf ? everyAddition(shelf).filter((x) => !cards.some((c) => c.with.some((o) => o.id === x.id))) : [];
  return {
    lang,
    siteUrl,
    asked: Boolean(asked),
    shelves: shelves.map((sh) => ({ id: sh.set.id, slug: slugOfShelf(sh.set), path: setPath(sh.set), name: nameOf((sh.set.data as { name?: LocalName }).name, lang), rebbe: rank(sh) < REBBEIM.length, total: sh.total, farbrengens: isFarbrengens(sh.set) })),
    shelf: shelf ? { id: shelf.set.id, slug: slugOfShelf(shelf.set), path: setPath(shelf.set), name: nameOf((shelf.set.data as { name?: LocalName }).name, lang), total: shelf.total, farbrengens: isFarbrengens(shelf.set) } : null,
    cards,
    covers: Object.fromEntries(Object.entries(covers).map(([id, c]) => [id, c.thumb.url])) as Record<string, string>,
    loose: loose.map((x) => ({ id: x.id, path: itemPath(x), title: titleOf(x, lang) })),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  const { lang, siteUrl, asked, shelf } = loaderData;
  const title = asked && shelf ? `${shelf.name} · ${t(lang, 'tabLibrary')}` : t(lang, 'tabLibrary');
  return pageMeta({ title, path: asked && shelf ? `/sets?shelf=${shelf.slug}` : '/sets', lang, siteUrl });
}

/** On a shelf, a set shows its first few sefarim as title pages; the rest are on the sefer's page. */
const ROW = 8;

/**
 * The first level on a phone: find a sefer, the Rebbeim, the farbrengens
 * and the day's learning, then the other shelves with how much each holds.
 * On a wide screen the side column does this, so it is not drawn there.
 */
function LibraryIndex({ lang, rebbeim, others }: { lang: Lang; rebbeim: Array<{ id: string; slug: string; name: string }>; others: Array<{ id: string; slug: string; name: string; total: number; farbrengens: boolean }> }) {
  const shelfTo = (slug: string) => href('/sets', lang, { shelf: slug });
  const farbrengens = others.find((s) => s.farbrengens);
  return (
    <div className="lb-index">
      <PageBar lang={lang} mode={{ editTo: href('/organize', lang) }} />
      <h1 className="lb-title">{w(lang, 'library')}</h1>
      <form className="lb-find" action="/search" method="get" role="search">
        <Icon name="search" />
        <input name="q" type="search" placeholder={w(lang, 'find')} aria-label={w(lang, 'find')} enterKeyHint="search" />
        {lang === 'he' ? <input type="hidden" name="lang" value="he" /> : null}
      </form>
      <h2 className="lb-index-h">{w(lang, 'rebbeim')}</h2>
      <ul className="lb-index-list">
        {rebbeim.map((s) => {
          const r = REBBEIM.find((x) => x.slug === s.slug);
          return (
            <li key={s.id}>
              <Link to={shelfTo(s.slug)}>
                <b>{r?.[lang] ?? s.name}</b>
                {r?.full ? <span>{r.full[lang]}</span> : null}
                <Icon name="chev" size={16} className="subtle flip-ltr" />
              </Link>
            </li>
          );
        })}
      </ul>
      <ul className="lb-index-list lb-index-ways">
        <li>
          <Link to={href('/calendar', lang)}>
            <Icon name="audio" size={18} />
            <b>{w(lang, 'farbrengensRow')}</b>
            <span>{[farbrengens?.total ? num(farbrengens.total, lang) : '', w(lang, 'farbrengensHint')].filter(Boolean).join(' · ')}</span>
            <Icon name="chev" size={16} className="subtle flip-ltr" />
          </Link>
        </li>
        <li>
          <Link to={href('/daily', lang)}>
            <Icon name="cal" size={18} />
            <b>{w(lang, 'dailyRow')}</b>
            <span>{w(lang, 'dailyHint')}</span>
            <Icon name="chev" size={16} className="subtle flip-ltr" />
          </Link>
        </li>
      </ul>
      {others.some((s) => !s.farbrengens) ? (
        <>
          <h2 className="lb-index-h">{w(lang, 'more')}</h2>
          <ul className="lb-index-list">
            {others
              .filter((s) => !s.farbrengens)
              .map((s) => (
                <li key={s.id}>
                  <Link to={shelfTo(s.slug)}>
                    <b>{s.name}</b>
                    <span>
                      {num(s.total, lang)} {w(lang, 'sefarim')}
                    </span>
                    <Icon name="chev" size={16} className="subtle flip-ltr" />
                  </Link>
                </li>
              ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default function Library({ loaderData }: Route.ComponentProps) {
  const { lang, asked, shelves, shelf, cards, covers, loose } = loaderData;
  const rebbe = shelf ? REBBEIM.find((r) => r.slug === shelf.slug) : undefined;
  const shelfTo = (slug: string) => href('/sets', lang, { shelf: slug });
  const shortName = (s: { slug: string; name: string }) => REBBEIM.find((r) => r.slug === s.slug)?.[lang] ?? s.name;
  const rebbeim = shelves.filter((s) => s.rebbe);
  const others = shelves.filter((s) => !s.rebbe);
  return (
    <div className={asked ? 'wrap lb lb-asked' : 'wrap lb lb-top'}>
      <LibraryIndex lang={lang} rebbeim={rebbeim} others={others} />
      <nav className="lb-shelves" aria-label={t(lang, 'shelves')}>
        <h2 className="lb-side-h">{w(lang, 'rebbeim')}</h2>
        <ul>
          {rebbeim.map((s) => (
            <li key={s.id}>
              <Link to={shelfTo(s.slug)} aria-current={s.id === shelf?.id ? 'page' : undefined} preventScrollReset>
                {shortName(s)}
              </Link>
            </li>
          ))}
        </ul>
        {others.length ? (
          <>
            <h2 className="lb-side-h">{w(lang, 'more')}</h2>
            <ul>
              {others.map((s) => (
                <li key={s.id}>
                  <Link to={s.farbrengens ? href('/calendar', lang) : shelfTo(s.slug)} aria-current={s.id === shelf?.id ? 'page' : undefined} preventScrollReset>
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      <div className="lb-main">
        {shelf ? (
          <header className="lb-head">
            <PageBar lang={lang} crumbs={[{ label: w(lang, 'library'), to: href('/sets', lang) }]} mode={{ editTo: href('/organize', lang, { root: shelf.id }) }} />
            <h1>
              <Link to={href(shelf.path, lang)}>{shelf.name}</Link>
            </h1>
            {rebbe?.full ? <p>{rebbe.full[lang]}</p> : null}
          </header>
        ) : null}

        {shelf?.farbrengens ? (
          <p>
            <Link className="btn" to={href('/calendar', lang)}>
              <Icon name="cal" />
              {w(lang, 'farbrengens')}
            </Link>
          </p>
        ) : cards.length ? (
          <div className="lb-sets">
            {cards.map((card) => {
              const books = [{ id: card.main.id, path: card.main.path, title: card.title, sub: card.main.hint }, ...card.with];
              return (
                <section key={card.id} className="lb-set" aria-labelledby={`c-${card.id}`}>
                  <header className="lb-set-h">
                    <h2 id={`c-${card.id}`}>
                      <Link to={href(card.main.path, lang)}>{card.title}</Link>
                    </h2>
                    {card.main.hint ? <span>{card.main.hint}</span> : null}
                  </header>
                  <ul className="shaar-row lb-covers">
                    {books.slice(0, ROW).map((b) => (
                      <li key={b.id}>
                        <Shaar
                          title={b.title}
                          image={covers[b.id] ?? null}
                          to={href(b.path, lang)}
                          caption={
                            <>
                              <b className="torah">{b.title}</b>
                              {b.sub ? <span>{b.sub}</span> : null}
                            </>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  {books.length > ROW ? (
                    <Link className="lb-set-more" to={href(card.main.path, lang)}>
                      {w(lang, 'andMore').replace('{n}', num(books.length - ROW, lang))}
                    </Link>
                  ) : null}
                </section>
              );
            })}
            {loose.length ? (
              <details className="lb-card lb-loose">
                <summary>
                  <b>{w(lang, 'loose')}</b>
                  <span>{num(loose.length, lang)}</span>
                </summary>
                <ul>
                  {loose.map((x) => (
                    <li key={x.id}>
                      <Link to={href(x.path, lang)}>{x.title}</Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="muted">{w(lang, 'empty')}</p>
        )}

        <footer className="lb-foot">
          <span>{w(lang, 'missing')}</span>
          <Link to={href('/add', lang, { what: 'sefer' })}>{w(lang, 'addSefer')}</Link>
          <span aria-hidden="true">·</span>
          <Link to={href('/organize', lang)}>{w(lang, 'organize')}</Link>
        </footer>
      </div>
    </div>
  );
}
