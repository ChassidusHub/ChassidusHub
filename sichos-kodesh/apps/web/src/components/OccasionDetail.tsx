import { useState } from 'react';
import type { CatalogAudio, CatalogEntry, CatalogPdf, PdfSection } from '@sichos-kodesh/catalog';
import { PDF_SECTION_LABELS, PDF_SECTION_ORDER, sortPdfsByEditionPreference } from '@sichos-kodesh/catalog';
import { audioUrl, downloadAudio } from '../download/download';
import { useEditionPreference } from '../settings/editionPreference';

type AudioState = { status: 'idle' } | { status: 'downloading'; percent: number } | { status: 'ready' };

interface Props {
  entry: CatalogEntry;
  /** Switches the parent screen into full-screen PDF-viewer mode - see PdfViewerScreen. */
  onOpenPdf: (pdf: CatalogPdf) => void;
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
 * The download/read card for one catalog entry - shared by ThisWeekScreen
 * (a "this week" occasion) and YearBrowserScreen (any entry the user
 * picks while browsing a whole year). Groups content by category (Audio,
 * then each PDF section present) with a header per group: several real
 * PDF labels are short and generic on their own (e.g. hagahos's "צילום
 * 1"/"צילום 2" - literally "scan 1"/"scan 2", a real label from the site,
 * not a bug) and only make sense next to a category header saying what
 * they're scans *of*. Pass a `key` keyed to the entry (e.g.
 * `entry.occasionId`) when switching between entries so this component's
 * own state resets per entry.
 *
 * Tapping "Read" doesn't render the viewer here - it calls `onOpenPdf` so
 * the *parent screen* switches to it full-screen instead, replacing its
 * own header/back-button rather than stacking the viewer underneath them.
 */
export function OccasionDetail({ entry, onOpenPdf }: Props) {
  const [audioStates, setAudioStates] = useState<Record<string, AudioState>>({});
  const [editionPreference] = useEditionPreference();

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

  const pdfGroups = groupPdfsBySection(entry.pdfs);

  return (
    <>
      {entry.audio.length > 0 && (
        <section className="category">
          <p className="category-header">Audio</p>
          {entry.audio.map((audio, index) => {
            const state = audioStates[audio.workerFilename] ?? { status: 'idle' as const };
            const chapterLabel = audio.chapterName ?? (entry.audio.length > 1 ? `Track ${index + 1}` : null);
            return (
              <div key={audio.workerFilename} className="card">
                {chapterLabel && <p className="pdf-label">{chapterLabel}</p>}
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
          {sortPdfsByEditionPreference(pdfs, editionPreference).map((pdf) => (
            <div key={pdf.driveFileId} className="card">
              <p className="pdf-label">{pdf.label}</p>
              <button className="button" onClick={() => onOpenPdf(pdf)}>
                Read
              </button>
            </div>
          ))}
        </section>
      ))}

      {entry.audio.length === 0 && entry.pdfs.length === 0 && (
        <p className="gap-message">Nothing downloadable is indexed for this occasion yet.</p>
      )}
    </>
  );
}
