import { Link, useParams } from 'react-router-dom';
import type { PdfSection } from '@sichos-kodesh/catalog';
import { PDF_SECTION_LABELS, sortPdfsByEditionPreference } from '@sichos-kodesh/catalog';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { useEditionPreference } from '../settings/editionPreference';
import { BackLink } from '../components/BackLink';

interface Props {
  resolved: ResolvedEntry;
}

/**
 * One PDF section's (mugah/biltiMugah/maamorim/hagahos/hosofos) own page,
 * reached via its button on OccasionDetail - kept off the main occasion
 * page instead of listed inline there, since an occasion can have PDFs
 * across every section at once and a Sefer-vs-Toras-Menachem-vs-Sichos-
 * Kodesh label makes little sense without its category header for
 * context (hagahos's "צילום 1"/"צילום 2" - literally "scan 1"/"scan 2" -
 * being the clearest real example).
 */
export function CategoryScreen({ resolved }: Props) {
  const { section } = useParams<{ section: PdfSection }>();
  const [editionPreference] = useEditionPreference();
  const { entry, basePath } = resolved;

  const pdfs = entry.pdfs.filter((pdf) => pdf.section === section);
  const sorted = sortPdfsByEditionPreference(pdfs, editionPreference);

  return (
    <div className="screen">
      <BackLink to={basePath}>back</BackLink>
      <h1>{section ? PDF_SECTION_LABELS[section] : ''}</h1>
      <p className="subtitle">{entry.occasionLabel}</p>

      {sorted.map((pdf) => (
        <div key={pdf.driveFileId} className="card">
          <p className="pdf-label">{pdf.label}</p>
          <Link className="button" to={`${basePath}/pdf/${encodeURIComponent(pdf.driveFileId)}`}>
            Read
          </Link>
        </div>
      ))}
    </div>
  );
}
