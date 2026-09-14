import { Link, useParams } from 'react-router-dom';
import type { PdfSection } from '@sichos-kodesh/catalog';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { useTranslation } from '../i18n/useLanguage';
import { BackLink } from '../components/BackLink';

interface Props {
  resolved: ResolvedEntry;
}

/**
 * One PDF section's (mugah/biltiMugah/maamorim/hagahos/hosofos) own page,
 * reached via FarbrengenScreen's collapsed "More from this occasion"
 * section - kept off the main occasion page instead of listed inline
 * there, since an occasion can have PDFs
 * across every section at once and a Sefer-vs-Toras-Menachem-vs-Sichos-
 * Kodesh label makes little sense without its category header for
 * context (hagahos's "צילום 1"/"צילום 2" - literally "scan 1"/"scan 2" -
 * being the clearest real example).
 */
export function CategoryScreen({ resolved }: Props) {
  const { section } = useParams<{ section: PdfSection }>();
  const { t } = useTranslation();
  const { entry, basePath } = resolved;

  const pdfs = entry.pdfs.filter((pdf) => pdf.section === section);

  return (
    <div className="screen">
      <BackLink to={basePath}>{t.back}</BackLink>
      <h1>{section ? t.sectionLabels[section] : ''}</h1>
      <p className="subtitle">{entry.occasionLabel}</p>

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
