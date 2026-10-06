import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { mafteiachMonthName, mafteiachMonthNameHebrew, mafteiachMonthToken } from '@sichos-kodesh/catalog';
import { occasionTitle } from '@sichos-kodesh/app-core';
import { useCatalog } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useProgressMap } from '../player/useProgressMap';
import { useDownload } from '../download/useDownload';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useTranslation } from '../i18n/useLanguage';
import { farbrengenPath } from '../routes/links';

interface Props {
  sourceYear: number;
  monthToken: string;
}

/** Follow-flow twin of MonthOccasionsScreen: links rows to /follow/:sourceYear/:occasionId instead of /browse/:hebrewYear/:occasionId, so they still get FarbrengenScreen's highlighted-hanacha treatment. */
export function FollowMonthOccasionsScreen({ sourceYear, monthToken }: Props) {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const { enqueueBulk } = useDownload();
  const online = useOnlineStatus();
  const entries: CatalogEntry[] = (catalog[sourceYear] ?? []).filter(
    (e) => (e.audio.length > 0 || e.pdfs.length > 0) && mafteiachMonthToken(e.hebrewDate) === monthToken,
  );
  const monthName = (language === 'he' ? mafteiachMonthNameHebrew : mafteiachMonthName)(`${sourceYear}-${monthToken}-01`);

  return (
    <div className="screen">
      <ScreenHeader to={`/follow/${sourceYear}/month`} title={monthName} />
      <p className="subtitle">{t.occasionsIndexed(entries.length)}</p>
      <ul className="year-list">
        {entries.map((entry) => (
          <li key={entry.occasionId}>
            <Link className="year-row" to={farbrengenPath(entry.hebrewYear, entry.occasionId)}>
              <span className="year-row-year">{occasionTitle(entry, language)}</span>
              <span className="year-row-trailing">
                <OccasionRowIcon entry={entry} progressMap={progressMap} />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {entries.length > 0 && online && (
        <button type="button" className="button" onClick={() => enqueueBulk(entries)}>
          <Download size={16} aria-hidden /> {t.downloadThisMonthLabel}
        </button>
      )}
    </div>
  );
}
