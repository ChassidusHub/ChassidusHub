import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { listDownloadedEntries } from '../download/downloadManager';
import { useDownload } from '../download/useDownload';
import { useActiveDownloadRows } from '../download/useActiveDownloads';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

interface YearGroup {
  hebrewYear: number;
  entries: CatalogEntry[];
}

function groupByYear(entries: CatalogEntry[]): YearGroup[] {
  const byYear = new Map<number, CatalogEntry[]>();
  for (const entry of entries) byYear.set(entry.hebrewYear, [...(byYear.get(entry.hebrewYear) ?? []), entry]);
  return [...byYear.entries()].sort(([a], [b]) => a - b).map(([hebrewYear, yearEntries]) => ({ hebrewYear, entries: yearEntries }));
}

/**
 * Every occasion currently downloaded, using the same "downloaded"
 * definition (targets under the current content-type settings, all
 * present in the shared media cache) as the download-state icon uses
 * elsewhere. Not gated on being offline - useful any time, not only when
 * there's no connection.
 */
export function DownloadedScreen() {
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const { settings } = useDownload();
  const activeRows = useActiveDownloadRows();
  const allEntries = useMemo(() => Object.values(catalog).flat(), []);
  const [downloaded, setDownloaded] = useState<CatalogEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Keeps the previous result on screen during the re-check rather than
    // resetting to a loading state on every effect run.
    void listDownloadedEntries(allEntries, settings.contentTypes).then((entries) => {
      if (!cancelled) setDownloaded(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [allEntries, settings.contentTypes]);

  const yearGroups = useMemo(() => (downloaded ? groupByYear(downloaded) : []), [downloaded]);

  return (
    <div className="screen">
      <ScreenHeader to="/" title={t.downloadedContentTitle} />
      <p className="tab-help">{t.downloadedContentHelp}</p>

      {activeRows.length > 0 && (
        <div className="active-downloads-section">
          <p className="category-header">{t.downloadsInProgressTitle}</p>
          <ul className="active-downloads-list">
            {activeRows.map((row) => (
              <li key={row.key} className="active-download-row">
                <span className="active-download-row-label">{row.label}</span>
                <span className="active-download-row-track" aria-hidden>
                  <span className="active-download-row-fill" style={{ width: `${row.percent}%` }} />
                </span>
                <span className="active-download-row-percent">{row.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {downloaded && downloaded.length === 0 && activeRows.length === 0 && <p className="gap-message">{t.noDownloadedContent}</p>}

      {yearGroups.map(({ hebrewYear, entries }) => (
        <div key={hebrewYear}>
          <p className="category-header">{hebrewYearLabel(hebrewYear, language)}</p>
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
      ))}
    </div>
  );
}
