import { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { LibraryItemBase } from '@sichos-kodesh/catalog';
import { itemDescription, itemTitle, linkedOccasion, occasionTitle } from '@sichos-kodesh/app-core';
import { useCatalog } from '../../catalog/catalogStore';
import { ChapterList } from '../../components/ChapterList';
import { DownloadAllChapters } from '../../components/DownloadAllChapters';
import { OccasionActions } from '../../components/OccasionActions';
import { PlaylistPlayButton } from '../../components/PlaylistPlayButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { useProgressMap } from '../../player/useProgressMap';
import { FARBRENGEN_AUDIO_ANCHOR, FARBRENGEN_TEXTS_ANCHOR, farbrengenPath, libraryItemPdfPath } from '../../routes/links';
import type { LibraryItemRoute } from '../../routes/useLibraryItem';
import { formatDuration, totalDurationSeconds } from '../../utils/formatDuration';

interface Props {
  route: LibraryItemRoute;
}

/**
 * One item of the library - a sicha, a maamar, a yoman, a hadran, a
 * michtav, a recording - on one page (docs: the UI/UX redo plan,
 * "הספרייה"), laid out like a farbrengen's: what it is and where it comes
 * from, the farbrengen it was said at, its texts (each row opening its
 * PDF), then its recordings with Play and the chapters right under it.
 */
export function LibraryItemScreen({ route }: Props) {
  const { collection, item, resolved } = route;
  const catalog = useCatalog();
  const progressMap = useProgressMap();
  const { t, language } = useTranslation();
  const { hash } = useLocation();
  const occasion = useMemo(() => linkedOccasion(catalog, item), [catalog, item]);
  const { entry, backPath } = resolved;
  const record = item as LibraryItemBase & Record<string, unknown>;
  const title = itemTitle(collection, item, language);
  // The whole name a shortened title stands for (a maamar's facts already say where it was said in full).
  const description = collection === 'maamorim' ? undefined : itemDescription(collection, item, language);
  const disputed = collection === 'likkuteiSichos' && record.supplement === true;

  // An old recordings address lands here on its section (see canonicalLibraryPath).
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash, entry]);

  return (
    <div className="screen">
      <ScreenHeader to={backPath} title={t.collectionNames[collection]} />
      <h1 className="library-item-title">{title}</h1>
      {description && <p className="item-description">{description}</p>}
      {resolved.subtitle && <p className="subtitle">{resolved.subtitle}</p>}
      {disputed && <p className="tab-help">{t.libraryDisputedNote}</p>}

      <OccasionActions entry={entry} showDownload={false} />

      {occasion && (
        <Link className="category-row" to={farbrengenPath(occasion.hebrewYear, occasion.occasionId)}>
          <span className="category-row-name">{t.libraryOpenFarbrengen}</span>
          <span className="category-row-count">{occasionTitle(occasion, language)}</span>
        </Link>
      )}

      {entry.pdfs.length > 0 && (
        <section className="farbrengen-section" id={FARBRENGEN_TEXTS_ANCHOR} aria-labelledby="item-texts-title">
          <h2 className="category-header" id="item-texts-title">
            {t.texts}
          </h2>
          <ul className="text-list">
            {entry.pdfs.map((pdf) => (
              <li key={pdf.driveFileId}>
                <Link className="text-row" to={libraryItemPdfPath(collection, item.id, pdf.driveFileId)}>
                  <FileText size={18} className="text-row-icon" aria-hidden />
                  <span className="text-row-label">{pdf.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry.audio.length > 0 && (
        <section className="farbrengen-section" id={FARBRENGEN_AUDIO_ANCHOR} aria-labelledby="item-audio-title">
          <div className="playlist-header">
            <div className="playlist-header-main">
              <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="large" />
              <div className="playlist-header-copy">
                <h2 className="playlist-header-title" id="item-audio-title">
                  {t.recordings}
                </h2>
                <p className="playlist-header-subtitle">
                  {t.recordingsCount(entry.audio.length)} · {formatDuration(totalDurationSeconds(entry.audio))}
                </p>
              </div>
            </div>
            <div className="playlist-header-side">
              <DownloadAllChapters entry={entry} />
            </div>
          </div>
          <ChapterList entry={entry} progressMap={progressMap} />
        </section>
      )}

      {entry.audio.length === 0 && entry.pdfs.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-text">{t.libraryNoFiles}</p>
        </div>
      )}
    </div>
  );
}
