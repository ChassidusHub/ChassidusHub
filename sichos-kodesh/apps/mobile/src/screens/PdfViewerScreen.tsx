import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';
import Pdf from 'react-native-pdf';
import catalog from '../catalog/data';
import { downloadPdf } from '../download/download';
import { BottomAudioPlayer } from '../components/BottomAudioPlayer';
import type { PdfViewerScreenProps } from '../navigation/types';

type LoadState = { status: 'downloading'; percent: number } | { status: 'ready'; path: string } | { status: 'error'; message: string };

/**
 * Renders a PDF's pages directly in the app (via react-native-pdf) instead
 * of handing off to a separate PDF viewer app - so an occasion's own
 * recording (via BottomAudioPlayer) can keep playing in a persistent bar
 * underneath while its pages are scrolled through. Downloads through the
 * same `downloadPdf` (services/media-proxy, resourceKey-aware) every other
 * PDF flow uses, then hands the resulting local file to react-native-pdf -
 * one download pipeline, not a second one via the library's own fetcher.
 */
export function PdfViewerScreen({ navigation, route }: PdfViewerScreenProps) {
  const { driveFileId, resourceKey, label, hebrewYear, occasionId, hasAudio } = route.params;
  const [state, setState] = useState<LoadState>({ status: 'downloading', percent: 0 });

  // Resolve audio tracks directly via the year key — avoids flattening the whole catalog.
  const audioTracks = useMemo(() => {
    if (!hasAudio) return [];
    return catalog[hebrewYear]?.find((e) => e.occasionId === occasionId)?.audio ?? [];
  }, [hebrewYear, occasionId, hasAudio]);

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

      {audioTracks.length > 0 && <BottomAudioPlayer audio={audioTracks} />}
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
