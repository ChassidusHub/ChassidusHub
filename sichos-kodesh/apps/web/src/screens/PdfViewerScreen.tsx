import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { pdfUrl } from '../download/download';
import { probeRealConnectivity } from '../network/useOnlineStatus';
import { loadPdfDocument, renderPdfPages } from '../pdf/renderPdf';
import { getOccasionProgress, getPdfScrollFraction, recordPdfProgress } from '../player/progressStore';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';
import { BackLink } from '../components/BackLink';

/** Document scroll position as a fraction (0-1) of how far it's possible to scroll - 0 when the page is too short to scroll at all. */
function currentScrollFraction(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
}

interface Props {
  resolved: ResolvedEntry;
}

type LoadState = { status: 'loading'; percent: number | null } | { status: 'ready' } | { status: 'error'; message: string; offline: boolean };

/**
 * Renders a PDF's pages directly in the app (via pdf.js) instead of
 * handing off to the browser's own PDF viewer or a new tab. Loads by URL
 * (see renderPdf.ts's loadPdfDocument) rather than awaiting a full
 * `arrayBuffer()` first, so pdf.js can start parsing as bytes stream in
 * instead of only once the whole file has downloaded. Leaving room for
 * GlobalPlayerBar (mounted once at App root, shown on any screen now) is
 * handled by App.tsx's shared AppContent wrapper, not per-screen here.
 * Callers (see App.tsx's Follow/BrowsePdfRoute) should mount this with
 * `key={driveFileId}` so switching to a different PDF remounts fresh
 * (a clean `useState` initial value) rather than needing this effect to
 * reset state back to "loading" itself.
 *
 * At rest, the page sits in a comfortable reading-width column with side
 * padding, same as every other screen; once the user pinch-zooms (see
 * renderPdf.ts's `onZoomChange`), the `.zoomed` class drops the width cap
 * and side padding so panning around a zoomed page has the full screen to
 * work with instead of being clipped to that column.
 */
export function PdfViewerScreen({ resolved }: Props) {
  const { t } = useTranslation();
  const { driveFileId } = useParams<{ driveFileId: string }>();
  const pdf = resolved.entry.pdfs.find((p) => p.driveFileId === driveFileId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading', percent: null });
  const [zoomed, setZoomed] = useState(false);
  const progressMap = useProgressMap();
  const savedFraction = pdf ? getPdfScrollFraction(getOccasionProgress(progressMap, resolved.entry.hebrewYear, resolved.entry.occasionId), pdf.driveFileId) : undefined;

  // The browser's own pinch-zoom always zooms the whole visual viewport -
  // header, back link, everything - not just the PDF, which is exactly
  // what pdfPageZoom.ts's per-page pinch-zoom is for instead. Disabling
  // native pinch-zoom only while this screen is mounted (restored on
  // unmount) is what makes a two-finger gesture here reach that code
  // instead of the browser's own zoom; every other screen keeps normal
  // pinch-to-zoom for accessibility.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    return () => {
      if (original != null) meta?.setAttribute('content', original);
    };
  }, []);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setZoomed(false);

    (async () => {
      try {
        const doc = await loadPdfDocument(pdfUrl(pdf.driveFileId, pdf.resourceKey), ({ loaded, total }) => {
          if (!cancelled) setState({ status: 'loading', percent: total > 0 ? Math.round((loaded / total) * 100) : null });
        });
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        await renderPdfPages(doc, containerRef.current, () => cancelled, (nowZoomed) => {
          if (!cancelled) setZoomed(nowZoomed);
        });
        if (cancelled) return;
        // Every page's wrapper is already appended with its real, final
        // height by the time renderPdfPages resolves (only the canvases
        // inside them still render lazily as the user scrolls - see
        // renderPdf.ts) - so the document's total scroll height is already
        // correct here, safe to restore against.
        if (savedFraction != null) {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          if (max > 0) window.scrollTo(0, savedFraction * max);
        }
        setState({ status: 'ready' });
      } catch (error) {
        // A raw `navigator.onLine` read is known to be unreliable (a
        // confirmed real report: the exact raw pdf.js/fetch message -
        // "Setting up fake worker failed: ..." - showing instead of the
        // friendly offline one, with `navigator.onLine` stuck reporting
        // `true` the whole time despite being genuinely offline) - a real
        // network probe, right now, at the moment this actually failed, is
        // what `useOnlineStatus`'s own live-but-periodic state can't give
        // (it can be a few seconds stale either direction).
        const online = await probeRealConnectivity();
        if (!cancelled) setState({ status: 'error', message: String(error), offline: !online });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stable id, not the `pdf` object (a fresh reference every render via .find()); savedFraction comes from progressMap, read once on mount, so it can't change across this effect's lifetime
  }, [pdf?.driveFileId, pdf?.resourceKey]);

  // Records the reading position (see progressStore.ts's recordPdfProgress)
  // once pages have real layout to scroll against - same throttle/flush
  // rationale as the audio player's position tracking (PlayerProvider.tsx):
  // a periodic write while scrolling, plus an immediate flush right before
  // the page might go away, so a reload or re-visit resumes close to the
  // real position without hammering localStorage on every scroll event.
  useEffect(() => {
    if (!pdf || state.status !== 'ready') return;
    let lastRecordAt = 0;
    function record() {
      recordPdfProgress(resolved.entry.hebrewYear, resolved.entry.occasionId, resolved.entry.occasionLabel, pdf!.driveFileId, currentScrollFraction());
    }
    function onScroll() {
      const now = Date.now();
      if (now - lastRecordAt < 2000) return;
      lastRecordAt = now;
      record();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', record);
    window.addEventListener('pagehide', record);
    return () => {
      record();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', record);
      window.removeEventListener('pagehide', record);
    };
  }, [pdf, state.status, resolved.entry.hebrewYear, resolved.entry.occasionId, resolved.entry.occasionLabel]);

  if (!pdf) {
    return (
      <div className="pdf-viewer-screen">
        <BackLink to={resolved.basePath} />
        <p className="gap-message">{t.pdfNotFound}</p>
      </div>
    );
  }

  return (
    <div className={zoomed ? 'pdf-viewer-screen zoomed' : 'pdf-viewer-screen'}>
      <div className="pdf-viewer-header">
        <BackLink to={resolved.basePath} />
        <p className="pdf-viewer-title">{pdf.label}</p>
      </div>

      {state.status === 'loading' && <p className="subtitle">{state.percent != null ? t.openingPdfPercent(state.percent) : t.openingPdf}</p>}
      {state.status === 'error' && state.offline && <p className="gap-message">{t.pdfOfflineNotDownloaded}</p>}
      {state.status === 'error' && !state.offline && (
        <>
          <p className="gap-message">{t.pdfLoadError(state.message)}</p>
          {/* pdf.js couldn't render it in-app (a malformed/unusual PDF, a transient
              network hiccup mid-parse) - the raw file itself is still real and
              fetchable through the same Worker URL, so a plain link out to it (the
              browser's own PDF viewer, or a download) is a real fallback, not a
              dead end. Skipped while offline (see above) - it can't work either,
              and offering it would just be a second dead end right under the first. */}
          <a className="button" href={pdfUrl(pdf.driveFileId, pdf.resourceKey)} target="_blank" rel="noreferrer">
            {t.openPdfExternally}
          </a>
        </>
      )}

      <div ref={containerRef} className="pdf-pages" />
    </div>
  );
}
