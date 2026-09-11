import { useEffect, useRef, useState } from 'react';
import type { CatalogEntry, CatalogPdf } from '@sichos-kodesh/catalog';
import { downloadPdf } from '../download/download';
import { loadPdfDocument, renderPdfPages } from '../pdf/renderPdf';
import { BottomAudioPlayer } from '../components/BottomAudioPlayer';

interface Props {
  entry: CatalogEntry;
  pdf: CatalogPdf;
  onBack: () => void;
}

type LoadState = { status: 'downloading'; percent: number } | { status: 'rendering' } | { status: 'ready' } | { status: 'error'; message: string };

/**
 * Renders a PDF's pages directly in the app (via pdf.js) instead of
 * handing off to the browser's own PDF viewer or a new tab - so an
 * occasion's own recording (via BottomAudioPlayer) can keep playing in a
 * persistent bar underneath while its pages are scrolled through. Callers
 * should mount this with `key={pdf.driveFileId}` so switching to a
 * different PDF remounts fresh (a clean `useState` initial value) rather
 * than needing an effect to reset state back to "downloading" itself.
 */
export function PdfViewerScreen({ entry, pdf, onBack }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>({ status: 'downloading', percent: 0 });

  useEffect(() => {
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
  }, [pdf.driveFileId, pdf.resourceKey]);

  const hasAudio = entry.audio.length > 0;

  return (
    <div className={hasAudio ? 'pdf-viewer-screen has-player' : 'pdf-viewer-screen'}>
      <div className="pdf-viewer-header">
        <button className="back-link" onClick={onBack}>
          {'< back'}
        </button>
        <p className="pdf-viewer-title">{pdf.label}</p>
      </div>

      {state.status === 'downloading' && <p className="subtitle">Downloading... {state.percent}%</p>}
      {state.status === 'rendering' && <p className="subtitle">Opening PDF...</p>}
      {state.status === 'error' && <p className="gap-message">Couldn't load this PDF: {state.message}</p>}

      <div ref={containerRef} className="pdf-pages" />

      {hasAudio && <BottomAudioPlayer audio={entry.audio} />}
    </div>
  );
}
