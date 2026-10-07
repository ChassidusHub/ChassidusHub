import { Link } from 'react-router';
import type { Route } from './+types/new';
import { PlayEventButton, eventData } from '../components/EventRow.js';
import type { Entity } from '../lib/api.js';
import { siteOf } from '../lib/context.server.js';
import { dateLabel, yearLabel } from '../lib/dates.js';
import { langFrom, nameOf, type Lang } from '../lib/i18n.js';
import { num } from '../lib/i18nUi.js';
import { href, itemPath } from '../lib/links.js';
import { pageMeta } from '../lib/seo.js';
import { daysOf, NEW_MONTHS, NEW_THINGS } from '../lib/whatsNew.js';
import { Icon } from '../ui/Icon.js';
import { EmptyState } from '../ui/primitives.js';
import '../styles/pages/contribute.css';

/**
 * What is new (lib/whatsNew.ts), all on one page, as Home's "new" cards
 * lead to it: the farbrengens of Cheshvan and Kislev whose recordings a
 * machine transcribed, every year, month by month, each to play at once;
 * then the texts read from scans. Three reads of the API, the same for
 * everyone.
 */

type Event = Entity & { recordings: number };

export async function loader({ request, context }: Route.LoaderArgs) {
  const { api, siteUrl } = siteOf(context);
  const lang = langFrom(request);
  const [months, transcribed] = await Promise.all([
    Promise.all(NEW_MONTHS.map((m) => api.events({ day: daysOf(m.month), limit: 2000 }).catch(() => [] as Event[]))),
    api.transcribed(1000).catch(() => []),
  ]);
  const withWords = new Set(transcribed.map((r) => r.event).filter((x): x is string => Boolean(x)));
  return {
    lang,
    siteUrl,
    months: NEW_MONTHS.map((m, i) => {
      // Heard, newest year first; in a year, by its day.
      const heard = months[i]!.filter((e) => e.recordings > 0).sort((a, b) => {
        const [da, db] = [String((a.data as { date?: string }).date ?? ''), String((b.data as { date?: string }).date ?? '')];
        return db.slice(0, 4).localeCompare(da.slice(0, 4)) || da.localeCompare(db);
      });
      return {
        month: m.month,
        name: m.name,
        events: heard.map((e) => ({ id: e.id, path: e.path, type: e.type, data: e.data, recordings: e.recordings, words: withWords.has(e.id) })),
      };
    }),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  return pageMeta({ title: W.title[loaderData.lang], description: W.lede[loaderData.lang], path: '/new', lang: loaderData.lang, siteUrl: loaderData.siteUrl });
}

const W = {
  title: { he: 'מה חדש', en: "What's new" },
  lede: { he: 'מה שאפשר עכשיו לשמוע ולקרוא, בעזרת AI.', en: 'What you can now hear and read, made possible with AI.' },
  heardH: { he: 'התוועדויות חשוון וכסלו, בתמלול AI', en: 'Cheshvan and Kislev farbrengens, transcribed by AI' },
  heardText: { he: 'כל התוועדות עם ההקלטה, והמילים נגללות לפניכם תוך כדי שמיעה. את התמלול כתבה מכונה.', en: 'Every farbrengen with its recording, the words moving along as you hear. A machine wrote the transcript.' },
  textsH: { he: 'טקסטים חדשים', en: 'New texts' },
  ai: { he: 'תמלול AI', en: 'AI transcript' },
  parts: { he: 'חלקים', en: 'parts' },
  farbrengens: { he: 'התוועדויות', en: 'farbrengens' },
  none: { he: 'אין כאן עדיין.', en: 'Nothing here yet.' },
} as const;
const w = (lang: Lang, key: keyof typeof W) => W[key][lang];

type Data = Route.ComponentProps['loaderData'];
type Row = Data['months'][number]['events'][number];

function HeardRow({ e, lang }: { e: Row; lang: Lang }) {
  const d = eventData(e);
  return (
    <li className="nw-row">
      <PlayEventButton event={e} />
      <Link to={href(itemPath(e), lang)} className="grow">
        <b>{nameOf(d.title, lang)}</b>
        <span className="row-sub">
          {[d.date ? dateLabel(d.date, lang, { civil: false }) : '', e.recordings > 1 ? `${num(e.recordings, lang)} ${w(lang, 'parts')}` : ''].filter(Boolean).join(' · ')}
        </span>
      </Link>
      {e.words ? <span className="nw-ai">{w(lang, 'ai')}</span> : null}
    </li>
  );
}

export default function New({ loaderData }: Route.ComponentProps) {
  const { lang, months } = loaderData;
  const texts = NEW_THINGS.filter((x) => x.key !== 'heard');
  return (
    <div className="wrap ct nw">
      <header className="ct-head">
        <h1>{w(lang, 'title')}</h1>
        <p>{w(lang, 'lede')}</p>
      </header>

      <nav className="nw-jump" aria-label={w(lang, 'title')}>
        {months.map((m) => (
          <a key={m.month} className="btn" href={`#month-${m.month}`}>
            {m.name[lang]} <span className="subtle num">{num(m.events.length, lang)}</span>
          </a>
        ))}
        <a className="btn" href="#texts">
          {w(lang, 'textsH')}
        </a>
      </nav>

      <section id="heard" aria-labelledby="nw-heard" className="nw-sec">
        <h2 id="nw-heard" className="nw-h">
          <Icon name="audio" size={18} />
          {w(lang, 'heardH')}
        </h2>
        <p className="muted">{w(lang, 'heardText')}</p>
        {months.map((m) => {
          const years = [...new Set(m.events.map((e) => String(eventData(e).date ?? '').slice(0, 4)))];
          return (
            <section key={m.month} id={`month-${m.month}`} className="nw-month" aria-label={m.name[lang]}>
              <h3>
                {m.name[lang]} <span className="subtle num">· {num(m.events.length, lang)} {w(lang, 'farbrengens')}</span>
              </h3>
              {m.events.length ? (
                years.map((y) => (
                  <div key={y} className="nw-year">
                    <h4>{yearLabel(Number(y), lang)}</h4>
                    <ul className="ct-list">
                      {m.events
                        .filter((e) => String(eventData(e).date ?? '').startsWith(y))
                        .map((e) => (
                          <HeardRow key={e.id} e={e} lang={lang} />
                        ))}
                    </ul>
                  </div>
                ))
              ) : (
                <EmptyState icon="audio" title={w(lang, 'none')} compact />
              )}
            </section>
          );
        })}
      </section>

      <section id="texts" aria-labelledby="nw-texts" className="nw-sec">
        <h2 id="nw-texts" className="nw-h">
          <Icon name="book" size={18} />
          {w(lang, 'textsH')}
        </h2>
        <div className="ct-cards">
          {texts.map((x) => (
            <Link key={x.key} className="ct-card is-machine" to={href(x.to, lang)}>
              <Icon name={x.icon} />
              <span>
                <b>{x.title[lang]}</b>
                <span>{x.text[lang]}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
