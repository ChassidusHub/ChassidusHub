import { useState } from 'react';
import type { CatalogAudio, CatalogEntry, CatalogPdf, PdfSection } from '@sichos-kodesh/catalog';
import { PDF_SECTION_LABELS, PDF_SECTION_ORDER } from '@sichos-kodesh/catalog';
import { audioUrl, downloadAudio, downloadPdf, pdfUrl } from '../download/download';

type AudioState = { status: 'idle' } | { status: 'downloading'; percent: number } | { status: 'ready' };
type PdfState = { status: 'idle' } | { status: 'downloading'; percent: number } | { status: 'ready' };

interface Props {
  entry: CatalogEntry;
}

function groupPdfsBySection(pdfs: CatalogPdf[]): Array<[PdfSection, CatalogPdf[]]> {
  const bySection = new Map<PdfSection, CatalogPdf[]>();
  for (const pdf of pdfs) {
    const list = bySection.get(pdf.section) ?? [];
    list.push(pdf);
    bySection.set(pdf.section, list);
  }
  return PDF_SECTION_ORDER.filter((section) => bySection.has(section)).map((section) => [section, bySection.get(section)!]);
}

/**
 * The download/play card for one catalog entry - shared by ThisWeekScreen
 * (the auto-resolved "this week" occasions) and YearBrowserScreen (any
 * entry the user picks while browsing a whole year). Groups content by
 * category (Audio, then each PDF section present) with a header per
 * group: several real PDF labels are short and generic on their own (e.g.
 * hagahos's "צילום 1"/"צילום 2" - literally "scan 1"/"scan 2", a real
 * label from the site, not a bug) and only make sense next to a category
 * header saying what they're scans *of*. Pass a `key` keyed to the entry
 * (e.g. `entry.occasionId`) when switching between entries so this
 * component's own download-state resets per entry.
 */
export function OccasionDetail({ entry }: Props) {
  const [audioStates, setAudioStates] = useState<Record<string, AudioState>>({});
  const [pdfStates, setPdfStates] = useState<Record<string, PdfState>>({});

  async function handleDownloadAudio(audio: CatalogAudio) {
    setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'downloading', percent: 0 } }));
    try {
      await downloadAudio(audio.workerFilename, ({ received, total }) =>
        setAudioStates((prev) => ({
          ...prev,
          [audio.workerFilename]: { status: 'downloading', percent: total > 0 ? Math.round((received / total) * 100) : 0 },
        })),
      );
      setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'ready' } }));
    } catch (error) {
      setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'idle' } }));
      alert(`Download failed: ${String(error)}`);
    }
  }

  async function handleDownloadPdf(pdf: CatalogPdf) {
    // Open the tab synchronously, in the same call stack as the click -
    // opening it only after the `await downloadPdf` below resolves is a
    // real bug: browsers (Safari in particular) treat a `window.open`
    // that runs after an async gap as no longer tied to the user's click
    // and silently block it as a popup, which looks exactly like nothing
    // happened. Redirect this already-open blank tab once the download
    // completes instead of opening a new one then.
    const opened = window.open('', '_blank');
    setPdfStates((prev) => ({ ...prev, [pdf.driveFileId]: { status: 'downloading', percent: 0 } }));
    try {
      await downloadPdf(pdf.driveFileId, pdf.resourceKey, ({ received, total }) =>
        setPdfStates((prev) => ({
          ...prev,
          [pdf.driveFileId]: { status: 'downloading', percent: total > 0 ? Math.round((received / total) * 100) : 0 },
        })),
      );
      setPdfStates((prev) => ({ ...prev, [pdf.driveFileId]: { status: 'ready' } }));
      if (opened) opened.location.href = pdfUrl(pdf.driveFileId, pdf.resourceKey);
      else window.open(pdfUrl(pdf.driveFileId, pdf.resourceKey), '_blank');
    } catch (error) {
      opened?.close();
      setPdfStates((prev) => ({ ...prev, [pdf.driveFileId]: { status: 'idle' } }));
      alert(`Download failed: ${String(error)}`);
    }
  }

  const pdfGroups = groupPdfsBySection(entry.pdfs);

  return (
    <>
      {entry.audio.length > 0 && (
        <section className="category">
          <p className="category-header">Audio</p>
          {entry.audio.map((audio) => {
            const state = audioStates[audio.workerFilename] ?? { status: 'idle' as const };
            return (
              <div key={audio.workerFilename} className="card">
                {state.status === 'idle' && (
                  <button className="button" onClick={() => handleDownloadAudio(audio)}>
                    Download audio
                  </button>
                )}
                {state.status === 'downloading' && <p>Downloading... {state.percent}%</p>}
                {state.status === 'ready' && <audio controls src={audioUrl(audio.workerFilename)} style={{ width: '100%' }} />}
              </div>
            );
          })}
        </section>
      )}

      {pdfGroups.map(([section, pdfs]) => (
        <section className="category" key={section}>
          <p className="category-header">{PDF_SECTION_LABELS[section]}</p>
          {pdfs.map((pdf) => {
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
                  <a className="button" href={pdfUrl(pdf.driveFileId, pdf.resourceKey)} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                )}
              </div>
            );
          })}
        </section>
      ))}

      {entry.audio.length === 0 && entry.pdfs.length === 0 && (
        <p className="gap-message">Nothing downloadable is indexed for this occasion yet.</p>
      )}
    </>
  );
}
