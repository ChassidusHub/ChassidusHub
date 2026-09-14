import { Link } from 'react-router-dom';
import { Music } from 'lucide-react';
import type { CatalogPdf, PdfEdition } from '@sichos-kodesh/catalog';
import { classifyPdfEdition, isHighlightedFarbrengenHanacha } from '@sichos-kodesh/catalog';
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
 * A farbrengen's own biltiMugah hanacha is real, separately-catalogued
 * more than once when it survives under both the Toras Menachem and Sichos
 * Kodesh series (`isHighlightedFarbrengenHanacha` matches either) - the
 * same sicha, not two different ones, so showing both as equal-weight
 * cards was really just "the same reading, twice." Picks one, preferring
 * Sichos Kodesh (this app's own namesake series) when both exist; the
 * other stays reachable, just not as the primary card - see its caller.
 */
const PRIMARY_HANACHA_EDITION_PRIORITY: PdfEdition[] = ['sichosKodesh', 'torasMenachem'];

function pickPrimaryHanacha(pdfs: CatalogPdf[]): CatalogPdf | null {
  const highlighted = pdfs.filter(isHighlightedFarbrengenHanacha);
  if (highlighted.length === 0) return null;
  for (const edition of PRIMARY_HANACHA_EDITION_PRIORITY) {
    const match = highlighted.find((pdf) => classifyPdfEdition(pdf.label).includes(edition));
    if (match) return match;
  }
  return highlighted[0]!;
}

/**
 * Every occasion's own page, everywhere it's reached from (follow, browse,
 * this-week-all-years, occasion-all-years) - reflects what a farbrengen
 * actually is: its own hanacha (and its recordings, when there are any)
 * *are* the farbrengen, so they're shown inline and first. When both a
 * Toras Menachem and a Sichos Kodesh edition of the same hanacha are
 * catalogued, only one shows here (see pickPrimaryHanacha) - the same
 * sicha isn't two separate cards. Mugah (the later Rebbe-edited text), the
 * maamar, hagahos, hosofos, and any other-edition hanacha are real and
 * worth keeping reachable, but they're a different kind of thing - demoted
 * into a collapsed "More from this occasion" section rather than listed as
 * equal buttons alongside the sichos itself. Used to be split from a
 * separate, flatter OccasionScreen for /browse specifically; unified here
 * since browsing a plain year deserves the same treatment as following one.
 */
export function FarbrengenScreen({ resolved }: Props) {
  const { t } = useTranslation();
  const player = usePlayer();
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

  const primaryHanacha = pickPrimaryHanacha(entry.pdfs);
  // Any OTHER biltiMugah PDF - the non-chosen hanacha edition (see
  // pickPrimaryHanacha) included - lands in "more" rather than disappearing
  // outright, so it's still reachable when someone specifically wants the
  // other edition.
  const leftoverBiltiMugah = entry.pdfs.filter((pdf) => pdf.section === 'biltiMugah' && pdf.driveFileId !== primaryHanacha?.driveFileId);
  const secondaryCounts = countBySecondarySection(entry.pdfs);
  const secondarySectionsPresent = SECONDARY_SECTIONS.filter((section) => secondaryCounts[section]);
  const hasMore = leftoverBiltiMugah.length > 0 || secondarySectionsPresent.length > 0;
  const isEmpty = entry.audio.length === 0 && !primaryHanacha && !hasMore;

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

      {isEmpty && <p className="gap-message">{t.nothingDownloadable}</p>}

      {entry.audio.length > 0 && (
        <Link className="category-row" to={`${basePath}/recordings`}>
          <span className="category-row-name">
            <Music size={16} className="year-row-audio-icon" aria-hidden /> {t.recordings}
          </span>
          <span className="category-row-count">{t.recordingsCount(entry.audio.length)}</span>
        </Link>
      )}

      {primaryHanacha && (
        <div className="card">
          <p className="pdf-label">{primaryHanacha.label}</p>
          <Link className="button" to={`${basePath}/pdf/${encodeURIComponent(primaryHanacha.driveFileId)}`} onClick={handleReadHanacha}>
            {t.read}
          </Link>
        </div>
      )}

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
