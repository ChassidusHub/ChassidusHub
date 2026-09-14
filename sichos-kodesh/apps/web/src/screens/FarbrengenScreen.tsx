import { Link } from 'react-router-dom';
import { Music } from 'lucide-react';
import type { CatalogPdf } from '@sichos-kodesh/catalog';
import { isHighlightedFarbrengenHanacha } from '@sichos-kodesh/catalog';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { usePlayer } from '../player/usePlayer';
import { useRecordVisit } from '../player/useRecordVisit';
import { useAutoplayOnHanacha } from '../settings/useAutoplayOnHanacha';
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
 * The "follow this week" flow's own occasion page - unlike the generic
 * OccasionScreen (still used for /browse, which treats every section as an
 * equal-weight category), this one reflects what a farbrengen actually is:
 * its own Toras Menachem/Sichos Kodesh hanacha (and its recordings, when
 * there are any) *are* the farbrengen, so they're shown inline and first.
 * Mugah (the later Rebbe-edited text), the maamar, hagahos, and hosofos are
 * real and worth keeping reachable, but they're a different kind of thing -
 * demoted into a collapsed "More from this occasion" section rather than
 * listed as equal buttons alongside the sichos themselves.
 */
export function FarbrengenScreen({ resolved }: Props) {
  const { t } = useTranslation();
  const player = usePlayer();
  const [autoplayOnHanacha] = useAutoplayOnHanacha();
  useRecordVisit(resolved?.entry);

  if (!resolved) {
    return (
      <div className="screen">
        <BackLink to="/">{t.home}</BackLink>
        <p className="gap-message">{t.occasionNotFound}</p>
      </div>
    );
  }

  const { entry, subtitle, basePath, backPath, backLabel } = resolved;

  const highlighted = entry.pdfs.filter(isHighlightedFarbrengenHanacha);
  const leftoverBiltiMugah = entry.pdfs.filter((pdf) => pdf.section === 'biltiMugah' && !isHighlightedFarbrengenHanacha(pdf));
  const secondaryCounts = countBySecondarySection(entry.pdfs);
  const secondarySectionsPresent = SECONDARY_SECTIONS.filter((section) => secondaryCounts[section]);
  const hasMore = leftoverBiltiMugah.length > 0 || secondarySectionsPresent.length > 0;
  const isEmpty = entry.audio.length === 0 && highlighted.length === 0 && !hasMore;

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
      <BackLink to={backPath}>{backLabel}</BackLink>
      <h1>{entry.occasionLabel}</h1>
      <p className="subtitle">{subtitle}</p>

      {isEmpty && <p className="gap-message">{t.nothingDownloadable}</p>}

      {entry.audio.length > 0 && (
        <Link className="category-row" to={`${basePath}/recordings`}>
          <span className="category-row-name">
            <Music size={16} className="year-row-audio-icon" aria-hidden /> {t.recordings}
          </span>
          <span className="category-row-count">{t.recordingsCount(entry.audio.length)}</span>
        </Link>
      )}

      {highlighted.map((pdf) => (
        <div key={pdf.driveFileId} className="card">
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
            {leftoverBiltiMugah.map((pdf) => (
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
