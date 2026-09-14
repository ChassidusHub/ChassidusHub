import { Link } from 'react-router-dom';
import type { CatalogEntry, PdfSection } from '@sichos-kodesh/catalog';
import { PDF_SECTION_ORDER } from '@sichos-kodesh/catalog';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  entry: CatalogEntry;
  /** This occasion's own URL - Recordings/category pages are nested under it (see routes/useResolvedEntry.ts). */
  basePath: string;
}

function countBySection(entry: CatalogEntry): Partial<Record<PdfSection, number>> {
  const counts: Partial<Record<PdfSection, number>> = {};
  for (const pdf of entry.pdfs) counts[pdf.section] = (counts[pdf.section] ?? 0) + 1;
  return counts;
}

/**
 * An occasion's own landing page: one button per category of content it
 * actually has (Recordings, then each PDF section present) rather than
 * every recording and every PDF listed inline here - an occasion can have
 * PDFs across every section at once, so that used to mean a very long
 * page mixing hanachos with mugah/hagahos/etc. all together. Tapping a
 * category navigates to its own page (RecordingsScreen, CategoryScreen).
 */
export function OccasionDetail({ entry, basePath }: Props) {
  const { t } = useTranslation();
  const sectionCounts = countBySection(entry);
  const sectionsPresent = PDF_SECTION_ORDER.filter((section) => sectionCounts[section]);

  if (entry.audio.length === 0 && sectionsPresent.length === 0) {
    return <p className="gap-message">{t.nothingDownloadable}</p>;
  }

  return (
    <ul className="category-list">
      {entry.audio.length > 0 && (
        <li>
          <Link className="category-row" to={`${basePath}/recordings`}>
            <span className="category-row-name">{t.recordings}</span>
            <span className="category-row-count">{t.recordingsCount(entry.audio.length)}</span>
          </Link>
        </li>
      )}
      {sectionsPresent.map((section) => (
        <li key={section}>
          <Link className="category-row" to={`${basePath}/category/${section}`}>
            <span className="category-row-name">{t.sectionLabels[section]}</span>
            <span className="category-row-count">{sectionCounts[section]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
