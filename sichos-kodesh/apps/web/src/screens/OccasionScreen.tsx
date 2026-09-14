import { Link } from 'react-router-dom';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { OccasionDetail } from '../components/OccasionDetail';

interface Props {
  resolved: ResolvedEntry | null;
}

/** Shared by the "follow" and "browse" routes - only the entry-resolution differs (see routes/useResolvedEntry.ts), the page itself doesn't care which. */
export function OccasionScreen({ resolved }: Props) {
  if (!resolved) {
    return (
      <div className="screen">
        <Link className="back-link" to="/">
          {'< home'}
        </Link>
        <p className="gap-message">This occasion couldn't be found - the link may be out of date.</p>
      </div>
    );
  }

  const { entry, subtitle, backPath, backLabel } = resolved;

  return (
    <div className="screen">
      <Link className="back-link" to={backPath}>
        {backLabel}
      </Link>
      <h1>{entry.occasionLabel}</h1>
      <p className="subtitle">{subtitle}</p>
      <OccasionDetail entry={entry} basePath={resolved.basePath} />
    </div>
  );
}
