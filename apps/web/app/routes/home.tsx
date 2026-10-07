import { dateKeyToHDate } from '@chassidushub/hebrew';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/home';
import { shiurRows, useLearned } from '../components/DailyShiurim.js';
import { PlayEventButton } from '../components/EventRow.js';
import type { DailyLearning, Entity } from '../lib/api.js';
import { siteOf } from '../lib/context.server.js';
import { dateLabel, yearLabel } from '../lib/dates.js';
import { feedCard, type FeedCard } from '../lib/homeFeed.js';
import { langFrom, nameOf, t, type Lang } from '../lib/i18n.js';
import { num, tu } from '../lib/i18nUi.js';
import { href } from '../lib/links.js';
import { accountPlaces, localPlaces, mergePlaces, type Place } from '../lib/places.js';
import { REBBEIM } from '../lib/rebbeim.js';
import { pageMeta } from '../lib/seo.js';
import { useAccount } from '../lib/useAccount.js';
import { kviusYears, sameDayIn, thisWeek } from '../lib/week.js';
import { Icon } from '../ui/Icon.js';
import '../styles/pages/home.css';

/**
 * The home page, shaped like a chat app's opening screen (design/system,
 * boards 29 to 32): the day, a big question, one box to search, and
 * buttons under it (listen with the words, continue, the day's learning,
 * the library). On a phone the box is docked at the foot, under the
 * thumb; on a wider screen it sits under the question. Then two things
 * to press play on or read, each told by what it is about, in its own
 * table of contents' words: this week in the year whose calendar falls
 * like this one (the same days and the same parshiyos, lib/week.ts
 * `kviusYears`), and farbrengens of these days, in any year, that have a
 * recording with its transcript. Then the day's learning with a tick for
 * each shiur, and the Rebbeim and best-known sefarim. What waits to be
 * checked is a helper's question, not a listener's, so it is not here: it
 * is on the transcript itself and the Help page. Four reads of the API
 * make the page, the same for everyone and kept at the edge; where you
 * stopped and the ticks are yours, drawn in the browser.
 */

/** Today as New York has it (`YYYY-MM-DD`), as the daily page does: pages are the same for everyone. */
const todayInNewYork = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function loader({ request, context }: Route.LoaderArgs) {
  const { api, siteUrl } = siteOf(context);
  const lang = langFrom(request);
  const week = thisWeek(lang);
  const year = Number(week.today.slice(0, 4));
  // The latest year of farbrengens whose calendar falls like this one: its week, day by day.
  const kviusYear = kviusYears(year).find((y) => y !== year) ?? null;
  const kviusDates = kviusYear ? week.days.map((d) => sameDayIn(d, kviusYear)) : [];
  const [day, kviusEvents, nearEvents, transcribed] = await Promise.all([
    api.daily(todayInNewYork()).catch(() => null),
    kviusDates.length ? api.events({ dates: kviusDates, limit: 40 }).catch(() => []) : Promise.resolve([]),
    api.events({ day: week.dayTokens, limit: 300 }).catch(() => []),
    api.transcribed(1000).catch(() => []),
  ]);
  const withWords = new Set(transcribed.map((r) => r.event).filter((x): x is string => Boolean(x)));
  const byDate = (a: Entity, b: Entity) => String((a.data as { date?: string }).date).localeCompare(String((b.data as { date?: string }).date));
  // These days in any year, those with a recording and its transcript first; the kvius year's own are above already.
  const heard = nearEvents.filter((e) => (e.recordings ?? 0) > 0 && !kviusEvents.some((k) => k.id === e.id));
  const listen = [...heard.filter((e) => withWords.has(e.id)), ...heard.filter((e) => !withWords.has(e.id))].slice(0, 5);
  return {
    lang,
    siteUrl,
    week,
    weekday: dateKeyToHDate(week.today)?.getDay() ?? 0,
    day,
    kviusYear,
    kvius: [...kviusEvents].sort(byDate).map((e) => feedCard(e, withWords)),
    listen: listen.map((e) => feedCard(e, withWords)),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  const { lang, siteUrl } = loaderData;
  const base = siteUrl.replace(/\/$/, '');
  return pageMeta({
    title: '',
    description: t(lang, 'tagline'),
    path: '/',
    lang,
    siteUrl,
    // The site and who keeps it: search engines show the name and logo beside results, and search from the result itself.
    jsonLd: [
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        name: 'ChassidusHub',
        url: `${base}/`,
        inLanguage: ['he', 'en'],
        publisher: { '@id': `${base}/#organization` },
        potentialAction: { '@type': 'SearchAction', target: `${base}/search?q={q}`, 'query-input': 'required name=q' },
      },
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: 'ChassidusHub',
        url: `${base}/`,
        logo: { '@type': 'ImageObject', url: `${base}/icon-512.png`, width: 512, height: 512 },
        sameAs: ['https://github.com/ChassidusHub/ChassidusHub'],
      },
    ],
  });
}

const WEEKDAYS: Record<Lang, string[]> = {
  he: ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת קודש'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'],
};

const W = {
  ask: { he: 'מה תרצו ללמוד היום?', en: 'What would you like to learn today?' },
  box: { he: 'שאלה או חיפוש', en: 'Ask or search' },
  searchGo: { he: 'חיפוש', en: 'Search' },
  listenWords: { he: 'להאזין, והמילים לפניכם', en: 'Listen, with the words before you' },
  continueTo: { he: 'להמשיך', en: 'Continue' },
  daily: { he: 'לימוד יומי', en: 'Daily learning' },
  library: { he: 'ספרייה', en: 'Library' },
  parsha: { he: 'פרשת', en: 'Parshas' },
  kviusTitle: { he: 'השבוע, באותה קביעות: {year}', en: 'This week, in the same kvius: {year}' },
  kviusText: { he: '{year} חלה כמו השנה: אותם ימים ואותן פרשיות', en: '{year} fell like this year: the same days and the same parshiyos' },
  readSichos: { he: 'לקרוא את השיחות', en: 'Read the sichos' },
  listenTitle: { he: 'להאזין, והמילים לפניכם', en: 'Listen, with the words before you' },
  listenText: { he: 'מהימים האלה, עם הקלטה ותמלול', en: 'From these days, with a recording and its transcript' },
  listenTextPlain: { he: 'מהימים האלה, בהקלטה', en: 'From these days, recorded' },
  withText: { he: 'להאזין עם הטקסט', en: 'Listen with the text' },
  hear: { he: 'להאזין', en: 'Listen' },
  maamar: { he: 'מאמר', en: 'Maamar' },
  parts: { he: 'חלקים', en: 'parts' },
  credit: { he: 'תוכן הענינים: mafteiach.app', en: 'Contents: mafteiach.app' },
  dailyPage: { he: 'לדף המלא', en: 'The full page' },
  all: { he: 'הכול', en: 'All' },
  hayomYom: { he: 'היום יום', en: 'Hayom Yom' },
  rambam: { he: 'רמב״ם', en: 'Rambam' },
  learned: { he: 'למדתי', en: 'Learned' },
  of: { he: 'מתוך', en: 'of' },
  browse: { he: 'לפי רבי', en: 'Browse by Rebbe' },
  allShelves: { he: 'כל הספרייה', en: 'The whole library' },
  popular: { he: 'ספרים מבוקשים', en: 'Well-known sefarim' },
} as const;
const w = (lang: Lang, key: keyof typeof W) => W[key][lang];

/** The day's learning: each shiur with a tick, kept in this browser and shared with the daily page. */
function DailyCard({ day, lang }: { day: DailyLearning; lang: Lang }) {
  const rows = shiurRows(day, lang, { rambam: ['three'] }).map((r) => (r.key === 'three' ? { ...r, name: w(lang, 'rambam') } : r));
  const hayomYom = day.hayomYom[0];
  if (hayomYom) rows.push({ key: 'hayom-yom', name: w(lang, 'hayomYom'), pieces: [{ text: dateLabel(day.hebrew, 'he', { civil: false }).replace(/\s\S+$/, ''), to: `${href('/daily', lang)}#daily-hayom-yom`, external: false }] });
  const { ticked, toggle } = useLearned(day.date, rows);
  if (!rows.length) return null;
  const count = rows.filter((r) => ticked.has(r.key)).length;
  return (
    <section className="hm-daily" aria-labelledby="hm-daily">
      <header className="hm-h-row">
        <h2 className="hm-h" id="hm-daily">
          {w(lang, 'daily')}
          <span className="hm-count">
            {' '}
            · {num(count, lang)} {w(lang, 'of')} {num(rows.length, lang)}
          </span>
        </h2>
        <Link to={href('/daily', lang)}>
          <span className="hm-wide">{w(lang, 'dailyPage')}</span>
          <span className="hm-narrow">{w(lang, 'all')}</span>
        </Link>
      </header>
      <ul className="hm-shiurim">
        {rows.map((row) => {
          const first = row.pieces[0];
          const done = ticked.has(row.key);
          return (
            <li key={row.key} className={done ? 'done' : undefined}>
              <button type="button" className="hm-tick" aria-pressed={done} aria-label={`${w(lang, 'learned')}: ${row.name}`} onClick={() => toggle(row.key)}>
                {done ? <Icon name="check" size={14} /> : null}
              </button>
              <span className="hm-shiur-name">{row.name}</span>
              <span className="hm-shiur-what torah" lang="he" dir="rtl">
                {first?.to ? (
                  first.external ? (
                    <a href={first.to} target="_blank" rel="noopener">
                      {row.pieces.map((p) => p.text).join(' · ')}
                    </a>
                  ) : (
                    <a href={first.to}>{row.pieces.map((p) => p.text).join(' · ')}</a>
                  )
                ) : (
                  row.pieces.map((p) => p.text).join(' · ')
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The best-known sefarim, by their lasting addresses (an address that changes keeps redirecting). */
const POPULAR: Array<{ to: string; he: string; en: string }> = [
  { to: '/likkutei-sichos', he: 'לקוטי שיחות', en: 'Likkutei Sichos' },
  { to: '/tanya', he: 'תניא', en: 'Tanya' },
  { to: '/hayom-yom', he: 'היום יום', en: 'Hayom Yom' },
  { to: '/toras-menachem', he: 'תורת מנחם', en: 'Toras Menachem' },
  { to: '/igros-kodesh-rebbe', he: 'אגרות קודש', en: 'Igros Kodesh' },
  { to: '/sefer-hamaamarim-melukat', he: 'ספר המאמרים מלוקט', en: 'Sefer HaMaamarim Melukat' },
  { to: '/likkutei-torah', he: 'לקוטי תורה', en: 'Likkutei Torah' },
  { to: '/shulchan-aruch-harav', he: 'שולחן ערוך הרב', en: 'Shulchan Aruch HaRav' },
];

/**
 * The last thing you were reading or hearing, from this browser and, when
 * signed in, your account, as a button under the question. Nothing is
 * drawn until there is one.
 */
function ContinueButton({ lang }: { lang: Lang }) {
  const account = useAccount();
  const [place, setPlace] = useState<Place | null>(null);
  useEffect(() => {
    let live = true;
    setPlace(localPlaces()[0] ?? null);
    if (account) void accountPlaces({ limit: 5 }).then((remote) => live && setPlace(mergePlaces(localPlaces(), remote)[0] ?? null));
    return () => {
      live = false;
    };
  }, [account]);
  if (!place) return null;
  return (
    <Link className="hm-btn" to={place.href}>
      <Icon name={place.kind === 'listen' ? 'audio' : 'book'} size={16} />
      <span>
        {w(lang, 'continueTo')} <b>{place.title}</b>
      </span>
    </Link>
  );
}

/** The question, the one box and the buttons under it. Without script the box is a plain form to the search page. */
function Ask({ lang, dayLine, hasListen }: { lang: Lang; dayLine: string; hasListen: boolean }) {
  return (
    <section className="hm-ask">
      <p className="hm-dayline">{dayLine}</p>
      <h1>{w(lang, 'ask')}</h1>
      <form className="hm-box" action="/search" method="get" role="search" aria-label={tu(lang, 'searchShort')}>
        <Icon name="search" />
        <input name="q" type="search" placeholder={w(lang, 'box')} aria-label={w(lang, 'box')} enterKeyHint="search" />
        {lang === 'he' ? <input type="hidden" name="lang" value="he" /> : null}
        <button type="submit" className="hm-box-go" aria-label={w(lang, 'searchGo')}>
          <Icon name={lang === 'he' ? 'chev' : 'chevr'} size={18} />
        </button>
      </form>
      <nav className="hm-btns" aria-label={tu(lang, 'mainNav')}>
        {hasListen ? (
          <a className="hm-btn hm-btn-strong" href="#hm-listen">
            <Icon name="audio" size={16} />
            {w(lang, 'listenWords')}
          </a>
        ) : null}
        <ContinueButton lang={lang} />
        <Link className="hm-btn" to={href('/daily', lang)}>
          <Icon name="cal" size={16} />
          {w(lang, 'daily')}
        </Link>
        <Link className="hm-btn" to={href('/sets', lang)}>
          <Icon name="book" size={16} />
          {w(lang, 'library')}
        </Link>
      </nav>
    </section>
  );
}

const WHEN: Record<Lang, string[]> = {
  he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'השבת'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'],
};

/** A farbrengen of this week in the kvius year: when, its name, what it is about, and its maamar. */
function KviusCard({ card, lang }: { card: FeedCard; lang: Lang }) {
  const day = card.date ? dateKeyToHDate(card.date)?.getDay() : undefined;
  const when = [day !== undefined ? WHEN[lang][day] : '', card.date ? dateLabel(card.date, lang, { civil: false }).replace(/\s\S+$/u, '') : ''].filter(Boolean).join(' · ');
  return (
    <li className="hm-kv">
      <span className="hm-kicker">{when}</span>
      <Link className="hm-kv-title" to={href(card.path, lang)}>
        {nameOf(card.title, lang)} {card.date ? yearLabel(Number(card.date.slice(0, 4)), lang) : ''}
      </Link>
      {card.topics.length ? (
        <ul className="hm-topics torah" lang="he" dir="rtl">
          {card.topics.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      {card.maamar ? (
        <p className="hm-maamar" lang="he" dir="rtl">
          {w(lang, 'maamar')}: {card.maamar}
        </p>
      ) : null}
      <Link className="hm-kv-go" to={href(card.path, lang)}>
        {w(lang, 'readSichos')}
        <Icon name={lang === 'he' ? 'chev' : 'chevr'} size={14} />
      </Link>
    </li>
  );
}

/** A farbrengen of these days to hear: the first one large, in ink; the rest as quiet rows. */
function ListenCard({ card, lang, first }: { card: FeedCard; lang: Lang; first: boolean }) {
  const event = { id: card.id, type: 'event', path: card.path, rev: 0, data: { title: card.title, date: card.date }, recordings: card.recordings } as unknown as Entity & { recordings: number };
  return (
    <li className={first ? 'hm-ls hm-ls-first' : 'hm-ls'}>
      <PlayEventButton event={event} size={first ? 'large' : undefined} />
      <div className="hm-ls-main">
        <Link className="hm-ls-title" to={href(card.path, lang)}>
          {nameOf(card.title, lang)}
        </Link>
        <span className="hm-ls-when">{[card.date ? dateLabel(card.date, lang, { civil: false }) : '', card.recordings > 1 ? `${num(card.recordings, lang)} ${w(lang, 'parts')}` : ''].filter(Boolean).join(' · ')}</span>
        {card.topics[0] ? (
          <p className="hm-ls-topic torah" lang="he" dir="rtl">
            {card.topics[0]}
          </p>
        ) : null}
        {card.transcript ? (
          <Link className="hm-ls-go" to={href(card.path, lang)}>
            {w(lang, 'withText')}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/** The Rebbeim, each to his shelf in the library, and the best-known sefarim. */
function Browse({ lang }: { lang: Lang }) {
  return (
    <div className="hm-browse">
      <section aria-labelledby="hm-rebbeim">
        <header className="hm-h-row">
          <h2 className="hm-h" id="hm-rebbeim">
            {w(lang, 'browse')}
          </h2>
          <Link to={href('/sets', lang)}>{w(lang, 'allShelves')}</Link>
        </header>
        <ul className="hm-rebbeim">
          {REBBEIM.map((r) => (
            <li key={r.slug}>
              <Link to={href('/sets', lang, { shelf: r.slug })}>
                <b>{r[lang]}</b>
                {r.full ? <span>{r.full[lang]}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="hm-popular">
        <h2 className="hm-h" id="hm-popular">
          {w(lang, 'popular')}
        </h2>
        <ul className="hm-popular">
          {POPULAR.map((p) => (
            <li key={p.to}>
              <Link to={href(p.to, lang)}>{p[lang]}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { lang, week, weekday, day, kviusYear, kvius, listen } = loaderData;
  const named = week.holidays[0] ?? (week.parsha ? `${w(lang, 'parsha')} ${week.parsha}` : WEEKDAYS[lang][weekday]!);
  const kvYear = kviusYear ? yearLabel(kviusYear, lang) : '';
  const words = listen.some((c) => c.transcript);
  return (
    <div className="hm-page">
      <div className="wrap">
        <Ask lang={lang} dayLine={`${week.todayLabel} · ${named}`} hasListen={listen.length > 0} />
      </div>
      <div className="wrap hm-feed">
        {kvius.length ? (
          <section className="hm-section" aria-labelledby="hm-kvius">
            <h2 className="hm-h" id="hm-kvius">
              {w(lang, 'kviusTitle').replace('{year}', kvYear)}
            </h2>
            <p className="hm-sub">{w(lang, 'kviusText').replace('{year}', kvYear)}</p>
            <ul className="hm-kvs">
              {kvius.map((c) => (
                <KviusCard key={c.id} card={c} lang={lang} />
              ))}
            </ul>
          </section>
        ) : null}
        {listen.length ? (
          <section className="hm-section" id="hm-listen" aria-labelledby="hm-listen-h">
            <h2 className="hm-h" id="hm-listen-h">
              {w(lang, 'listenTitle')}
            </h2>
            <p className="hm-sub">{w(lang, words ? 'listenText' : 'listenTextPlain')}</p>
            <ul className="hm-lss">
              {listen.map((c, i) => (
                <ListenCard key={c.id} card={c} lang={lang} first={i === 0} />
              ))}
            </ul>
          </section>
        ) : null}
        {kvius.some((c) => c.topics.length) || listen.some((c) => c.topics.length) ? <p className="hm-credit">{w(lang, 'credit')}</p> : null}
      </div>
      <div className="wrap hm-day-wrap">{day ? <DailyCard day={day} lang={lang} /> : null}</div>
      <div className="wrap">
        <Browse lang={lang} />
      </div>
    </div>
  );
}
