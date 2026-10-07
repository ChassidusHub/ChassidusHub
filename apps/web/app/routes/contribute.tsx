import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/contribute';
import type { SuggestionRow } from '../lib/api.js';
import { siteOf } from '../lib/context.server.js';
import { drafts, type DraftOp } from '../lib/draft.js';
import { langFrom, type Lang } from '../lib/i18n.js';
import { num } from '../lib/i18nUi.js';
import { href } from '../lib/links.js';
import { pageMeta } from '../lib/seo.js';
import { useAccount } from '../lib/useAccount.js';
import { Icon, type IconName } from '../ui/Icon.js';
import { EmptyState } from '../ui/primitives.js';
import '../styles/pages/contribute.css';

/**
 * Contribute, one of the five places (docs/plans/redesign.md): what there
 * is to do (Help), what waits for a person to look at it (Review), and
 * what is yours (your changes not sent yet, on every page, and what you
 * sent). Each part is a list that leads to the page where the work is
 * done, in Edit; nothing here is a second editor.
 */

type Tab = 'help' | 'review' | 'yours';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { api, siteUrl } = siteOf(context);
  const lang = langFrom(request);
  const asked = new URL(request.url).searchParams.get('tab');
  const tab: Tab = asked === 'review' || asked === 'yours' ? asked : 'help';
  const [toCheck, community, waiting] = await Promise.all([
    tab === 'help' ? api.toCheck(1).catch(() => null) : null,
    api.community(1).catch(() => null),
    tab === 'review' ? api.suggestions({ status: 'open', limit: 40 }).catch(() => [] as SuggestionRow[]) : ([] as SuggestionRow[]),
  ]);
  return {
    lang,
    siteUrl,
    tab,
    machine: toCheck ? { transcripts: toCheck.totals.transcripts, texts: toCheck.totals.texts, scans: toCheck.totals.scans } : null,
    gaps: community?.gaps ?? null,
    openSuggestions: community?.openSuggestions ?? null,
    openReports: community?.openReports ?? null,
    waiting: waiting.map((s) => ({ id: s.id, number: s.number ?? null, title: s.title, author: s.author, at: s.submitted_at ?? s.created_at })),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];
  return pageMeta({ title: W.title[loaderData.lang], description: W.lede[loaderData.lang], path: '/contribute', lang: loaderData.lang, siteUrl: loaderData.siteUrl });
}

const W = {
  title: { he: 'להשתתף', en: 'Contribute' },
  lede: { he: 'הספרייה נבנית בידי כל מי שלומד בה. כל דף נפתח לעריכה במקום.', en: 'The library is built by everyone who learns in it. Every page opens for editing in place.' },
  help: { he: 'לעזור', en: 'Help' },
  review: { he: 'לבדוק', en: 'Review' },
  yours: { he: 'שלך', en: 'Yours' },
  checkTitle: { he: 'לבדוק מה שהמכונה כתבה', en: 'Check what the machines wrote' },
  checkText: { he: 'תמלולים וקריאה מסריקות שאדם עוד לא בדק. "נכון" או תיקון במקום.', en: 'Transcripts and scans read by machine that nobody has checked. "Right", or a fix in place.' },
  transcripts: { he: 'תמלולים', en: 'transcripts' },
  pages: { he: 'עמודים', en: 'pages' },
  scans: { he: 'סריקות', en: 'scans' },
  addTitle: { he: 'להוסיף מה שחסר', en: 'Add what is missing' },
  addText: { he: 'הנחה, הקלטה, ספר או מכתב שאין באתר.', en: 'A hanacha, recording, sefer or letter the site lacks.' },
  missingTitle: { he: 'התוועדויות בלי הקלטה או הנחה', en: 'Farbrengens with no recording or text' },
  noRecording: { he: 'בלי הקלטה', en: 'with no recording' },
  noText: { he: 'בלי הנחה', en: 'with no text' },
  editTitle: { he: 'לתקן כל דף', en: 'Fix any page' },
  editText: { he: 'בכל דף יש "עריכה" ליד השם: מקישים על מה שצריך תיקון, והשינויים נשלחים יחד.', en: 'Every page has Edit beside its name: tap what needs fixing, and your changes are sent together.' },
  ways: { he: 'כל הדרכים לעזור', en: 'All the ways to help' },
  reviewLede: { he: 'הצעות שמחכות לעין נוספת. כל אחד יכול להגיב; מי שמורשה מאשר.', en: 'Suggestions waiting for another pair of eyes. Anyone may comment; those who may, approve.' },
  queue: { he: 'לתור הבדיקה', en: 'Open the review queue' },
  noneWaiting: { he: 'אין הצעות שמחכות.', en: 'Nothing waits for review.' },
  reports: { he: 'דיווחים פתוחים', en: 'open reports' },
  unsent: { he: 'השינויים שלך שעוד לא נשלחו', en: 'Your changes, not sent yet' },
  unsentNone: { he: 'אין שינויים שמחכים. בכל דף, "עריכה" פותחת אותו לשינוי.', en: 'No changes are waiting. On any page, Edit opens it for changing.' },
  changes: { he: 'שינויים', en: 'changes' },
  open: { he: 'להמשיך', en: 'Continue' },
  sent: { he: 'מה ששלחת', en: 'What you sent' },
  sentText: { he: 'ההצעות שלך, הפתוחות והסגורות, ומה שקרה איתן.', en: 'Your suggestions, open and closed, and what came of them.' },
  signIn: { he: 'כדי לראות את מה ששלחת צריך להתחבר.', en: 'Sign in to see what you sent.' },
} as const;
const w = (lang: Lang, key: keyof typeof W) => W[key][lang];

export default function Contribute({ loaderData }: Route.ComponentProps) {
  const { lang, tab } = loaderData;
  const tabs: Array<{ key: Tab; icon: IconName }> = [
    { key: 'help', icon: 'heart' },
    { key: 'review', icon: 'suggest' },
    { key: 'yours', icon: 'user' },
  ];
  return (
    <div className="wrap ct">
      <header className="ct-head">
        <h1>{w(lang, 'title')}</h1>
        <p>{w(lang, 'lede')}</p>
      </header>
      <nav className="ct-tabs" aria-label={w(lang, 'title')}>
        {tabs.map((x) => (
          <Link key={x.key} to={href('/contribute', lang, x.key === 'help' ? {} : { tab: x.key })} aria-current={tab === x.key ? 'page' : undefined} preventScrollReset>
            <Icon name={x.icon} size={16} />
            {w(lang, x.key)}
          </Link>
        ))}
      </nav>
      {tab === 'help' ? <HelpPart data={loaderData} /> : tab === 'review' ? <ReviewPart data={loaderData} /> : <YoursPart lang={lang} />}
    </div>
  );
}

type Data = Route.ComponentProps['loaderData'];

function HelpPart({ data }: { data: Data }) {
  const { lang, machine, gaps } = data;
  return (
    <div className="ct-cards">
      <Link className="ct-card is-machine" to={href('/check', lang)}>
        <Icon name="check" />
        <span>
          <b>{w(lang, 'checkTitle')}</b>
          <span>{w(lang, 'checkText')}</span>
          {machine ? (
            <span className="ct-counts">
              {[
                [machine.transcripts, 'transcripts'],
                [machine.texts, 'pages'],
                [machine.scans, 'scans'],
              ]
                .filter(([n]) => Number(n) > 0)
                .map(([n, k]) => `${num(Number(n), lang)} ${w(lang, k as keyof typeof W)}`)
                .join(' · ')}
            </span>
          ) : null}
        </span>
      </Link>
      <div className="ct-card">
        <Icon name="pencil" />
        <span>
          <b>{w(lang, 'editTitle')}</b>
          <span>{w(lang, 'editText')}</span>
        </span>
      </div>
      <Link className="ct-card" to={href('/add', lang)}>
        <Icon name="plus" />
        <span>
          <b>{w(lang, 'addTitle')}</b>
          <span>{w(lang, 'addText')}</span>
        </span>
      </Link>
      {gaps && (gaps.eventsWithoutRecordings || gaps.eventsWithoutTexts) ? (
        <Link className="ct-card" to={href('/help', lang)}>
          <Icon name="cal" />
          <span>
            <b>{w(lang, 'missingTitle')}</b>
            <span className="ct-counts">
              {num(gaps.eventsWithoutRecordings, lang)} {w(lang, 'noRecording')} · {num(gaps.eventsWithoutTexts, lang)} {w(lang, 'noText')}
            </span>
          </span>
        </Link>
      ) : null}
      <p className="ct-more">
        <Link to={href('/help', lang)}>{w(lang, 'ways')}</Link>
      </p>
    </div>
  );
}

function ReviewPart({ data }: { data: Data }) {
  const { lang, waiting, openReports } = data;
  return (
    <section>
      <div className="ct-row-head">
        <p>{w(lang, 'reviewLede')}</p>
        <Link className="btn primary" to={href('/review', lang)}>
          {w(lang, 'queue')}
        </Link>
      </div>
      {waiting.length ? (
        <ul className="ct-list">
          {waiting.map((s) => (
            <li key={s.id}>
              <Link to={s.number ? href(`/suggestions/${s.number}`, lang) : href('/review', lang, { s: String(s.id) })}>
                <span className="ct-num">{s.number ? `#${s.number}` : ''}</span>
                <span className="grow">{s.title}</span>
                <Icon name="chev" size={16} className="subtle flip-ltr" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="check" title={w(lang, 'noneWaiting')} compact />
      )}
      {openReports ? (
        <p className="ct-more">
          <Link to={href('/issues', lang)}>
            {num(openReports, lang)} {w(lang, 'reports')}
          </Link>
        </p>
      ) : null}
    </section>
  );
}

interface Unsent {
  place: string;
  ops: DraftOp[];
}

/** Your changes not sent yet: this browser's, and your account's from other devices; each opens its page in Edit, where the tray sends it. */
function YoursPart({ lang }: { lang: Lang }) {
  const account = useAccount();
  const [unsent, setUnsent] = useState<Unsent[] | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const here = drafts.local();
      const kept = account ? await drafts.list() : [];
      const byPlace = new Map<string, Unsent>();
      for (const d of [...kept, ...here]) if (d.ops.length) byPlace.set(d.place, d);
      if (live) setUnsent([...byPlace.values()]);
    })();
    return () => {
      live = false;
    };
  }, [account]);
  return (
    <section className="stack">
      <h2 className="h-sec">{w(lang, 'unsent')}</h2>
      {unsent === null ? null : unsent.length ? (
        <ul className="ct-list is-mine">
          {unsent.map((d) => (
            <li key={d.place}>
              <Link to={href(`/${d.place}`, lang, { edit: '' })}>
                <span className="ct-num">{num(d.ops.length, lang)}</span>
                <span className="grow">
                  <b>{d.ops[d.ops.length - 1]?.says}</b>
                  {d.ops.length > 1 ? <span className="row-sub">{`${num(d.ops.length, lang)} ${w(lang, 'changes')}`}</span> : null}
                </span>
                <span className="ct-go">{w(lang, 'open')}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="pencil" title={w(lang, 'unsentNone')} compact />
      )}
      <h2 className="h-sec">{w(lang, 'sent')}</h2>
      {account ? (
        <Link className="ct-card" to={href('/suggestions', lang, { author: '@me' })}>
          <Icon name="suggest" />
          <span>
            <b>{w(lang, 'sent')}</b>
            <span>{w(lang, 'sentText')}</span>
          </span>
        </Link>
      ) : (
        <p className="muted">
          <Link to={href('/signin', lang)}>{w(lang, 'signIn')}</Link>
        </p>
      )}
    </section>
  );
}
