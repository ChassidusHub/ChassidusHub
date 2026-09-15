import { Link } from 'react-router-dom';
import { CheckCircle2, Download, Loader2, Music } from 'lucide-react';
import type { CatalogPdf } from '@sichos-kodesh/catalog';
import { isHighlightedFarbrengenHanacha } from '@sichos-kodesh/catalog';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { usePlayer } from '../player/usePlayer';
import { useRecordVisit } from '../player/useRecordVisit';
import { useAutoplayOnHanacha } from '../settings/useAutoplayOnHanacha';
import { useDownload } from '../download/useDownload';
import { useDownloadState } from '../download/useDownloadState';
import { useDownloadProgress } from '../download/useDownloadProgress';
import { useTranslation } from '../i18n/useLanguage';
import { BackLink } from '../components/BackLink';
import { DownloadProgressRing } from '../components/DownloadProgressRing';

interface Props {
  resolved: ResolvedEntry | null;
}

const SECONDARY_SECTIONS = ['mugah', 'maamorim', 'hagahos', 'hosofos'] as const;

function countBySecondarySection(pdfs: CatalogPdf[]): Partial<Record<(typeof SECONDARY_SECTIONS)[number], number>> {
  const counts: Partial<Record<(typeof SECONDARY_SECTIONS)[number], number>> = {};
  for (const pdf of pdfs) {
    if ((SECONDARY_SECTIONS as readonly string[]).includes(pdf.section)) {
      counts[pdf.section as (typeof SECONDARY_SECTIONS)[number]] = (counts[pdf.section as (typeof SECONDARY_SECTIONS)[number]] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * An occasion's own page: its hanacha (and any recordings) are shown
 * inline and first, since together they *are* the farbrengen. Toras
 * Menachem and Sichos Kodesh are distinct, separately-transcribed
 * editions, not duplicates - when an occasion has both (or more than one
 * citation of an edition, e.g. a later "hashlamos" supplement), each
 * shows as its own card (see `isHighlightedFarbrengenHanacha`). Mugah
 * (the later Rebbe-edited text), the maamar, hagahos, hosofos, and any
 * biltiMugah PDF citing some other, unrelated source are a different
 * kind of content, demoted into a collapsed "More from this occasion"
 * section rather than listed alongside the sichos itself.
 */
export function FarbrengenScreen({ resolved }: Props) {
  const { t } = useTranslation();
  const player = usePlayer();
  const [autoplayOnHanacha] = useAutoplayOnHanacha();
  const { downloadOccasion } = useDownload();
  const downloadState = useDownloadState(resolved?.entry);
  const downloadProgress = useDownloadProgress(resolved?.entry);
  useRecordVisit(resolved?.entry);

  if (!resolved) {
    return (
      <div className="screen">
        <BackLink to="/" />
        <p className="gap-message">{t.occasionNotFound}</p>
      </div>
    );
  }

  const { entry, subtitle, basePath, backPath } = resolved;

  // A biltiMugah PDF citing neither edition is a different citation
  // entirely - e.g. a letter or memorial booklet - and stays demoted
  // into "more".
  const hanachaPdfs = entry.pdfs.filter(isHighlightedFarbrengenHanacha);
  const otherBiltiMugah = entry.pdfs.filter((pdf) => pdf.section === 'biltiMugah' && !isHighlightedFarbrengenHanacha(pdf));
  const secondaryCounts = countBySecondarySection(entry.pdfs);
  const secondarySectionsPresent = SECONDARY_SECTIONS.filter((section) => secondaryCounts[section]);
  const hasMore = otherBiltiMugah.length > 0 || secondarySectionsPresent.length > 0;
  const isEmpty = entry.audio.length === 0 && hanachaPdfs.length === 0 && !hasMore;

  /**
   * Opening the hanacha also starts its recording, unless a different
   * recording is already playing - then `autoplayOnHanacha` decides
   * whether to override it or leave it running (see
   * useAutoplayOnHanacha).
   */
  function handleReadHanacha(): void {
    if (entry.audio.length === 0) return;
    const differentRecordingPlaying = player.playing && player.playlist !== null && player.playlist.title !== entry.occasionLabel;
    if (differentRecordingPlaying && !autoplayOnHanacha) return;
    player.play({ title: entry.occasionLabel, audio: entry.audio, hebrewYear: entry.hebrewYear, occasionId: entry.occasionId }, 0);
  }

  return (
    <div className="screen">
      <BackLink to={backPath} />
      <h1>{entry.occasionLabel}</h1>
      <p className="subtitle">{subtitle}</p>

      {downloadState !== 'unavailable' && (
        <p className="occasion-download-state">
          {downloadState === 'downloaded' && (
            <>
              <CheckCircle2 size={16} className="download-state-done" aria-hidden /> {t.downloadedLabel}
            </>
          )}
          {downloadState === 'downloading' && downloadProgress !== undefined && (
            <>
              <DownloadProgressRing size={16} progress={downloadProgress} /> {t.downloadingLabel}
            </>
          )}
          {(downloadState === 'queued' || (downloadState === 'downloading' && downloadProgress === undefined)) && (
            <>
              <Loader2 size={16} className="download-state-spinner" aria-hidden /> {t.downloadingLabel}
            </>
          )}
          {downloadState === 'none' && (
            <button type="button" className="occasion-download-button" onClick={() => downloadOccasion(entry)}>
              <Download size={16} aria-hidden /> {t.downloadLabel}
            </button>
          )}
        </p>
      )}

      {isEmpty && <p className="gap-message">{t.nothingDownloadable}</p>}

      {entry.audio.length > 0 && (
        <Link className="category-row" to={`${basePath}/recordings`}>
          <span className="category-row-name">
            <Music size={16} className="year-row-audio-icon" aria-hidden /> {t.recordings}
          </span>
          <span className="category-row-count">{t.recordingsCount(entry.audio.length)}</span>
        </Link>
      )}

      {hanachaPdfs.map((pdf) => (
        <div className="card" key={pdf.driveFileId}>
          <p className="pdf-label">{pdf.label}</p>
          <Link className="button" to={`${basePath}/pdf/${encodeURIComponent(pdf.driveFileId)}`} onClick={handleReadHanacha}>
            {t.read}
          </Link>
        </div>
      ))}

      {hasMore && (
        <details className="more-section">
          <summary className="more-section-summary">{t.moreFromThisOccasion}</summary>
          <ul className="category-list">
            {secondarySectionsPresent.map((section) => (
              <li key={section}>
                <Link className="category-row" to={`${basePath}/category/${section}`}>
                  <span className="category-row-name">{t.sectionLabels[section]}</span>
                  <span className="category-row-count">{secondaryCounts[section]}</span>
                </Link>
              </li>
            ))}
            {otherBiltiMugah.map((pdf) => (
              <li key={pdf.driveFileId}>
                <Link className="category-row" to={`${basePath}/pdf/${encodeURIComponent(pdf.driveFileId)}`}>
                  <span className="category-row-name">{pdf.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Link className="category-row" to={`/occasion-all-years/${entry.hebrewYear}/${entry.occasionId}`}>
        <span className="category-row-name">{t.thisOccasionAllYears}</span>
      </Link>
    </div>
  );
}
