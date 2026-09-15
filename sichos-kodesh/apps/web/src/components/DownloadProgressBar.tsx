import { Link } from 'react-router-dom';
import { useActiveDownloads } from '../download/useActiveDownloads';
import { useTranslation } from '../i18n/useLanguage';

/**
 * A slim, always-visible-while-downloading strip - stacked with
 * GlobalPlayerBar inside App.tsx's fixed bottom container (not fixed
 * itself), so the two never fight over the same screen edge. Links to
 * DownloadedScreen's own "in progress" section rather than opening
 * anything inline here - this bar is a glanceable summary, not the detail
 * view itself.
 */
export function DownloadProgressBar() {
  const { t } = useTranslation();
  const { count, percent } = useActiveDownloads();

  if (count === 0) return null;

  return (
    <Link to="/downloaded" className="download-progress-bar">
      <span className="download-progress-bar-fill" style={{ width: `${percent}%` }} />
      <span className="download-progress-bar-label">
        {t.downloadingCount(count)} · {percent}%
      </span>
    </Link>
  );
}
