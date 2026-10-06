import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { occasionTitle } from '@chassidushub-reader/app-core';
import { useCatalog } from '../catalog/catalogStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { OverflowMarquee } from '../components/OverflowMarquee';
import { SwipeToDelete } from '../components/SwipeToDelete';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { listDownloadedEntries, deleteEntryFromCache } from '../download/downloadManager';
import { useDownload } from '../download/useDownload';
import { useActiveDownloadRows } from '../download/useActiveDownloads';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';
import { MEDIA_CACHE_NAME } from '../download/cacheName';
import { clearAutoDownloadLedger } from '../download/downloadLedger';
import { clearPendingChapterDownloads } from '../download/pendingDownloads';
import { clearPendingEntryDownloads } from '../download/pendingEntryDownloads';
import { farbrengenPath } from '../routes/links';

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
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const { settings } = useDownload();
  const activeRows = useActiveDownloadRows();
  const allEntries = useMemo(() => Object.values(catalog).flat(), [catalog]);
  const [downloaded, setDownloaded] = useState<CatalogEntry[] | null>(null);

  function refreshDownloaded() {
    void listDownloadedEntries(allEntries, settings.contentTypes).then(setDownloaded);
  }

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

  async function deleteAllContent(): Promise<void> {
    await caches.delete(MEDIA_CACHE_NAME);
    clearAutoDownloadLedger();
    clearPendingChapterDownloads();
    clearPendingEntryDownloads();
    setDownloaded([]);
  }

  async function deleteOccasion(entry: CatalogEntry): Promise<void> {
    await deleteEntryFromCache(entry);
    refreshDownloaded();
  }

  return (
    <div className="screen">
      <ScreenHeader to="/me" title={t.downloadedContentTitle} />
      <p className="tab-help">{t.downloadedContentHelp}</p>

      {activeRows.length > 0 && (
        <div className="active-downloads-section">
          <p className="category-header">{t.downloadsInProgressTitle}</p>
          <ul className="active-downloads-list">
            {activeRows.map((row) => (
              <li key={row.key} className="active-download-row">
                <Link className="active-download-row-label active-download-row-link" to={farbrengenPath(row.hebrewYear, row.occasionId)}>
                  {row.label}
                </Link>
                <span className="active-download-row-track" aria-hidden>
                  <span className="active-download-row-fill" style={{ width: `${row.percent}%` }} />
                </span>
                <span className="active-download-row-percent">{row.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {downloaded && downloaded.length === 0 && activeRows.length === 0 && (
        <div className="empty-state">
          <Download size={40} className="empty-state-icon" />
          <p className="empty-state-text">{t.noDownloadedContent}</p>
        </div>
      )}

      {(downloaded && downloaded.length > 0) && (
        <ul className="year-list">
          <li className="settings-option-item">
            <button className="year-row settings-option-row" onClick={() => void deleteAllContent()}>
              <OverflowMarquee className="year-row-year settings-option-label" text={t.deleteContentLabel} />
            </button>
          </li>
        </ul>
      )}

      {yearGroups.map(({ hebrewYear, entries }) => (
        <div key={hebrewYear}>
          <p className="category-header">{hebrewYearLabel(hebrewYear, language)}</p>
          <ul className="year-list">
            {entries.map((entry) => (
              <li key={entry.occasionId}>
                <SwipeToDelete onDelete={() => void deleteOccasion(entry)}>
                  <Link className="year-row" to={farbrengenPath(hebrewYear, entry.occasionId)}>
                    <span className="year-row-year">{occasionTitle(entry, language)}</span>
                    <span className="year-row-trailing">
                      <OccasionRowIcon entry={entry} progressMap={progressMap} />
                    </span>
                  </Link>
                </SwipeToDelete>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
