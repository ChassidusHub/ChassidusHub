import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useTranslation } from '../i18n/useLanguage';

/** How long the green "back online" confirmation stays up before clearing itself - it's a one-time confirmation, not an ongoing status (unlike the offline banner, which has no timer and stays up for as long as the fact it's reporting stays true). */
const BACK_ONLINE_VISIBLE_MS = 5000;

/**
 * A slim strip at the very top of the page reflecting overall connectivity -
 * mounted once at the app root (see App.tsx) so it's visible from any
 * screen, not just the ones that happen to attempt a network request.
 * `position: sticky` (not `fixed`): it occupies real space in the document
 * flow when present, so it never overlaps page content the way a `fixed`
 * bar would without matching padding managed elsewhere - it just sticks to
 * the top once you scroll past it.
 */
export function ConnectivityBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOnlineRef = useRef(online);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = online;
    if (online && !wasOnline) {
      setJustReconnected(true);
      const timer = setTimeout(() => setJustReconnected(false), BACK_ONLINE_VISIBLE_MS);
      return () => clearTimeout(timer);
    }
  }, [online]);

  if (!online) {
    return (
      <div className="connectivity-banner connectivity-banner-offline" role="status">
        {/* Links to the same downloaded-content view the home screen's own
            offline note already points to - the one place actually useful
            to jump to right now, rather than just naming the problem. */}
        <Link to="/downloaded" className="connectivity-banner-link">
          <WifiOff size={16} aria-hidden />
          <span>{t.connectivityOffline}</span>
        </Link>
      </div>
    );
  }

  if (justReconnected) {
    return (
      <div className="connectivity-banner connectivity-banner-online" role="status">
        <Wifi size={16} aria-hidden />
        <span>{t.connectivityBackOnline}</span>
      </div>
    );
  }

  return null;
}
