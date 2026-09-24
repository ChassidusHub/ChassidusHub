import { Link } from 'react-router-dom';
import { occasionTitle } from '@sichos-kodesh/app-core';
import type { CatalogPdf } from '@sichos-kodesh/catalog';
import { isHighlightedFarbrengenHanacha } from '@sichos-kodesh/catalog';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { playlistForEntry } from '../player/playerContext';
import { usePlayer } from '../player/usePlayer';
import { useRecordVisit } from '../player/useRecordVisit';
import { useProgressMap } from '../player/useProgressMap';
import { useAutoplayOnHanacha } from '../settings/useAutoplayOnHanacha';
import { useTranslation } from '../i18n/useLanguage';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { BackLink } from '../components/BackLink';
import { ScreenHeader } from '../components/ScreenHeader';
import { OccasionActions } from '../components/OccasionActions';
import { PlaylistPlayButton } from '../components/PlaylistPlayButton';

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
  const { t, language } = useTranslation();
  const player = usePlayer();
  const progressMap = useProgressMap();
  const [autoplayOnHanacha] = useAutoplayOnHanacha();
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
   * Opening the hanacha also starts its recording, unless it's already this
   * occasion's own recording that's active (playing or paused) - then it's
   * left exactly as it is, never restarted from chapter 0, regardless of
   * `autoplayOnHanacha` (that setting only decides whether to override a
   * *different* occasion's recording, not whether to rewind this one's).
   * Otherwise, if a different recording is already playing,
   * `autoplayOnHanacha` decides whether to override it or leave it running
   * (see useAutoplayOnHanacha).
   */
  function handleReadHanacha(): void {
    if (entry.audio.length === 0) return;
    const isThisPlaylistActive = player.playlist?.title === entry.occasionLabel;
    if (isThisPlaylistActive) return;
    const differentRecordingPlaying = player.playing && player.playlist !== null;
    if (differentRecordingPlaying && !autoplayOnHanacha) return;
    player.play(playlistForEntry(entry), 0);
  }

  return (
    <div className="screen">
      <ScreenHeader to={backPath} title={occasionTitle(entry, language)} />
      {/* `subtitle` is this occasion's own day+month only (see
          useResolvedEntry) - the year is appended here, not folded into
          that shared field, so this page shows its occasion's full date
          without changing what every other consumer of `subtitle`
          expects it to mean. */}
      <p className="subtitle">
        {subtitle} {hebrewYearLabel(entry.hebrewYear, language)}
      </p>

      <OccasionActions entry={entry} />

      {isEmpty && <p className="gap-message">{t.nothingDownloadable}</p>}

      {entry.audio.length > 0 && (
        <Link className="category-row" to={`${basePath}/recordings`}>
          <span className="category-row-name">{t.recordings}</span>
          <span className="category-row-trailing">
            <span className="category-row-count">{t.recordingsCount(entry.audio.length)}</span>
            <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="compact" />
          </span>
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

      {hasMore &&
        (() => {
          const rows = (
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
          );
          // With no hanacha at all, this isn't secondary/"more" content
          // relative to anything - it's the only content this occasion
          // has, so it's shown directly rather than demoted behind a
          // collapsed toggle meant for when the hanacha is the lead content.
          return hanachaPdfs.length > 0 ? (
            <details className="more-section">
              <summary className="more-section-summary">{t.moreFromThisOccasion}</summary>
              {rows}
            </details>
          ) : (
            <div className="more-section-standalone">{rows}</div>
          );
        })()}

      <Link className="category-row" to={`/occasion-all-years/${entry.hebrewYear}/${entry.occasionId}`}>
        <span className="category-row-name">{t.thisOccasionAllYears}</span>
      </Link>
    </div>
  );
}
