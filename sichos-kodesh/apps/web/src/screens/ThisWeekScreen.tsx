import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { currentHebrewYear, currentParsha, resolveThisWeek, resolveWeekWithFallback } from '@sichos-kodesh/catalog';
import { occasionTitle } from '@sichos-kodesh/app-core';
import { IL } from '../config';
import { useCatalog } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewYearLabel, hebrewDayMonthLabel, parshaLabel } from '../utils/formatHebrewDate';
import { useProgressMap } from '../player/useProgressMap';
import { useDownload } from '../download/useDownload';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  sourceYear: number;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * The Gregorian instant `weekOffset` weeks from now. Shifting the
 * calendar date by whole weeks before translating it into `sourceYear`
 * (see `resolveThisWeek`) is what steps through consecutive weeks there,
 * since `resolveThisWeek` always derives "this week" from today and
 * reuses its (month, day) values as-is. `Date`'s own arithmetic (not raw
 * millisecond addition on an `HDate`) correctly handles crossing a
 * month/year boundary.
 */
function shiftedToday(weekOffset: number): Date {
  return new Date(Date.now() + weekOffset * MS_PER_WEEK);
}

/**
 * Prev/next step through adjacent weeks (see `shiftedToday`) is local
 * screen state, not reflected in the URL, so an occasion reached from a
 * shifted week still resolves correctly - `useFollowEntry` falls back to
 * its plain, outside-this-week lookup for it, the same as any other
 * non-today occasion reached via FollowMonthListScreen.
 */
export function ThisWeekScreen({ sourceYear }: Props) {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const { enqueueBulk } = useDownload();
  const online = useOnlineStatus();
  const [weekOffset, setWeekOffset] = useState(0);
  const shiftedDate = useMemo(() => shiftedToday(weekOffset), [weekOffset]);
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog, shiftedDate), [catalog, sourceYear, shiftedDate]);
  const suggestedYear = useMemo(
    () => (occasions.length > 0 ? null : (resolveWeekWithFallback(sourceYear, currentHebrewYear(), catalog, IL, shiftedDate)?.hebrewYear ?? null)),
    [catalog, occasions, sourceYear, shiftedDate],
  );
  // Kvius-matched years share the same Sedra schedule by construction
  // (see hebrewCalendar.ts's `sameKvius`), so this is `sourceYear`'s
  // parsha for this week too, not just the real current year's.
  const weekParsha = useMemo(() => currentParsha(IL, shiftedDate).parsha, [shiftedDate]);
  // Chevron glyphs swap for Hebrew, same as BackLink: "previous" points
  // toward the reading-start side, which flips with direction. Which
  // button increments/decrements doesn't change - RTL row-reversal
  // already swaps their on-screen positions, so only the glyphs need to
  // follow.
  const PrevIcon = language === 'he' ? ChevronRight : ChevronLeft;
  const NextIcon = language === 'he' ? ChevronLeft : ChevronRight;

  return (
    <div className="screen">
      <ScreenHeader to="/kvius" title={t.thisWeek} />
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
              <span className="year-row-year">{occasionTitle(occasion.entry, language)}</span>
              <span className="year-row-trailing">
                <OccasionRowIcon
                  entry={occasion.entry}
                  progressMap={progressMap}
                  dateSlot={<span className="year-row-distance">{hebrewDayMonthLabel(occasion.hebrewDate, language)}</span>}
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {occasions.length > 0 && online && (
        <button type="button" className="button" onClick={() => enqueueBulk(occasions.map((occasion) => occasion.entry))}>
          <Download size={16} aria-hidden /> {t.downloadThisWeekLabel}
        </button>
      )}

      <Link className="category-row" to={`/follow/${sourceYear}/month`}>
        <span className="category-row-name">{t.allOfYear(sourceYear)}</span>
      </Link>
    </div>
  );
}
