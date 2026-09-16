import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = online;
    if (online && !wasOnline) {
      setJustReconnected(true);
      const timer = setTimeout(() => setJustReconnected(false), BACK_ONLINE_VISIBLE_MS);
      return () => clearTimeout(timer);
    }
  }, [online]);

  // Keeps a CSS variable in sync with this banner's own actual rendered
  // height (0 when nothing's currently shown - `bannerRef.current` is
  // `null` on a render that returns `null` below, same as it is before
  // first mount) - ScreenHeader.tsx, a completely separate sticky bar
  // mounted per-screen rather than once here, reads it to know how far
  // down *it* needs to stick, rather than guessing a fixed pixel value
  // that would go stale the moment this banner's own padding/font-size
  // ever changes, or silently overlap it on a device with a non-zero
  // safe-area-inset-top (this banner's real height isn't a fixed constant
  // across devices to begin with - see its own `padding-top: calc(10px +
  // env(safe-area-inset-top))` in index.css). The ref sits directly on
  // whichever sticky div below is actually rendered, not on an extra
  // wrapper around it - a wrapper div with no explicit height of its own
  // becomes exactly as tall as its sticky child, which makes *that* the
  // child's containing block for sticky purposes and leaves it no room to
  // actually stick (it un-sticks the instant its own box scrolls past,
  // since the parent has no extra height beyond the child itself).
  //
  // A ResizeObserver, not just a one-off measurement here, since this
  // banner's real height can change for reasons that don't re-render this
  // component at all (a web font finishing its async swap after this
  // effect already ran, or a phone rotating and changing its safe-area
  // inset) - without one, ScreenHeader could stay pinned a few stale
  // pixels off from this banner's actual edge until something unrelated
  // happens to force a re-render.
  useLayoutEffect(() => {
    const el = bannerRef.current;
    document.documentElement.style.setProperty('--connectivity-banner-height', `${el?.offsetHeight ?? 0}px`);
    if (!el) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--connectivity-banner-height', `${el.offsetHeight}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  if (!online) {
    return (
      <div ref={bannerRef} className="connectivity-banner connectivity-banner-offline" role="status">
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
      <div ref={bannerRef} className="connectivity-banner connectivity-banner-online" role="status">
        <Wifi size={16} aria-hidden />
        <span>{t.connectivityBackOnline}</span>
      </div>
    );
  }

  return null;
}
