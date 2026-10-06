import { dateKeyToHDate } from '@chassidushub/hebrew';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/home';
import { shiurRows, useLearned } from '../components/DailyShiurim.js';
import { PlayEventButton, eventData, eventRow, type EventItem } from '../components/EventRow.js';
import type { DailyLearning, MachineToCheck } from '../lib/api.js';
import { siteOf } from '../lib/context.server.js';
import { dateLabel } from '../lib/dates.js';
import { langFrom, nameOf, t, type Lang } from '../lib/i18n.js';
import { num, tu } from '../lib/i18nUi.js';
import { href, itemPath } from '../lib/links.js';
import { accountPlaces, localPlaces, mergePlaces, placeKey, type Place } from '../lib/places.js';
import { REBBEIM } from '../lib/rebbeim.js';
import { pageMeta } from '../lib/seo.js';
import { useAccount } from '../lib/useAccount.js';
import { thisWeek } from '../lib/week.js';
import { clock, usePlayer, type Track } from '../player/PlayerProvider.js';
import { Icon, type IconName } from '../ui/Icon.js';
import '../styles/pages/home.css';

/**
 * The home page. First what ChassidusHub is, in one line, with a search box
 * and the three ways in (the library, the day's learning, listening), so a
 * first visit knows where to go. Then the page as the redesign draws it
 * (design/, screens 3f and 3n): the
 * day (its date, and the chag or the coming Shabbos's parsha), where you
 * stopped reading or listening, the day's learning with a tick for each
 * shiur, where you can help (what the machines read or heard that nobody
 * checked), and a farbrengen of this day in the Rebbe's years to hear. Where
 * you stopped and the ticks are yours, so they are drawn in the browser;
 * the page itself is the same for everyone and kept at the edge. Three reads
 * of the API make it: the day's learning, this day's farbrengens, and what
 * waits to be checked. The Rebbeim and the best-known sefarim at the foot
 * are fixed links, so they cost no read.
 */

/** Today as New York has it (`YYYY-MM-DD`), as the daily page does: pages are the same for everyone. */
const todayInNewYork = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export async function loader({ request, context }: Route.LoaderArgs) {
  const { api, siteUrl } = siteOf(context);
  const lang = langFrom(request);
  const week = thisWeek(lang);
  const todayTokens = week.dayTokens.filter((tok) => tok.endsWith(week.today.slice(-3)));
  const [day, events, toCheck] = await Promise.all([
    api.daily(todayInNewYork()).catch(() => null),
    api.events({ day: todayTokens, limit: 200, brief: true }).catch(() => []),
    api.toCheck(1).catch(() => null),
  ]);
  // A farbrengen of this day to hear: the latest year's that has a recording.
  const heard = events
    .filter((e) => todayTokens.includes(String(eventData(e).date).slice(5)) && (e.recordings ?? 0) > 0)
    .sort((a, b) => String(eventData(b).date).localeCompare(String(eventData(a).date)));
  return {
    lang,
    siteUrl,
    week,
    weekday: dateKeyToHDate(week.today)?.getDay() ?? 0,
    day,
    listen: heard[0] ? eventRow(heard[0]) : null,
    listenMore: Math.max(0, heard.length - 1),
    help: toCheck ? { totals: toCheck.totals, next: toCheck.transcripts[0] ?? null } : null,
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
  heroTitle: { he: 'הספרייה הפתוחה של תורת חב״ד', en: 'The open library of Chabad Torah' },
  heroText: {
    he: 'ספרי רבותינו נשיאינו, ההתוועדויות של הרבי בהקלטה, והלימוד היומי. חינם לכולם, ונבנה יחד בידי הלומדים.',
    en: 'Read the Rebbeim’s sefarim, hear the Rebbe’s farbrengens, and learn each day’s shiurim. Free for everyone, and built together by the people who learn here.',
  },
  searchGo: { he: 'חיפוש', en: 'Search' },
  try: { he: 'למשל:', en: 'Try:' },
  yudShvat: { he: 'י׳ שבט', en: 'Yud Shvat' },
  libraryText: { he: 'ספרי הרבי ורבותינו נשיאינו, לפי רבי וספר', en: 'The Rebbe’s and the Rebbeim’s sefarim, by Rebbe and sefer' },
  dailyText: { he: 'חומש, תהילים, תניא, רמב״ם והיום יום', en: 'Chumash, Tehillim, Tanya, Rambam and Hayom Yom' },
  listenText: { he: 'התוועדויות הרבי בהקלטה, לפי תאריך', en: 'The Rebbe’s farbrengens, recorded, by date' },
  today: { he: 'היום', en: 'Today' },
  browse: { he: 'לפי רבי', en: 'Browse by Rebbe' },
  allShelves: { he: 'כל הספרייה', en: 'The whole library' },
  popular: { he: 'ספרים מבוקשים', en: 'Well-known sefarim' },
  helpAll: { he: 'כל הדרכים לעזור', en: 'All the ways to help' },
  parsha: { he: 'פרשת', en: 'Parshas' },
  continue: { he: 'להמשיך מאיפה שהפסקתם', en: 'Continue where you stopped' },
  read: { he: 'המשך קריאה', en: 'Continue reading' },
  hear: { he: 'המשך שמיעה', en: 'Continue listening' },
  pause: { he: 'השהיה', en: 'Pause' },
  page: { he: 'עמוד', en: 'Page' },
  of: { he: 'מתוך', en: 'of' },
  daily: { he: 'לימוד יומי', en: 'Daily learning' },
  dailyPage: { he: 'לדף המלא', en: 'The full page' },
  all: { he: 'הכול', en: 'All' },
  hayomYom: { he: 'היום יום', en: 'Hayom Yom' },
  rambam: { he: 'רמב״ם', en: 'Rambam' },
  learned: { he: 'למדתי', en: 'Learned' },
  help: { he: 'אפשר לעזור', en: 'You can help' },
  helpText: { he: 'הכול כאן נבנה בידי הלומדים: כל תיקון נבדק לפני שהוא נכנס.', en: 'Everything here is built by the people who learn here: every fix is checked before it goes in.' },
  pages: { he: 'דפים שטרם נבדקו', en: 'Pages not yet checked' },
  pagesHint: { he: 'להשוות טקסט לדף הסרוק', en: 'Compare the text with the scanned page' },
  recordings: { he: 'הקלטות לתמלול', en: 'Recordings to transcribe' },
  recordingsHint: { he: 'להקשיב ולתקן שורות', en: 'Listen and fix lines' },
  listen: { he: 'להאזנה', en: 'To listen' },
  recording: { he: 'הקלטת הרבי', en: 'The Rebbe’s recording' },
  parts: { he: 'חלקים', en: 'parts' },
  part: { he: 'חלק', en: 'part' },
  moreToday: { he: 'עוד {n} מהיום הזה בשנים אחרות', en: '{n} more from this day in other years' },
} as const;
const w = (lang: Lang, key: keyof typeof W) => W[key][lang];

/** How far into a place you are, 0 to 1, and where: `עמוד 14 מתוך 60`, `חלק 2 · 12:40`. */
function progressOf(place: Place, lang: Lang): { done: number; where: string } {
  const p = place.place;
  if (place.kind === 'read') {
    const page = Number(p.page) || 1;
    const pages = Number(p.pages) || 0;
    return { done: pages ? page / pages : 0, where: `${w(lang, 'page')} ${page}${pages ? ` ${w(lang, 'of')} ${pages}` : ''}` };
  }
  const queue = (p.queue as Track[] | undefined) ?? [];
  const index = Number(p.index) || 0;
  const time = Number(p.time) || 0;
  const duration = Number(p.duration) || 0;
  const done = queue.length ? (index + (duration ? time / duration : 0)) / queue.length : 0;
  return { done, where: [queue.length > 1 ? `${w(lang, 'part')} ${index + 1}/${queue.length}` : '', clock(time)].filter(Boolean).join(' · ') };
}

/**
 * The last thing you were reading or hearing, from this browser and, when
 * signed in, your account (what you left on your phone is here on your
 * computer). Nothing is drawn until there is one.
 */
function ContinueCard({ lang }: { lang: Lang }) {
  const account = useAccount();
  const player = usePlayer();
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
  const { done, where } = progressOf(place, lang);
  const pct = Math.round(Math.max(0, Math.min(1, done)) * 100);
  const queue = (place.place.queue as Track[] | undefined) ?? [];
  const index = Number(place.place.index) || 0;
  const mine = place.kind === 'listen' && player.current !== null && placeKey(player.current) === place.key;
  return (
    <section className="hm-continue" aria-labelledby="hm-continue">
      <h2 className="hm-h" id="hm-continue">
        {w(lang, 'continue')}
      </h2>
      <div className="hm-card">
        {place.sub ? <span className="hm-kicker">{place.sub}</span> : null}
        <Link className="hm-card-title" to={place.href}>
          {place.title}
        </Link>
        <span className="hm-where">{where}</span>
        <div className="hm-progress">
          {place.kind === 'listen' && queue[index] ? (
            <button type="button" className="btn primary" onClick={() => (mine ? player.toggle() : player.play(queue, index, Number(place.place.time) || 0))}>
              <Icon name={mine && player.playing ? 'pause' : 'play'} size={14} />
              {mine && player.playing ? w(lang, 'pause') : w(lang, 'hear')}
            </button>
          ) : (
            <Link className="btn primary" to={place.href}>
              {w(lang, 'read')}
            </Link>
          )}
          {pct ? (
            <>
              <span className="hm-pct">{pct}%</span>
              <span className="hm-track" aria-hidden="true">
                <i style={{ width: `${pct}%` }} />
              </span>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

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

/** Where help is needed: what the machines read and heard that no person has checked. */
function HelpList({ help, lang }: { help: { totals: MachineToCheck['totals']; next: MachineToCheck['transcripts'][number] | null }; lang: Lang }) {
  const { totals, next } = help;
  const rows: Array<{ key: string; to: string; title: string; hint: string; icon: 'dot' | 'audio' }> = [];
  if (totals.texts) rows.push({ key: 'pages', to: href('/check', lang), title: w(lang, 'pages'), hint: `${num(totals.texts, lang)} · ${w(lang, 'pagesHint')}`, icon: 'dot' });
  if (totals.transcripts) rows.push({ key: 'recordings', to: next ? href(next.path ?? `/${next.event}`, lang, { tab: 'text' }) : href('/check', lang), title: w(lang, 'recordings'), hint: `${num(totals.transcripts, lang)} · ${w(lang, 'recordingsHint')}`, icon: 'audio' });
  return (
    <section className="hm-help" aria-labelledby="hm-help">
      <h2 className="hm-h" id="hm-help">
        {w(lang, 'help')}
      </h2>
      <p className="hm-help-text">{w(lang, 'helpText')}</p>
      <ul className="hm-help-list">
        {rows.map((r) => (
          <li key={r.key}>
            <Link to={r.to}>
              <Icon name={r.icon} size={r.icon === 'dot' ? 20 : 16} className={r.icon === 'dot' ? 'hm-machine' : 'subtle'} />
              <span className="hm-help-main">
                <b>{r.title}</b>
                <span>{r.hint}</span>
              </span>
              <Icon name={lang === 'he' ? 'chev' : 'chevr'} size={16} className="subtle hm-go" />
            </Link>
          </li>
        ))}
        <li>
          <Link to={href('/help', lang)}>
            <Icon name="heart" size={16} className="subtle" />
            <span className="hm-help-main">
              <b>{w(lang, 'helpAll')}</b>
            </span>
            <Icon name={lang === 'he' ? 'chev' : 'chevr'} size={16} className="subtle hm-go" />
          </Link>
        </li>
      </ul>
    </section>
  );
}

/** A farbrengen of this day in the Rebbe's years, to play here. */
function ListenCard({ event, more, lang }: { event: EventItem & { recordings?: number }; more: number; lang: Lang }) {
  const d = eventData(event);
  const parts = event.recordings ?? 0;
  return (
    <section className="hm-listen" aria-labelledby="hm-listen">
      <h2 className="hm-h" id="hm-listen">
        {w(lang, 'listen')}
      </h2>
      <div className="hm-card hm-listen-card">
        <PlayEventButton event={event} size="large" />
        <Link className="hm-listen-main" to={href(itemPath(event), lang)}>
          <b>{nameOf(d.title, lang)}</b>
          <span>{[w(lang, 'recording'), d.date ? dateLabel(d.date, lang, { civil: false }) : '', parts > 1 ? `${num(parts, lang)} ${w(lang, 'parts')}` : ''].filter(Boolean).join(' · ')}</span>
        </Link>
      </div>
      {more ? (
        <Link className="hm-more" to={href('/calendar', lang)}>
          {w(lang, 'moreToday').replace('{n}', num(more, lang))}
        </Link>
      ) : null}
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

/** What ChassidusHub is, the search box, and a few things to try. Without script the box is a plain form to the search page. */
function Hero({ lang }: { lang: Lang }) {
  const tries: Array<{ to: string; label: string }> = [
    { to: href('/likkutei-sichos', lang), label: lang === 'he' ? 'לקוטי שיחות' : 'Likkutei Sichos' },
    { to: href('/tanya', lang), label: lang === 'he' ? 'תניא' : 'Tanya' },
    { to: href('/search', lang, { q: 'יו״ד שבט' }), label: w(lang, 'yudShvat') },
  ];
  return (
    <section className="hm-hero">
      <h1>{w(lang, 'heroTitle')}</h1>
      <p className="hm-lede">{w(lang, 'heroText')}</p>
      <form className="hm-search" action="/search" method="get" role="search" aria-label={tu(lang, 'searchShort')}>
        <Icon name="search" />
        <input name="q" type="search" placeholder={tu(lang, 'searchLibrary')} aria-label={tu(lang, 'searchShort')} />
        {lang === 'he' ? <input type="hidden" name="lang" value="he" /> : null}
        <button type="submit" className="btn primary">
          {w(lang, 'searchGo')}
        </button>
      </form>
      <p className="hm-try">
        <span>{w(lang, 'try')}</span>
        {tries.map((x) => (
          <Link key={x.to} to={x.to}>
            {x.label}
          </Link>
        ))}
      </p>
    </section>
  );
}

/** The three ways in, each with a line saying what is there. */
function Doors({ lang }: { lang: Lang }) {
  const doors: Array<{ to: string; icon: IconName; title: string; text: string }> = [
    { to: '/sets', icon: 'book', title: tu(lang, 'navLibrary'), text: w(lang, 'libraryText') },
    { to: '/daily', icon: 'cal', title: tu(lang, 'navDailyLong'), text: w(lang, 'dailyText') },
    { to: '/calendar', icon: 'audio', title: tu(lang, 'navListen'), text: w(lang, 'listenText') },
  ];
  return (
    <nav className="hm-doors" aria-label={tu(lang, 'mainNav')}>
      {doors.map((d) => (
        <Link key={d.to} className="hm-door" to={href(d.to, lang)}>
          <span className="hm-door-icon">
            <Icon name={d.icon} size={22} />
          </span>
          <span className="hm-door-main">
            <b>{d.title}</b>
            <span>{d.text}</span>
          </span>
          <Icon name={lang === 'he' ? 'chev' : 'chevr'} size={18} className="subtle hm-go" />
        </Link>
      ))}
    </nav>
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
  const { lang, week, weekday, day, listen, listenMore, help } = loaderData;
  const title = week.holidays[0] ?? (week.parsha ? `${w(lang, 'parsha')} ${week.parsha}` : WEEKDAYS[lang][weekday]!);
  return (
    <div className="hm-page">
      <div className="wrap">
        <Hero lang={lang} />
        <Doors lang={lang} />
      </div>
      <div className="wrap hm">
        <div className="hm-col hm-start">
          <header className="hm-day">
            <p>
              {w(lang, 'today')} · {WEEKDAYS[lang][weekday]} · {week.todayLabel}
            </p>
            <h2>{title}</h2>
          </header>
          <ContinueCard lang={lang} />
          {listen ? <ListenCard event={listen as EventItem & { recordings?: number }} more={listenMore} lang={lang} /> : null}
        </div>
        <div className="hm-col hm-end">
          {day ? <DailyCard day={day} lang={lang} /> : null}
          <HelpList help={help ?? { totals: { texts: 0, transcripts: 0 } as MachineToCheck['totals'], next: null }} lang={lang} />
        </div>
      </div>
      <div className="wrap">
        <Browse lang={lang} />
      </div>
    </div>
  );
}
