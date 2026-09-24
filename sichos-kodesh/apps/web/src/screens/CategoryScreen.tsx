import { Link, useParams } from 'react-router-dom';
import type { PdfSection } from '@sichos-kodesh/catalog';
import { occasionTitle } from '@sichos-kodesh/app-core';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { useTranslation } from '../i18n/useLanguage';
import { ScreenHeader } from '../components/ScreenHeader';

interface Props {
  resolved: ResolvedEntry;
}

/**
 * A PDF section's own page rather than listed inline on the occasion
 * screen: a label like hagahos's "צילום 1"/"צילום 2" ("scan 1"/"scan 2")
 * doesn't make sense without its section header for context, and an
 * occasion can have PDFs across every section at once.
 */
export function CategoryScreen({ resolved }: Props) {
  const { section } = useParams<{ section: PdfSection }>();
  const { t, language } = useTranslation();
  const { entry, basePath } = resolved;

  const pdfs = entry.pdfs.filter((pdf) => pdf.section === section);

  return (
    <div className="screen">
      <ScreenHeader to={basePath} title={section ? t.sectionLabels[section] : ''} />
      <p className="subtitle">{occasionTitle(entry, language)}</p>

      {pdfs.map((pdf) => (
        <div key={pdf.driveFileId} className="card">
          <p className="pdf-label">{pdf.label}</p>
          <Link className="button" to={`${basePath}/pdf/${encodeURIComponent(pdf.driveFileId)}`}>
            {t.read}
          </Link>
        </div>
      ))}
    </div>
  );
}
