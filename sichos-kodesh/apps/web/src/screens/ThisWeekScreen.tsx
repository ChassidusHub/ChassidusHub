import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { currentHebrewYear, currentParsha, resolveThisWeek, resolveWeekWithFallback } from '@sichos-kodesh/catalog';
import { IL } from '../config';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewYearLabel, hebrewDayMonthLabel, parshaLabel } from '../utils/formatHebrewDate';
import { useProgressMap } from '../player/useProgressMap';
import { useDownload } from '../download/useDownload';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  sourceYear: number;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * The real Gregorian instant `weekOffset` real weeks away from now -
 * shifting the *real* calendar date by whole weeks before translating it
 * into `sourceYear` (see `resolveThisWeek`) is what walks through
 * consecutive weeks there, since `resolveThisWeek` always derives "this
 * week" from a real today and reuses its (month, day) values as-is.
 * `Date`'s own arithmetic (not raw millisecond addition on an `HDate`)
 * correctly handles crossing a month/year boundary on its own.
 */
function shiftedToday(weekOffset: number): Date {
  return new Date(Date.now() + weekOffset * MS_PER_WEEK);
}

/**
 * The list-only screen for "Follow along" - tapping a row navigates to
 * /follow/:sourceYear/:occasionId (see routes/useResolvedEntry.ts's
 * useFollowEntry). Below the current week, "All of {year}" links to
 * FollowMonthListScreen (/follow/:sourceYear/month) - the *whole*
 * kvius-matched year's months, not one long flat list, the same
 * month-first browsing FollowMonthListScreen/MonthOccasionsScreen give a
 * plain browsed year - since the year is kvius-matched, it's worth being
 * able to look at any of its other weeks too, not just today's.
 * useFollowEntry resolves both kinds of link the same way (falling back to
 * a plain lookup outside "this week"), so an occasion reached this way
 * still gets FarbrengenScreen's highlighted-hanacha treatment, not a
 * generic one.
 *
 * Previous/next step through adjacent real weeks (see `shiftedToday`) -
 * local screen state, not reflected in the URL, so an occasion reached
 * from a shifted week still resolves correctly (useFollowEntry falls back
 * to its plain, outside-this-week lookup for it, same as any other
 * non-today occasion reached via FollowMonthListScreen).
 */
export function ThisWeekScreen({ sourceYear }: Props) {
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const { enqueueBulk } = useDownload();
  const [weekOffset, setWeekOffset] = useState(0);
  const shiftedDate = useMemo(() => shiftedToday(weekOffset), [weekOffset]);
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog, shiftedDate), [sourceYear, shiftedDate]);
  const suggestedYear = useMemo(
    () => (occasions.length > 0 ? null : (resolveWeekWithFallback(sourceYear, currentHebrewYear(), catalog, shiftedDate)?.hebrewYear ?? null)),
    [occasions, sourceYear, shiftedDate],
  );
  // The real week being viewed's own parsha - kvius-matched years share the
  // same Sedra schedule by construction (see hebrewCalendar.ts's
  // `sameKvius`), so this is `sourceYear`'s parsha for this week too, not
  // just the real current year's. Shown so prev/next actually tells you
  // which week you've landed on, not just an unlabeled occasion list.
  const weekParsha = useMemo(() => currentParsha(IL, shiftedDate).parsha, [shiftedDate]);
  // Chevron *glyphs* swap for Hebrew, same as BackLink - "previous" (earlier)
  // points toward the reading-start side, which flips with direction; which
  // button actually decrements/increments doesn't change, and normal RTL
  // flexbox row-reversal already swaps their on-screen left/right positions
  // for free, so only the glyphs need to follow.
  const PrevIcon = language === 'he' ? ChevronRight : ChevronLeft;
  const NextIcon = language === 'he' ? ChevronLeft : ChevronRight;

  return (
    <div className="screen">
      <BackLink to="/kvius" />
      <h1>{t.thisWeek}</h1>
      <p className="subtitle">{t.fromHebrewYear(sourceYear)}</p>

      <div className="week-nav">
        <button type="button" className="week-nav-button" onClick={() => setWeekOffset((n) => n - 1)} aria-label={t.previousWeek}>
          <PrevIcon size={18} strokeWidth={2.5} />
        </button>
        <div className="week-nav-center">
          {weekParsha && <span className="week-nav-parsha">{parshaLabel(weekParsha, language)}</span>}
          {weekOffset !== 0 && (
            <button type="button" className="week-nav-reset" onClick={() => setWeekOffset(0)}>
              {t.backToThisWeek}
            </button>
          )}
        </div>
        <button type="button" className="week-nav-button" onClick={() => setWeekOffset((n) => n + 1)} aria-label={t.nextWeek}>
          <NextIcon size={18} strokeWidth={2.5} />
        </button>
      </div>

      {occasions.length === 0 && (
        <>
          <p className="gap-message">{t.nothingThisWeek(sourceYear)}</p>
          {suggestedYear != null && (
            <Link className="button" to={`/follow/${suggestedYear}`}>
              {t.tryYearInstead(hebrewYearLabel(suggestedYear, language))}
            </Link>
          )}
        </>
      )}

      <ul className="year-list">
        {occasions.map((occasion) => (
          <li key={occasion.entry.occasionId}>
            <Link className="year-row" to={`/follow/${sourceYear}/${occasion.entry.occasionId}`}>
              <span className="year-row-main">
                <OccasionRowIcon entry={occasion.entry} progressMap={progressMap} />
                <span className="year-row-year">{occasion.entry.occasionLabel}</span>
              </span>
              <span className="year-row-distance">{hebrewDayMonthLabel(occasion.hebrewDate, language)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {occasions.length > 0 && (
        <button type="button" className="button" onClick={() => enqueueBulk(occasions.map((occasion) => occasion.entry))}>
          {t.downloadThisWeekLabel}
        </button>
      )}

      <Link className="category-row" to={`/follow/${sourceYear}/month`}>
        <span className="category-row-name">{t.allOfYear(sourceYear)}</span>
      </Link>
    </div>
  );
}
