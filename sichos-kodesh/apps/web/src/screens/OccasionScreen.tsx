import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { OccasionDetail } from '../components/OccasionDetail';
import { BackLink } from '../components/BackLink';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  resolved: ResolvedEntry | null;
}

/** Shared by the "follow" and "browse" routes - only the entry-resolution differs (see routes/useResolvedEntry.ts), the page itself doesn't care which. */
export function OccasionScreen({ resolved }: Props) {
  const { t } = useTranslation();

  if (!resolved) {
    return (
      <div className="screen">
        <BackLink to="/">{t.home}</BackLink>
        <p className="gap-message">{t.occasionNotFound}</p>
      </div>
    );
  }

  const { entry, subtitle, backPath, backLabel } = resolved;

  return (
    <div className="screen">
      <BackLink to={backPath}>{backLabel}</BackLink>
      <h1>{entry.occasionLabel}</h1>
      <p className="subtitle">{subtitle}</p>
      <OccasionDetail entry={entry} basePath={resolved.basePath} />
    </div>
  );
}
