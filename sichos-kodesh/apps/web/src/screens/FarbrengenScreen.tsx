import { Link } from 'react-router-dom';
import { Music } from 'lucide-react';
import type { CatalogPdf } from '@sichos-kodesh/catalog';
import { PDF_SECTION_LABELS, isHighlightedFarbrengenHanacha, sortPdfsByEditionPreference } from '@sichos-kodesh/catalog';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { useEditionPreference } from '../settings/editionPreference';
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
  const [editionPreference] = useEditionPreference();

  if (!resolved) {
    return (
      <div className="screen">
        <BackLink to="/">home</BackLink>
        <p className="gap-message">This occasion couldn't be found - the link may be out of date.</p>
      </div>
    );
  }

  const { entry, subtitle, basePath, backPath, backLabel } = resolved;

  const highlighted = sortPdfsByEditionPreference(entry.pdfs.filter(isHighlightedFarbrengenHanacha), editionPreference);
  const leftoverBiltiMugah = entry.pdfs.filter((pdf) => pdf.section === 'biltiMugah' && !isHighlightedFarbrengenHanacha(pdf));
  const secondaryCounts = countBySecondarySection(entry.pdfs);
  const secondarySectionsPresent = SECONDARY_SECTIONS.filter((section) => secondaryCounts[section]);
  const hasMore = leftoverBiltiMugah.length > 0 || secondarySectionsPresent.length > 0;
  const isEmpty = entry.audio.length === 0 && highlighted.length === 0 && !hasMore;

  return (
    <div className="screen">
      <BackLink to={backPath}>{backLabel}</BackLink>
      <h1>{entry.occasionLabel}</h1>
      <p className="subtitle">{subtitle}</p>

      {isEmpty && <p className="gap-message">Nothing downloadable is indexed for this occasion yet.</p>}

      {entry.audio.length > 0 && (
        <Link className="category-row" to={`${basePath}/recordings`}>
          <span className="category-row-name">
            <Music size={16} className="year-row-audio-icon" aria-hidden /> Recordings
          </span>
          <span className="category-row-count">
            {entry.audio.length} recording{entry.audio.length === 1 ? '' : 's'}
          </span>
        </Link>
      )}

      {highlighted.map((pdf) => (
        <div key={pdf.driveFileId} className="card">
          <p className="pdf-label">{pdf.label}</p>
          <Link className="button" to={`${basePath}/pdf/${encodeURIComponent(pdf.driveFileId)}`}>
            Read
          </Link>
        </div>
      ))}

      {hasMore && (
        <details className="more-section">
          <summary className="more-section-summary">More from this occasion</summary>
          <ul className="category-list">
            {secondarySectionsPresent.map((section) => (
              <li key={section}>
                <Link className="category-row" to={`${basePath}/category/${section}`}>
                  <span className="category-row-name">{PDF_SECTION_LABELS[section]}</span>
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
    </div>
  );
}
