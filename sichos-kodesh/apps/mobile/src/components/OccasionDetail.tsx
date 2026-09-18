import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CatalogAudio, CatalogEntry, CatalogPdf, PdfSection } from '@sichos-kodesh/catalog';
import { PDF_SECTION_LABELS, PDF_SECTION_ORDER, sortPdfsByEditionPreference } from '@sichos-kodesh/catalog';
import { loadCachedSound } from '../audio/loadCachedSound';
import type { LoadedSound } from '../audio/playLocalFile';
import { useEditionPreference } from '../settings/editionPreference';
import { Card } from '../ui/Card';
import { SectionLabel } from '../ui/SectionLabel';
import { colors, radius, spacing } from '../ui/theme';

type AudioState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; sound: LoadedSound; playing: boolean };

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
 * then each PDF section present) with a header per group, since some PDF
 * labels are short and generic on their own (e.g. hagahos's "צילום
 * 1"/"צילום 2", literally "scan 1"/"scan 2") and only make sense next to a
 * category header saying what they're scans *of*. Pass a `key` keyed to
 * the entry (e.g. `entry.occasionId`) when switching between entries so
 * this component's own state resets per entry.
 *
 * Tapping "Read" doesn't render the viewer here - it calls `onOpenPdf` so
 * the *parent screen* switches to it full-screen instead of stacking it
 * underneath the parent's own header/back-button.
 *
 * Tapping "Play" downloads the file in full before playback starts (see
 * loadCachedSound), shown only as "Loading...", and only the first time;
 * the cached copy plays instantly (and offline) after that.
 */
export function OccasionDetail({ entry, onOpenPdf }: Props) {
  const [audioStates, setAudioStates] = useState<Record<string, AudioState>>({});
  const [editionPreference] = useEditionPreference();

  async function handlePlayAudio(audio: CatalogAudio) {
    setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'loading' } }));
    try {
      const sound = await loadCachedSound(audio.workerFilename);
      sound.play();
      setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'ready', sound, playing: true } }));
    } catch (error) {
      setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'idle' } }));
      Alert.alert("Couldn't play audio", String(error));
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
          <SectionLabel label="Audio" />
          {entry.audio.map((audio, index) => {
            const state = audioStates[audio.workerFilename] ?? { status: 'idle' as const };
            const chapterLabel = audio.chapterName ?? (entry.audio.length > 1 ? `Track ${index + 1}` : null);
            return (
              <Card key={audio.workerFilename} style={styles.card}>
                {chapterLabel && <Text style={styles.itemLabel}>{chapterLabel}</Text>}
                {state.status === 'idle' && (
                  <Pressable style={styles.button} onPress={() => handlePlayAudio(audio)}>
                    <Text style={styles.buttonText}>Play</Text>
                  </Pressable>
                )}
                {state.status === 'loading' && <Text style={styles.loadingText}>Loading…</Text>}
                {state.status === 'ready' && (
                  <Pressable style={styles.button} onPress={() => togglePlayback(audio)}>
                    <Text style={styles.buttonText}>{state.playing ? 'Pause' : 'Play'}</Text>
                  </Pressable>
                )}
              </Card>
            );
          })}
        </View>
      )}

      {pdfGroups.map(([section, pdfs]) => (
        <View style={styles.category} key={section}>
          <SectionLabel label={PDF_SECTION_LABELS[section]} />
          {sortPdfsByEditionPreference(pdfs, editionPreference).map((pdf) => (
            <Card key={pdf.driveFileId} style={styles.card}>
              <Text style={styles.itemLabel}>{pdf.label}</Text>
              <Pressable style={styles.button} onPress={() => onOpenPdf(pdf)}>
                <Text style={styles.buttonText}>Read</Text>
              </Pressable>
            </Card>
          ))}
        </View>
      ))}

      {entry.audio.length === 0 && entry.pdfs.length === 0 && (
        <Text style={styles.empty}>Nothing downloadable is indexed for this occasion yet.</Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 15, color: colors.textError, marginTop: spacing.md },
  category: { marginBottom: spacing.sm },
  card: { marginBottom: spacing.md },
  itemLabel: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.sm },
  loadingText: { fontSize: 14, color: colors.textMuted },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center' as const,
  },
  buttonText: { color: colors.accentFg, fontWeight: '600' as const, fontSize: 14 },
});
