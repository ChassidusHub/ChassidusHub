import { useState } from 'react';
import type { CatalogEntry, CatalogPdf } from '@sichos-kodesh/catalog';
import { audioUrl, downloadAudio, downloadPdf, pdfUrl } from '../download/download';

type AudioState = { status: 'idle' } | { status: 'downloading'; percent: number } | { status: 'ready' };
type PdfState = { status: 'idle' } | { status: 'downloading'; percent: number } | { status: 'ready' };

interface Props {
  entry: CatalogEntry;
}

/**
 * The download/play card for one catalog entry - shared by ThisWeekScreen
 * (the auto-resolved "this week" occasion) and YearBrowserScreen (any
 * entry the user picks while browsing a whole year). Pass a `key` keyed
 * to the entry (e.g. `entry.occasionId`) when switching between entries
 * so this component's own download-state resets per entry.
 */
export function OccasionDetail({ entry }: Props) {
  const [audioState, setAudioState] = useState<AudioState>({ status: 'idle' });
  const [pdfStates, setPdfStates] = useState<Record<string, PdfState>>({});

  async function handleDownloadAudio(workerFilename: string) {
    setAudioState({ status: 'downloading', percent: 0 });
    try {
      await downloadAudio(workerFilename, ({ received, total }) =>
        setAudioState({ status: 'downloading', percent: total > 0 ? Math.round((received / total) * 100) : 0 }),
      );
      setAudioState({ status: 'ready' });
    } catch (error) {
      setAudioState({ status: 'idle' });
      alert(`Download failed: ${String(error)}`);
    }
  }

  async function handleDownloadPdf(pdf: CatalogPdf) {
    setPdfStates((prev) => ({ ...prev, [pdf.driveFileId]: { status: 'downloading', percent: 0 } }));
    try {
      await downloadPdf(pdf.driveFileId, ({ received, total }) =>
        setPdfStates((prev) => ({
          ...prev,
          [pdf.driveFileId]: { status: 'downloading', percent: total > 0 ? Math.round((received / total) * 100) : 0 },
        })),
      );
      setPdfStates((prev) => ({ ...prev, [pdf.driveFileId]: { status: 'ready' } }));
      window.open(pdfUrl(pdf.driveFileId), '_blank');
    } catch (error) {
      setPdfStates((prev) => ({ ...prev, [pdf.driveFileId]: { status: 'idle' } }));
      alert(`Download failed: ${String(error)}`);
    }
  }

  return (
    <>
      {entry.audio.map((audio) => (
        <div key={audio.workerFilename} className="card">
          {audioState.status === 'idle' && (
            <button className="button" onClick={() => handleDownloadAudio(audio.workerFilename)}>
              Download audio
            </button>
          )}
          {audioState.status === 'downloading' && <p>Downloading... {audioState.percent}%</p>}
          {audioState.status === 'ready' && <audio controls src={audioUrl(audio.workerFilename)} style={{ width: '100%' }} />}
        </div>
      ))}

      {entry.pdfs.map((pdf) => {
        const state = pdfStates[pdf.driveFileId] ?? { status: 'idle' as const };
        return (
          <div key={pdf.driveFileId} className="card">
            <p className="pdf-label">{pdf.label}</p>
            {state.status === 'idle' && (
              <button className="button" onClick={() => handleDownloadPdf(pdf)}>
                Download & open
              </button>
            )}
            {state.status === 'downloading' && <p>Downloading... {state.percent}%</p>}
            {state.status === 'ready' && (
              <a className="button" href={pdfUrl(pdf.driveFileId)} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            )}
          </div>
        );
      })}

      {entry.audio.length === 0 && entry.pdfs.length === 0 && (
        <p className="gap-message">Nothing downloadable is indexed for this occasion yet.</p>
      )}
    </>
  );
}
