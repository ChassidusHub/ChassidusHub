import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { mafteiachMonthName, mafteiachMonthNameHebrew, mafteiachMonthToken } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  hebrewYear: number;
  monthToken: string;
}

/**
 * Browse mode's second screen for a year: every occasion in one specific
 * month (reached from YearBrowserScreen's month list), the same row style
 * every occasion list in the app uses. Occasion links go to
 * /browse/:hebrewYear/:occasionId, same as the old flat single-list
 * screen did - only how you get there changed, not where a row leads.
 */
export function MonthOccasionsScreen({ hebrewYear, monthToken }: Props) {
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const entries: CatalogEntry[] = (catalog[hebrewYear] ?? []).filter(
    (e) => (e.audio.length > 0 || e.pdfs.length > 0) && mafteiachMonthToken(e.hebrewDate) === monthToken,
  );
  const monthName = (language === 'he' ? mafteiachMonthNameHebrew : mafteiachMonthName)(`${hebrewYear}-${monthToken}-01`);

  return (
    <div className="screen">
      <BackLink to={`/browse/${hebrewYear}`} />
      <h1>{monthName}</h1>
      <p className="subtitle">{t.occasionsIndexed(entries.length)}</p>
      <ul className="year-list">
        {entries.map((entry) => (
          <li key={entry.occasionId}>
            <Link className="year-row" to={`/browse/${hebrewYear}/${entry.occasionId}`}>
              <span className="year-row-main">
                <OccasionRowIcon entry={entry} progressMap={progressMap} />
                <span className="year-row-year">{entry.occasionLabel}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
