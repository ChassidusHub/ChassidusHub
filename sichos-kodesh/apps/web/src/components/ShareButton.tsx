import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  /** Passed to the native share sheet (Web Share API) as its own title, independent of the page's own <title> - e.g. the occasion's label. */
  title: string;
}

/**
 * Shares the current page's own URL - every occasion/playlist page already
 * has one stable route (FarbrengenScreen/RecordingsScreen), so there's
 * nothing to build here beyond `window.location.href`. Prefers the native
 * OS share sheet (`navigator.share`, mobile Safari/Chrome) where available;
 * falls back to copying the URL to the clipboard with a brief confirmation,
 * for desktop browsers that don't implement it.
 *
 * Rendered as one of the matching pills in OccasionActions - never on its
 * own - so Share and Download always sit side by side in the same shape.
 */
export function ShareButton({ title }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function handleShare(): Promise<void> {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Cancelled by the user, or the share sheet itself failed - either
        // way there's nothing more to do (not a real error to surface).
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable or permission denied - no further fallback.
    }
  }

  return (
    <button type="button" className="action-pill" onClick={() => void handleShare()}>
      {copied ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}
      {copied ? t.linkCopiedLabel : t.shareLabel}
    </button>
  );
}
