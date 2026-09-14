import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { downloadPdf } from '../download/download';
import { loadPdfDocument, renderPdfPages } from '../pdf/renderPdf';
import { usePlayer } from '../player/usePlayer';
import { BackLink } from '../components/BackLink';

interface Props {
  resolved: ResolvedEntry;
}

type LoadState = { status: 'downloading'; percent: number } | { status: 'rendering' } | { status: 'ready' } | { status: 'error'; message: string };

/**
 * Renders a PDF's pages directly in the app (via pdf.js) instead of
 * handing off to the browser's own PDF viewer or a new tab. Playback
 * (GlobalPlayerBar, mounted once at App root) is independent of this
 * screen now - it shows whenever anything is playing anywhere in the app,
 * not just here, so this only needs to know whether to leave room for it.
 * Callers (see App.tsx's Follow/BrowsePdfRoute) should mount this with
 * `key={driveFileId}` so switching to a different PDF remounts fresh
 * (a clean `useState` initial value) rather than needing this effect to
 * reset state back to "downloading" itself.
 */
export function PdfViewerScreen({ resolved }: Props) {
  const { driveFileId } = useParams<{ driveFileId: string }>();
  const pdf = resolved.entry.pdfs.find((p) => p.driveFileId === driveFileId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>({ status: 'downloading', percent: 0 });
  const player = usePlayer();

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await downloadPdf(pdf.driveFileId, pdf.resourceKey, ({ received, total }) => {
          if (!cancelled) setState({ status: 'downloading', percent: total > 0 ? Math.round((received / total) * 100) : 0 });
        });
        const data = await response.arrayBuffer();
        if (cancelled) return;

        setState({ status: 'rendering' });
        const doc = await loadPdfDocument(data);
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

  const hasPlayerBar = player.playlist !== null;

  return (
    <div className={hasPlayerBar ? 'pdf-viewer-screen has-player' : 'pdf-viewer-screen'}>
      <div className="pdf-viewer-header">
        <BackLink to={resolved.basePath}>back</BackLink>
        <p className="pdf-viewer-title">{pdf.label}</p>
      </div>

      {state.status === 'downloading' && <p className="subtitle">Downloading... {state.percent}%</p>}
      {state.status === 'rendering' && <p className="subtitle">Opening PDF...</p>}
      {state.status === 'error' && <p className="gap-message">Couldn't load this PDF: {state.message}</p>}

      <div ref={containerRef} className="pdf-pages" />
    </div>
  );
}
