import { useEffect, useState } from 'react';
import type { DailyLearning } from '../lib/api.js';
import type { Lang } from '../lib/i18n.js';
import { href } from '../lib/links.js';
import { dateLabel } from '../lib/dates.js';
import { labelOf } from '../lib/labels.js';
import { chumashEnglish, rambamEnglish, tehillimEnglish } from '../lib/shiurEnglish.js';
import { Icon } from '../ui/Icon.js';

/**
 * The day's shiurim at a glance, as design/ draws the daily page (3e):
 * Chumash with Rashi, Tehillim, Tanya, the Rambam on the track the reader
 * follows (three chapters, one chapter or Sefer HaMitzvos, chosen under it
 * and kept in this browser) and Hayom Yom, each a row going to its words,
 * with a circle to tick once it is learned and the first not yet learned
 * marked as next. The ticks stay in this browser only; a line says what is
 * left today (board 33), and a bar counts them, and the days in a row on
 * which everything was learned. Each shiur goes
 * to its words on the shiurim page, cut to what is learned (the Chumash
 * by aliyah); Hayom Yom to its words on this page.
 */

const W = {
  title: { he: 'השיעורים של היום', en: 'Today’s shiurim' },
  chumash: { he: 'חומש', en: 'Chumash' },
  tehillim: { he: 'תהלים', en: 'Tehillim' },
  tanya: { he: 'תניא', en: 'Tanya' },
  three: { he: 'רמב״ם, ג׳ פרקים', en: 'Rambam, three chapters' },
  one: { he: 'רמב״ם, פרק אחד', en: 'Rambam, one chapter' },
  mitzvos: { he: 'ספר המצוות', en: 'Sefer HaMitzvos' },
  rambam: { he: 'רמב״ם', en: 'Rambam' },
  hayomYom: { he: 'היום יום', en: 'Hayom Yom' },
  next: { he: 'הבא בתור', en: 'Next' },
  track: { he: 'מסלול הרמב״ם', en: 'Rambam track' },
  trackThree: { he: 'ג׳ פרקים', en: '3 chapters' },
  trackOne: { he: 'פרק אחד', en: '1 chapter' },
  learned: { he: 'למדתי', en: 'Learned' },
  done: { he: 'מתוך', en: 'of' },
  streak: { he: 'ימים ברציפות', en: 'days in a row' },
  kept: { he: 'נשמר בדפדפן זה בלבד', en: 'Kept in this browser only' },
  headStart: { he: 'הלימוד של היום', en: "Today's learning" },
  headLeft: { he: 'עוד {n} להיום', en: '{n} more today' },
  headLeftOne: { he: 'עוד אחד להיום', en: 'One more today' },
  headDone: { he: 'כל הלימוד של היום, אשריכם', en: 'All of today, learned. Ashreichem' },
} as const;

export interface ShiurRow {
  key: string;
  name: string;
  /** Each piece of the shiur: its words, and where it is learned. */
  pieces: Array<{ text: string; to: string | null; external: boolean }>;
  /** Whether the words are in English (the English page, where Sefaria's references say it); else they are Hebrew, set as Torah text. */
  english?: boolean;
}

/** A day's Hebrew date as the day and month only, in the page's language: `ל׳ תשרי`, `30th of Tishrei`. */
export const dayOfMonth = (hebrew: string, lang: Lang) => dateLabel(hebrew, lang, { civil: false }).replace(/,?\s\S+$/, '');

const STORE = 'chassidushub:daily-learned';
type Store = Record<string, string[]>;
const read = (): Store => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Store;
  } catch {
    return {};
  }
};
const write = (store: Store) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(store));
  } catch {
    // Private windows and full storage: the ticks just do not stay.
  }
};
const dayBefore = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - 1)).toISOString().slice(0, 10);
};

/** Days in a row, ending at `date` (or the day before, while today is not done), on which every shiur of the day was ticked. */
function streak(store: Store, date: string, keys: string[]): number {
  if (!keys.length) return 0;
  const full = (d: string) => keys.every((k) => store[d]?.includes(k));
  let day = full(date) ? date : dayBefore(date);
  let n = 0;
  while (full(day)) {
    n++;
    day = dayBefore(day);
  }
  return n;
}

/**
 * The day's shiurim as rows, each going to its words on the shiurim page
 * (`/shiurim/<date>`, each cut to what is learned: the Chumash by aliyah);
 * `rambam` says which of the Rambam's tracks to list.
 */
export function shiurRows(day: DailyLearning, lang: Lang, { rambam: tracks = ['three', 'one', 'mitzvos'], hayomYom }: { rambam?: Array<'three' | 'one' | 'mitzvos'>; hayomYom?: string } = {}): ShiurRow[] {
  const t = (key: keyof typeof W) => W[key][lang];
  const rows: ShiurRow[] = [];
  const at = (section: string) => ({ to: `${href(`/shiurim/${day.date}`, lang)}#${section}`, external: false });
  // A row in English where the page is and the English is there to say it; otherwise as the Hebrew calendars print it.
  const row = (key: string, name: string, he: string, en: string | null | undefined, to: { to: string | null; external: boolean }): ShiurRow =>
    lang === 'en' && en ? { key, name, pieces: [{ text: en, ...to }], english: true } : { key, name, pieces: [{ text: he, ...to }] };
  const englishOf = (e: { data: unknown }) => (e.data as { label?: { en?: string } }).label?.en;
  if (day.chumash) rows.push(row('chumash', t('chumash'), day.chumash.label, chumashEnglish(day.chumash.ref), at('chumash')));
  if (day.tehillim?.length) rows.push(row('tehillim', t('tehillim'), day.tehillim.map((p) => p.text.replace(/\.$/, '')).join(' '), tehillimEnglish(day.tehillim.map((p) => p.ref)), at('tehillim')));
  if (day.tanya.length) {
    const en = day.tanya.map(englishOf);
    rows.push(row('tanya', t('tanya'), day.tanya.map((p) => labelOf(p, 'he')).join(' – '), en.every(Boolean) ? en.join(' – ') : null, at('tanya')));
  }
  const rambam = day.rambam;
  if (rambam) for (const key of tracks) if (rambam[key]) rows.push(row(key, t(key), rambam[key]!.label, rambamEnglish(rambam[key]!.refs), at(key)));
  if (hayomYom && day.hayomYom.length) rows.push(row('hayom-yom', t('hayomYom'), day.hayomYom.map((e) => labelOf(e, 'he')).join(' – '), dayOfMonth(day.hebrew, 'en'), { to: hayomYom, external: false }));
  return rows;
}

/**
 * Which of a day's shiurim are ticked as learned, kept in this browser
 * (the daily page and the home page share them), and how many days in a
 * row everything in `rows` was.
 */
export function useLearned(date: string, rows: ShiurRow[]) {
  const [store, setStore] = useState<Store>({});
  useEffect(() => setStore(read()), []);
  const ticked = new Set(store[date] ?? []);
  const toggle = (key: string) => {
    const next = read();
    const set = new Set(next[date] ?? []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    next[date] = [...set];
    write(next);
    setStore(next);
  };
  return { ticked, toggle, inARow: streak(store, date, rows.map((r) => r.key)) };
}

type Track = 'three' | 'one' | 'mitzvos';
const TRACKS: Track[] = ['three', 'one', 'mitzvos'];
const TRACK_STORE = 'chassidushub:rambam-track';

/** The Rambam track this reader follows, kept in this browser (three chapters until they choose). */
function useTrack(): [Track, (t: Track) => void] {
  const [track, setTrack] = useState<Track>('three');
  useEffect(() => {
    try {
      const kept = localStorage.getItem(TRACK_STORE) as Track | null;
      if (kept && TRACKS.includes(kept)) setTrack(kept);
    } catch {
      // No storage: three chapters.
    }
  }, []);
  const choose = (t: Track) => {
    setTrack(t);
    try {
      localStorage.setItem(TRACK_STORE, t);
    } catch {
      // Private windows: the choice holds for this visit.
    }
  };
  return [track, choose];
}

export function DailyShiurim({ day, lang }: { day: DailyLearning; lang: Lang }) {
  const t = (key: keyof typeof W) => W[key][lang];
  const [track, setTrack] = useTrack();
  const rows = shiurRows(day, lang, { rambam: [track], hayomYom: '#daily-hayom-yom' });
  const { ticked, toggle, inARow } = useLearned(day.date, rows);
  if (!rows.length) return null;
  const count = rows.filter((r) => ticked.has(r.key)).length;
  const next = rows.find((r) => !ticked.has(r.key))?.key;
  const trackName: Record<Track, string> = { three: t('trackThree'), one: t('trackOne'), mitzvos: t('mitzvos') };

  return (
    <section className="dl-shiurim" aria-label={t('title')}>
      {/* What is left today, in a few words (design/system, board 33), above the bar and its count. */}
      <p className={count === rows.length ? 'dl-head done' : 'dl-head'} role="status">
        {count === 0 ? t('headStart') : count === rows.length ? t('headDone') : rows.length - count === 1 ? t('headLeftOne') : t('headLeft').replace('{n}', String(rows.length - count))}
      </p>
      <div className="dl-progress" title={t('kept')}>
        <span className="dl-bar" aria-hidden="true">
          <span style={{ width: `${(count / rows.length) * 100}%` }} />
        </span>
        <span className="dl-count">
          {count} {t('done')} {rows.length}
          {inARow > 1 ? ` · ${inARow} ${t('streak')}` : null}
        </span>
      </div>
      <ul className="dl-list">
        {rows.map((row) => {
          const done = ticked.has(row.key);
          const [first, ...rest] = row.pieces;
          const rambam = TRACKS.includes(row.key as Track);
          return (
            <li key={rambam ? 'rambam' : row.key} className={`dl-row${done ? ' done' : ''}${row.key === next ? ' next' : ''}`}>
              <button type="button" className="dl-tick" aria-pressed={done} aria-label={`${t('learned')}: ${row.name}`} onClick={() => toggle(row.key)}>
                {done ? <Icon name="check" size={15} /> : null}
              </button>
              <span className="dl-what">
                <span className="dl-name">
                  {rambam ? `${t('rambam')} · ${trackName[row.key as Track]}` : row.name}
                  {row.key === next ? ` · ${t('next')}` : null}
                </span>
                <span className={row.english ? 'dl-text' : 'dl-text torah'} lang={row.english ? 'en' : 'he'} dir={row.english ? 'ltr' : 'rtl'}>
                  {first?.to ? (
                    <a className="dl-main" href={first.to} target={first.external ? '_blank' : undefined} rel={first.external ? 'noopener' : undefined}>
                      {first.text}
                    </a>
                  ) : (
                    first?.text
                  )}
                  {rest.map((piece, i) => (
                    <span key={i}>
                      {' · '}
                      {piece.to ? (
                        <a className="dl-more" href={piece.to} target={piece.external ? '_blank' : undefined} rel={piece.external ? 'noopener' : undefined}>
                          {piece.text}
                        </a>
                      ) : (
                        piece.text
                      )}
                    </span>
                  ))}
                </span>
                {rambam ? (
                  <span className="dl-tracks" role="group" aria-label={t('track')}>
                    {TRACKS.filter((k) => day.rambam?.[k]).map((k) => (
                      <button key={k} type="button" aria-pressed={k === track} onClick={() => setTrack(k)}>
                        {trackName[k]}
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
              <Icon name="chev" className="dl-chev flip-ltr" size={16} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
