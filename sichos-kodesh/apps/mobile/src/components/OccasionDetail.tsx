import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CatalogAudio, CatalogEntry, CatalogPdf, PdfSection } from '@sichos-kodesh/catalog';
import { PDF_SECTION_LABELS, PDF_SECTION_ORDER, sortPdfsByEditionPreference } from '@sichos-kodesh/catalog';
import { downloadAudio } from '../download/download';
import { loadLocalSound } from '../audio/playLocalFile';
import type { LoadedSound } from '../audio/playLocalFile';
import { useEditionPreference } from '../settings/editionPreference';

type AudioState = { status: 'idle' } | { status: 'downloading'; percent: number } | { status: 'ready'; sound: LoadedSound; playing: boolean };

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
 * the *parent screen* switches to it full-screen instead of stacking it
 * underneath the parent's own header/back-button.
 */
export function OccasionDetail({ entry, onOpenPdf }: Props) {
  const [audioStates, setAudioStates] = useState<Record<string, AudioState>>({});
  const [editionPreference] = useEditionPreference();

  async function handleDownloadAudio(audio: CatalogAudio) {
    setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'downloading', percent: 0 } }));
    try {
      const path = await downloadAudio(audio.workerFilename, ({ received, total }) =>
        setAudioStates((prev) => ({
          ...prev,
          [audio.workerFilename]: { status: 'downloading', percent: total > 0 ? Math.round((received / total) * 100) : 0 },
        })),
      );
      const sound = await loadLocalSound(path);
      setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'ready', sound, playing: false } }));
    } catch (error) {
      setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'idle' } }));
      Alert.alert('Download failed', String(error));
    }
  }

  function togglePlayback(audio: CatalogAudio) {
    const state = audioStates[audio.workerFilename];
    if (!state || state.status !== 'ready') return;
    if (state.playing) {
      state.sound.pause();
      setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { ...state, playing: false } }));
    } else {
      state.sound.play();
      setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { ...state, playing: true } }));
    }
  }

  const pdfGroups = groupPdfsBySection(entry.pdfs);

  return (
    <>
      {entry.audio.length > 0 && (
        <View style={styles.category}>
          <Text style={styles.categoryHeader}>Audio</Text>
          {entry.audio.map((audio, index) => {
            const state = audioStates[audio.workerFilename] ?? { status: 'idle' as const };
            const chapterLabel = audio.chapterName ?? (entry.audio.length > 1 ? `Track ${index + 1}` : null);
            return (
              <View key={audio.workerFilename} style={styles.card}>
                {chapterLabel && <Text style={styles.pdfLabel}>{chapterLabel}</Text>}
                {state.status === 'idle' && (
                  <Pressable style={styles.button} onPress={() => handleDownloadAudio(audio)}>
                    <Text style={styles.buttonText}>Download audio</Text>
                  </Pressable>
                )}
                {state.status === 'downloading' && <Text>Downloading... {state.percent}%</Text>}
                {state.status === 'ready' && (
                  <Pressable style={styles.button} onPress={() => togglePlayback(audio)}>
                    <Text style={styles.buttonText}>{state.playing ? 'Pause' : 'Play'}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      {pdfGroups.map(([section, pdfs]) => (
        <View style={styles.category} key={section}>
          <Text style={styles.categoryHeader}>{PDF_SECTION_LABELS[section]}</Text>
          {sortPdfsByEditionPreference(pdfs, editionPreference).map((pdf) => (
            <View key={pdf.driveFileId} style={styles.card}>
              <Text style={styles.pdfLabel}>{pdf.label}</Text>
              <Pressable style={styles.button} onPress={() => onOpenPdf(pdf)}>
                <Text style={styles.buttonText}>Read</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ))}

      {entry.audio.length === 0 && entry.pdfs.length === 0 && (
        <Text style={styles.gap}>Nothing downloadable is indexed for this occasion yet.</Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  gap: { fontSize: 15, color: '#a33', marginTop: 16 },
  category: { marginBottom: 8 },
  categoryHeader: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 },
  card: { marginBottom: 12, padding: 12, borderRadius: 8, backgroundColor: '#f2f2f2' },
  pdfLabel: { fontSize: 14, marginBottom: 8 },
  button: { backgroundColor: '#3366cc', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
