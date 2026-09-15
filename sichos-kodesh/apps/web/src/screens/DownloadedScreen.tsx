import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { listDownloadedEntries } from '../download/downloadManager';
import { useDownload } from '../download/useDownload';
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
 * Reached from the home screen's offline note - every occasion actually
 * available offline right now, across every year, using the exact same
 * "downloaded" definition (this occasion's targets under the *current*
 * content-type settings, all present in the shared media cache) the
 * download-state icon uses everywhere else. Not scoped to being offline
 * itself - useful any time someone wants to see what's actually on the
 * device, not just when there's no connection to fall back from.
 */
export function DownloadedScreen() {
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const { settings } = useDownload();
  const allEntries = useMemo(() => Object.values(catalog).flat(), []);
  const [downloaded, setDownloaded] = useState<CatalogEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Content-type settings changing while this screen is already open is
    // rare (that toggle lives on its own separate settings screen) - the
    // previous result staying on screen for the moment it takes to
    // re-check the cache is preferable to a synchronous reset-to-loading
    // on every effect run.
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
      <BackLink to="/" />
      <h1>{t.downloadedContentTitle}</h1>
      <p className="tab-help">{t.downloadedContentHelp}</p>

      {downloaded && downloaded.length === 0 && <p className="gap-message">{t.noDownloadedContent}</p>}

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
