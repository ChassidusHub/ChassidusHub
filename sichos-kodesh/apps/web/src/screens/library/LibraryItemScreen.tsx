import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { LibraryItemBase } from '@sichos-kodesh/catalog';
import { itemFacts, linkedOccasion, occasionTitle } from '@sichos-kodesh/app-core';
import { useCatalog } from '../../catalog/catalogStore';
import { PlaylistPlayButton } from '../../components/PlaylistPlayButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { useProgressMap } from '../../player/useProgressMap';
import type { LibraryItemRoute } from '../../routes/useLibraryItem';
import { formatDuration, totalDurationSeconds } from '../../utils/formatDuration';

interface Props {
  route: LibraryItemRoute;
}

/** One item of the library: what it is, the farbrengen it was said at, its recordings and its documents. */
export function LibraryItemScreen({ route }: Props) {
  const { collection, item, resolved } = route;
  const catalog = useCatalog();
  const progressMap = useProgressMap();
  const { t, language } = useTranslation();
  const occasion = useMemo(() => linkedOccasion(catalog, item), [catalog, item]);
  const { entry, basePath } = resolved;
  const record = item as LibraryItemBase & Record<string, unknown>;
  const title = collection === 'maamorim' && typeof record.diburHamaschil === 'string' ? record.diburHamaschil : item.label;
  const facts = itemFacts(collection, item, {
    saidAt: t.librarySaidAt,
    printedIn: t.libraryPrintedIn,
    hemshech: t.libraryHemshech,
    kuntres: t.libraryKuntres,
    hasTranslation: t.libraryHasTranslation,
    hasTranscript: t.libraryHasTranscript,
  });
  const disputed = collection === 'likkuteiSichos' && record.supplement === true;

  return (
    <div className="screen">
      <ScreenHeader to={resolved.backPath} title={t.collectionNames[collection]} />
      <h1 className="library-item-title">{title}</h1>
      {resolved.subtitle && <p className="subtitle">{resolved.subtitle}</p>}
      {facts.map((fact) => (
        <p key={fact} className="library-item-fact">
          {fact}
        </p>
      ))}
      {disputed && <p className="tab-help">{t.libraryDisputedNote}</p>}

      {occasion && (
        <Link className="category-row" to={`/browse/${occasion.hebrewYear}/${occasion.occasionId}`}>
          <span className="category-row-name">{t.libraryOpenFarbrengen}</span>
          <span className="category-row-count">{occasionTitle(occasion, language)}</span>
        </Link>
      )}

      {entry.audio.length > 0 && (
        <div className="playlist-header">
          <div className="playlist-header-main">
            <Link className="playlist-header-copy" to={`${basePath}/recordings`}>
              <span className="playlist-header-title">{t.recordingsCount(entry.audio.length)}</span>
              <span className="playlist-header-subtitle">{formatDuration(totalDurationSeconds(entry.audio))}</span>
            </Link>
          </div>
          <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="compact" />
        </div>
      )}

      {entry.pdfs.length > 0 && (
        <div className="category">
          <h2 className="category-header">{t.libraryDocuments}</h2>
          <ul className="year-list">
            {entry.pdfs.map((pdf) => (
              <li key={pdf.driveFileId}>
                <Link className="year-row" to={`${basePath}/pdf/${encodeURIComponent(pdf.driveFileId)}`}>
                  <span className="year-row-year">{pdf.label}</span>
                  <span className="year-row-trailing">
                    <FileText size={18} aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.audio.length === 0 && entry.pdfs.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-text">{t.libraryNoFiles}</p>
        </div>
      )}
    </div>
  );
}
