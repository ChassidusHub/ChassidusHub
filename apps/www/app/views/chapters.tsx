import { Link } from 'react-router';
import { nameOf } from '../lib/catalog';
import type { ReaderView, ReaderWords } from '../reader/view';
import type { ReaderData } from '../reader/types';
import { SichaWords } from './sichos';

/** The pseudo-version that reads a chapter beside its translation (reader/load.server.ts, `BOTH`; kept here so the reader's script imports nothing of the server's). */
const BOTH = 'both';

/**
 * The page's own name without the parts the line under it already says:
 * `חלק ראשון; ליקוטי אמרים, הקדמת המלקט` is `הקדמת המלקט`, `אורח חיים,
 * מהדורא תניינא, סימן א׳` is `סימן א׳`.
 */
export function shortTitle(title: string, within: string | undefined): string {
  let short = title;
  for (const part of (within ?? '').split(' · ')) if (part && short.startsWith(`${part}, `)) short = short.slice(part.length + 2);
  return short;
}

/** A chapter's name in the row of chapters: `פרק נ״א` is `נא`; any other (שער, הסכמות, הקדמת המלקט) as it is named. */
export function chapterLabel(name: string, part: string): string {
  const own = (part && name.startsWith(`${part}, `) ? name.slice(part.length + 2) : name).split(', ')[0] ?? name;
  return own.startsWith('פרק ') ? own.slice(4).replace(/[׳״'"]/g, '') : own;
}

/**
 * The row of a part's chapters under the title, as the path bar's last level
 * lists them (no other read): each by its number, a tap away; the approbations,
 * three pages, are one chip. Drawn with the page, so nothing moves.
 */
function ChapterRow({ data }: { data: ReaderData }) {
  const here = data.pathBar.at(-1);
  const part = nameOf(data.pathBar.at(-2)?.chosen.name);
  const chapters: { path: string; label: string; current: boolean }[] = [];
  for (const choice of here?.choices ?? []) {
    if (!choice.path) continue;
    const label = chapterLabel(nameOf(choice.name), part);
    const current = choice.path === data.path;
    const last = chapters.at(-1);
    if (last && last.label === label) last.current ||= current;
    else chapters.push({ path: choice.path, label, current });
  }
  if (chapters.length < 2) return null;
  return (
    <nav className="chips ch-row" aria-label="הפרקים">
      {chapters.map((chapter) => (
        <Link key={chapter.path} className={chapter.current ? 'chip on' : 'chip'} to={chapter.path} aria-current={chapter.current ? 'page' : undefined}>
          {chapter.label}
        </Link>
      ))}
    </nav>
  );
}

/** Hebrew, English or both side by side, where the page has a translation: each a link to that version (?language=). */
function Languages({ words }: { words: ReaderWords }) {
  const he = words.versions.find((v) => v.language === 'he');
  const en = words.versions.find((v) => v.language === 'en');
  if (!he || !en) return null;
  const shown = words.paired ? BOTH : words.language === 'en' ? en.version : he.version;
  const options = [
    { version: he.version, label: 'עברית' },
    { version: en.version, label: 'English' },
    { version: BOTH, label: 'שתיהן' },
  ];
  return (
    <nav className="seg ch-lang" aria-label="שפה">
      {options.map((option) => (
        <Link key={option.version} to={`?language=${encodeURIComponent(option.version)}`} replace preventScrollReset aria-current={option.version === shown || undefined}>
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/** The title without the parts said under it, the sefer and its parts, then the page's choices: language, chapters, a siman's chips. */
function ChapterTitle({ data }: { data: ReaderData }) {
  const words = data.text.kind === 'words' ? data.text : null;
  return (
    <>
      <h1 className="stitle">{shortTitle(data.title, data.within)}</h1>
      {data.sub && <p className="ssub">{data.sub.replace(/; /g, ', ')}</p>}
      {(words || data.chips) && (
        <div className="ch-head">
          {words && <Languages words={words} />}
          {data.chips?.map((chip) =>
            chip.href ? (
              <Link key={chip.label} className="chip" to={chip.href}>
                {chip.label}
              </Link>
            ) : (
              <span key={chip.label} className={chip.current ? 'chip on' : 'chip quiet'} aria-current={chip.current ? 'page' : undefined}>
                {chip.label}
              </span>
            ),
          )}
        </div>
      )}
      {!data.chips && <ChapterRow data={data} />}
    </>
  );
}

/**
 * A book of chapters or simanim (RFC 0004, view `chapters`): Tanya and
 * Shulchan Aruch HaRav. Tanya reads by part, then chapter, with a row of its
 * chapters under the title, the opening words of each paragraph in bold as
 * printed, nikud kept, and its translation (English, or both side by side)
 * where it has one, the translation's notes under it. Shulchan Aruch HaRav
 * reads by section, then siman, each seif numbered in the margin and words in
 * parentheses a little quieter, with chips for its count of seifim and its
 * other edition. The server sets the words (chapters.layout.ts); the
 * daily-shiur markers in the source stay hidden, as on the old site.
 */
export const view: ReaderView = {
  kind: 'chapters',
  Title: ChapterTitle,
  Words: ({ data, words }) => (
    <div className={['chapters', words.paired && 'paired', !words.paired && words.language === 'en' && 'en'].filter(Boolean).join(' ')} lang={!words.paired && words.language === 'en' ? 'en' : undefined}>
      <SichaWords data={data} words={words} />
    </div>
  ),
};
