import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, WifiOff } from 'lucide-react';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { pdfUrl } from '../download/download';
import { getOnlineSnapshot, looksLikeNetworkError, reportFetchFailure } from '../network/connectivity';
import { loadPdfDocument, renderPdfPages } from '../pdf/renderPdf';
import { getOccasionProgress, getPdfScrollFraction, recordPdfProgress } from '../player/progressStore';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';
import { BackLink } from '../components/BackLink';
import { ScreenHeader } from '../components/ScreenHeader';

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
 * Renders a PDF's pages in-app via pdf.js rather than handing off to the
 * browser's own viewer. Loads by URL (see renderPdf.ts's
 * `loadPdfDocument`) rather than awaiting a full `arrayBuffer()` first,
 * so pdf.js can start parsing as bytes stream in. Callers (see App.tsx's
 * Follow/BrowsePdfRoute) must mount this with `key={driveFileId}` so
 * switching to a different PDF remounts fresh instead of relying on this
 * effect to reset state back to "loading" itself.
 *
 * Once the user pinch-zooms (see renderPdf.ts's `onZoomChange`), the
 * `.zoomed` class drops the reading-width cap and side padding so
 * panning a zoomed page has the full screen instead of being clipped to
 * that column.
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

  // The browser's native pinch-zoom would zoom the whole viewport
  // (header, back link, everything), not just the PDF - pdfPageZoom.ts
  // implements its own per-page zoom instead. Disabling native
  // pinch-zoom only while this screen is mounted (restored on unmount)
  // routes a two-finger gesture here to that code; every other screen
  // keeps normal pinch-to-zoom.
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
    let taskRef: PDFDocumentLoadingTask | null = null;
    setZoomed(false);

    (async () => {
      try {
        const task = loadPdfDocument(pdfUrl(pdf.driveFileId, pdf.resourceKey), ({ loaded, total }) => {
          // Clamped defensively: a CDN that reports Content-Length for the
          // compressed size while `loaded` accumulates decoded bytes (seen
          // on some edge caches) would otherwise push this past 100%.
          if (!cancelled) setState({ status: 'loading', percent: total > 0 ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : null });
        });
        taskRef = task;
        const doc = await task.promise;
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        await renderPdfPages(doc, containerRef.current, () => cancelled, (nowZoomed) => {
          if (!cancelled) setZoomed(nowZoomed);
        });
        if (cancelled) return;
        // Page wrappers already have their final height once
        // renderPdfPages resolves (only their canvases still render
        // lazily while scrolling - see renderPdf.ts), so the document's
        // scroll height is already correct here.
        if (savedFraction != null) {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          if (max > 0) window.scrollTo(0, savedFraction * max);
        }
        setState({ status: 'ready' });
      } catch (error) {
        // If this looks like a genuine network error (see
        // looksLikeNetworkError), treat it as a live connectivity signal
        // (reportFetchFailure) rather than relying on a separately-pinged
        // guess - a raw `navigator.onLine` read alone isn't reliable
        // enough here.
        if (looksLikeNetworkError(error)) reportFetchFailure();
        if (!cancelled) setState({ status: 'error', message: String(error), offline: !getOnlineSnapshot() });
      }
    })();

    return () => {
      cancelled = true;
      // Releases the whole document's own cached resources (fonts, images,
      // and every page object pdf.js ever created for it - see
      // renderPdf.ts's own per-page `page.cleanup()`, which only ever
      // covers pages that were actually released during a scroll session,
      // not ones still resident when this screen goes away, and not the
      // document-level structures cleanup() doesn't touch at all).
      // Switching to a different PDF (this effect re-keys on
      // driveFileId/resourceKey) or navigating off this screen entirely
      // would otherwise leave the previous document's full pdf.js-internal
      // state alive until garbage collection gets around to it. Safe to
      // call whether the document finished loading or is still in flight -
      // `PDFDocumentLoadingTask.destroy()` handles both.
      void taskRef?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stable id, not the `pdf` object (a fresh reference every render via .find()); savedFraction comes from progressMap, read once on mount, so it can't change across this effect's lifetime
  }, [pdf?.driveFileId, pdf?.resourceKey]);

  // Same throttle/flush pattern as the audio player's position tracking
  // (PlayerProvider.tsx): periodic writes while scrolling plus an
  // immediate flush before the page may go away, so a reload or revisit
  // resumes close to the real position without writing on every scroll
  // event.
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
        <div className="pdf-viewer-status">
          <BackLink to={resolved.basePath} />
          <p className="gap-message">{t.pdfNotFound}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={zoomed ? 'pdf-viewer-screen zoomed' : 'pdf-viewer-screen'}>
      <ScreenHeader to={resolved.basePath} title={pdf.label} className="screen-header-inset" />

      <div className="pdf-viewer-status">
        {state.status === 'loading' && (
          <p className="subtitle pdf-loading">
            <Loader2 className="pdf-loading-spinner" size={16} aria-hidden />
            <span>{state.percent != null ? t.openingPdfPercent(state.percent) : t.openingPdf}</span>
          </p>
        )}
        {state.status === 'error' && state.offline && (
          <>
            <div className="offline-note">
              <WifiOff size={16} aria-hidden />
              <span>{t.pdfOfflineNotDownloaded}</span>
            </div>
            <Link className="button" to="/downloaded">
              {t.viewDownloadedLabel}
            </Link>
          </>
        )}
        {state.status === 'error' && !state.offline && (
          <>
            <p className="gap-message">{t.pdfLoadError(state.message)}</p>
            {/* The file is still fetchable directly even when pdf.js can't
                render it in-app, so link out to it as a fallback - except
                while offline, where the direct fetch would fail too. */}
            <a className="button" href={pdfUrl(pdf.driveFileId, pdf.resourceKey)} target="_blank" rel="noreferrer">
              {t.openPdfExternally}
            </a>
          </>
        )}
      </div>

      <div ref={containerRef} className="pdf-pages" />
    </div>
  );
}
