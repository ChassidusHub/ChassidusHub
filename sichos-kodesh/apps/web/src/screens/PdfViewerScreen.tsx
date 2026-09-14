import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { pdfUrl } from '../download/download';
import { loadPdfDocument, renderPdfPages } from '../pdf/renderPdf';
import { BackLink } from '../components/BackLink';

interface Props {
  resolved: ResolvedEntry;
}

type LoadState = { status: 'loading'; percent: number | null } | { status: 'ready' } | { status: 'error'; message: string };

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
 */
export function PdfViewerScreen({ resolved }: Props) {
  const { driveFileId } = useParams<{ driveFileId: string }>();
  const pdf = resolved.entry.pdfs.find((p) => p.driveFileId === driveFileId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading', percent: null });

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;

    (async () => {
      try {
        const doc = await loadPdfDocument(pdfUrl(pdf.driveFileId, pdf.resourceKey), ({ loaded, total }) => {
          if (!cancelled) setState({ status: 'loading', percent: total > 0 ? Math.round((loaded / total) * 100) : null });
        });
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        await renderPdfPages(doc, containerRef.current, () => cancelled);
        if (!cancelled) setState({ status: 'ready' });
      } catch (error) {
        if (!cancelled) setState({ status: 'error', message: String(error) });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stable id, not the `pdf` object (a fresh reference every render via .find())
  }, [pdf?.driveFileId, pdf?.resourceKey]);

  if (!pdf) {
    return (
      <div className="pdf-viewer-screen">
        <BackLink to={resolved.basePath}>back</BackLink>
        <p className="gap-message">This PDF couldn't be found - the link may be out of date.</p>
      </div>
    );
  }

  return (
    <div className="pdf-viewer-screen">
      <div className="pdf-viewer-header">
        <BackLink to={resolved.basePath}>back</BackLink>
        <p className="pdf-viewer-title">{pdf.label}</p>
      </div>

      {state.status === 'loading' && <p className="subtitle">Opening PDF{state.percent != null ? `... ${state.percent}%` : '...'}</p>}
      {state.status === 'error' && <p className="gap-message">Couldn't load this PDF: {state.message}</p>}

      <div ref={containerRef} className="pdf-pages" />
    </div>
  );
}
