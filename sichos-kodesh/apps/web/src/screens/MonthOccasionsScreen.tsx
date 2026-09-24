import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { mafteiachMonthName, mafteiachMonthNameHebrew, mafteiachMonthToken } from '@sichos-kodesh/catalog';
import { occasionTitle } from '@sichos-kodesh/app-core';
import { useCatalog } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  hebrewYear: number;
  monthToken: string;
}

export function MonthOccasionsScreen({ hebrewYear, monthToken }: Props) {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const entries: CatalogEntry[] = (catalog[hebrewYear] ?? []).filter(
    (e) => (e.audio.length > 0 || e.pdfs.length > 0) && mafteiachMonthToken(e.hebrewDate) === monthToken,
  );
  const monthName = (language === 'he' ? mafteiachMonthNameHebrew : mafteiachMonthName)(`${hebrewYear}-${monthToken}-01`);

  return (
    <div className="screen">
      <ScreenHeader to={`/browse/${hebrewYear}`} title={monthName} />
      <p className="subtitle">{t.occasionsIndexed(entries.length)}</p>
      <ul className="year-list">
        {entries.map((entry) => (
          <li key={entry.occasionId}>
            <Link className="year-row" to={`/browse/${hebrewYear}/${entry.occasionId}`}>
              <span className="year-row-year">{occasionTitle(entry, language)}</span>
              <span className="year-row-trailing">
                <OccasionRowIcon entry={entry} progressMap={progressMap} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
