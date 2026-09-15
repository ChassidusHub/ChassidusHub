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
import { useTranslation } from '../i18n/useLanguage';
import { BackLink } from '../components/BackLink';

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
 * Every occasion's own page, everywhere it's reached from (follow, browse,
 * this-week-all-years, occasion-all-years) - reflects what a farbrengen
 * actually is: its own hanacha (and its recordings, when there are any)
 * *are* the farbrengen, so they're shown inline and first. Toras Menachem
 * and Sichos Kodesh are two distinct, separately-transcribed editions, not
 * duplicates of each other - when an occasion has both (or more than one
 * citation of the same edition, e.g. a later "hashlamos" supplement), every
 * one of them shows here as its own card (see `isHighlightedFarbrengenHanacha`).
 * Mugah (the later Rebbe-edited text), the maamar, hagahos, hosofos, and any
 * biltiMugah PDF citing some other, unrelated source are a different kind of
 * thing - demoted into a collapsed "More from this occasion" section rather
 * than listed alongside the sichos itself. Used to be split from a separate,
 * flatter OccasionScreen for /browse specifically; unified here since
 * browsing a plain year deserves the same treatment as following one.
 */
export function FarbrengenScreen({ resolved }: Props) {
  const { t } = useTranslation();
  const player = usePlayer();
  const [autoplayOnHanacha] = useAutoplayOnHanacha();
  const { downloadOccasion } = useDownload();
  const downloadState = useDownloadState(resolved?.entry);
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

  // Toras Menachem and Sichos Kodesh are two distinct, separately-transcribed
  // editions of the same sicha - both real content, so both get their own
  // card rather than picking one as "primary" and burying the other. A
  // biltiMugah PDF citing neither edition is a genuinely different
  // citation - some other, unrelated source (a real but minority case -
  // letters, memorial booklets, etc.) - and stays demoted into "more".
  const hanachaPdfs = entry.pdfs.filter(isHighlightedFarbrengenHanacha);
  const otherBiltiMugah = entry.pdfs.filter((pdf) => pdf.section === 'biltiMugah' && !isHighlightedFarbrengenHanacha(pdf));
  const secondaryCounts = countBySecondarySection(entry.pdfs);
  const secondarySectionsPresent = SECONDARY_SECTIONS.filter((section) => secondaryCounts[section]);
  const hasMore = otherBiltiMugah.length > 0 || secondarySectionsPresent.length > 0;
  const isEmpty = entry.audio.length === 0 && hanachaPdfs.length === 0 && !hasMore;

  /**
   * Opening the hanacha always starts its recording too - the one
   * exception is a *different* recording already actively playing, where
   * starting this one would silently cut it off; there, the
   * autoplayOnHanacha setting decides whether to override it (its only
   * remaining job - see useAutoplayOnHanacha's doc comment) or leave it
   * running and not start this one.
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
          {(downloadState === 'queued' || downloadState === 'downloading') && (
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
