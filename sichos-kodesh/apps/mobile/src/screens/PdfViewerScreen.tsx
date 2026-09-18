import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';
import Pdf from 'react-native-pdf';
import catalog from '../catalog/data';
import { downloadPdf } from '../download/download';
import type { PdfViewerScreenProps } from '../navigation/types';

type LoadState = { status: 'downloading'; percent: number } | { status: 'ready'; path: string } | { status: 'error'; message: string };

/**
 * Renders a PDF's pages directly in the app (via react-native-pdf).
 * Audio playback is handled by the global PlayerProvider/GlobalPlayerBar
 * that persists at the app root - no need for a screen-local BottomAudioPlayer.
 * The audio queue is loaded when the user presses Play in OccasionDetail before
 * navigating here; if they navigate here directly, GlobalPlayerBar shows
 * whatever is currently queued in the global player.
 */
export function PdfViewerScreen({ navigation, route }: PdfViewerScreenProps) {
  const { driveFileId, resourceKey, label, hebrewYear, occasionId } = route.params;
  const [state, setState] = useState<LoadState>({ status: 'downloading', percent: 0 });

  // Resolve audio tracks directly via the year key — avoids flattening the whole catalog.
  // If the catalog lookup yields nothing the player is simply not shown (no silent mismatch).
  const audioTracks = useMemo(
    () => catalog[hebrewYear]?.find((e) => e.occasionId === occasionId)?.audio ?? [],
    [hebrewYear, occasionId],
  );

  useEffect(() => {
    let cancelled = false;
    downloadPdf(driveFileId, resourceKey ?? undefined, ({ received, total }) => {
      if (!cancelled) setState({ status: 'downloading', percent: total > 0 ? Math.round((received / total) * 100) : 0 });
    })
      .then((path) => {
        if (!cancelled) setState({ status: 'ready', path });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [driveFileId, resourceKey]);

  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={() => navigation.goBack()} style={styles.header}>
        <Text style={styles.back}>{'< back'}</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={2}>
        {label}
      </Text>

      {state.status === 'downloading' && <Text style={styles.status}>Downloading... {state.percent}%</Text>}
      {state.status === 'error' && <Text style={styles.error}>Couldn't load this PDF: {state.message}</Text>}
      {state.status === 'ready' && (
        <Pdf
          source={{ uri: `file://${state.path}` }}
          style={audioTracks.length > 0 ? [styles.pdf, styles.pdfWithPlayer] : styles.pdf}
          onError={(error) => setState({ status: 'error', message: String(error) })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12 },
  back: { color: '#3366cc', fontSize: 16 },
  title: { fontSize: 16, fontWeight: '600', paddingHorizontal: 16, paddingBottom: 8 },
  status: { paddingHorizontal: 16, color: '#666' },
  error: { paddingHorizontal: 16, color: '#a33' },
  pdf: { flex: 1, width: '100%' },
  pdfWithPlayer: { marginBottom: 76 },
});
