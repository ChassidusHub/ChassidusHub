import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { CatalogScan } from '@sichos-kodesh/catalog';
import { authorShelf, hebrewBooksUrl, names, scanLabel, searchShelf, sharedLabels } from '@sichos-kodesh/app-core';
import { useShelf, useWorks } from '../../catalog/catalogStore';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { LibraryLoading } from '../library/LibraryLoading';
import { rebbePath, scansPath } from '../../routes/links';

/** Only a long list gets a filter. */
const FILTER_FROM = 12;

interface Props {
  /** The author, or null for the Chabad books by anyone else. */
  authorId: string | null;
  /** One series of the author's list, by its index. */
  series?: number;
}

/**
 * One book, opening on its page at hebrewbooks.org: its name, and its pages
 * beside the link. Where it was printed only with `printed`, for the rows
 * whose name alone doesn't tell them apart (sharedLabels). Same as the phone's.
 */
export function ScanRow({ scan, label, printed = false }: { scan: CatalogScan; label: string; printed?: boolean }) {
  const { t } = useTranslation();
  return (
    <li>
      <a className="year-row library-item-row" href={hebrewBooksUrl(scan.id)} target="_blank" rel="noreferrer">
        <span className="library-item-text">
          <span className="year-row-year">{label}</span>
          {printed && scan.printed && <span className="library-item-subtitle">{scan.printed}</span>}
        </span>
        <span className="year-row-trailing">
          {scan.pages ? <span className="year-row-distance">{t.shelfPages(scan.pages)}</span> : null}
          <ExternalLink size={16} aria-hidden />
        </span>
      </a>
    </li>
  );
}

/**
 * An author's books on HebrewBooks that no sefer here holds, or the Chabad
 * books by anyone else: series by series, each book opening on its page at
 * hebrewbooks.org. Headed by the author's name alone (the help line says
 * HebrewBooks). Same as the phone's.
 */
export function HebrewBooksShelfScreen({ authorId, series: seriesIndex }: Props) {
  const shelf = useShelf();
  const works = useWorks();
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');
  const all = useMemo(() => authorShelf(shelf, authorId), [shelf, authorId]);
  const shown = useMemo(() => searchShelf(all, query), [all, query]);
  const author = works?.authors.find((a) => a.id === authorId);
  const authorName = author ? names(author.name, language) : t.shelfOthers;
  const one = seriesIndex !== undefined ? all[seriesIndex] : undefined;

  if (!shelf || !works) {
    return (
      <div className="screen">
        <ScreenHeader to={rebbePath(authorId)} title={t.seforimTitle} />
        <LibraryLoading />
      </div>
    );
  }

  if (seriesIndex !== undefined) {
    const shared = sharedLabels((one?.scans ?? []).map(scanLabel));
    return (
      <div className="screen">
        <ScreenHeader to={scansPath(authorId)} title={one?.title ?? authorName} />
        {one ? (
          <ul className="year-list">
            {one.scans.map((scan) => (
              <ScanRow key={scan.id} scan={scan} label={scanLabel(scan)} printed={shared.has(scanLabel(scan))} />
            ))}
          </ul>
        ) : (
          <p className="search-results-count">{t.shelfNothing}</p>
        )}
        <p className="tab-help">{t.shelfCredit}</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader to={rebbePath(authorId)} title={authorName} />
      <p className="tab-help">{t.shelfHelp}</p>
      {all.length >= FILTER_FROM && (
        <input
          className="search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.shelfFilter}
          aria-label={t.shelfFilter}
          dir="auto"
        />
      )}
      {shown.length === 0 ? (
        <p className="search-results-count">{t.shelfNothing}</p>
      ) : (
        <ul className="year-list">
          {shown.map((series) =>
            series.scans.length === 1 ? (
              <ScanRow key={series.title} scan={series.scans[0]!} label={series.scans[0]!.title} />
            ) : (
              <li key={series.title}>
                <Link className="year-row" to={scansPath(authorId, all.findIndex((s) => s.title === series.title))}>
                  <span className="year-row-year">{series.title}</span>
                  <span className="year-row-distance">{t.shelfBooks(series.scans.length)}</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
      <p className="tab-help">{t.shelfCredit}</p>
    </div>
  );
}
