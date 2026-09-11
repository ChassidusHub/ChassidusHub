import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';
import Pdf from 'react-native-pdf';
import type { CatalogEntry, CatalogPdf } from '@sichos-kodesh/catalog';
import { downloadPdf } from '../download/download';
import { BottomAudioPlayer } from '../components/BottomAudioPlayer';

interface Props {
  entry: CatalogEntry;
  pdf: CatalogPdf;
  onBack: () => void;
}

type LoadState = { status: 'downloading'; percent: number } | { status: 'ready'; path: string } | { status: 'error'; message: string };

/**
 * Renders a PDF's pages directly in the app (via react-native-pdf) instead
 * of handing off to a separate PDF viewer app - so an occasion's own
 * recording (via BottomAudioPlayer) can keep playing in a persistent bar
 * underneath while its pages are scrolled through. Downloads through the
 * same `downloadPdf` (services/media-proxy, resourceKey-aware) every other
 * PDF flow uses, then hands the resulting local file to react-native-pdf -
 * one download pipeline, not a second one via the library's own fetcher.
 * Callers should mount this with `key={pdf.driveFileId}` so switching to a
 * different PDF remounts fresh instead of needing this effect to reset
 * state back to "downloading" itself.
 */
export function PdfViewerScreen({ entry, pdf, onBack }: Props) {
  const [state, setState] = useState<LoadState>({ status: 'downloading', percent: 0 });

  useEffect(() => {
    let cancelled = false;
    downloadPdf(pdf.driveFileId, pdf.resourceKey, ({ received, total }) => {
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
  }, [pdf.driveFileId, pdf.resourceKey]);

  const hasAudio = entry.audio.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={onBack} style={styles.header}>
        <Text style={styles.back}>{'< back'}</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={2}>
        {pdf.label}
      </Text>

      {state.status === 'downloading' && <Text style={styles.status}>Downloading... {state.percent}%</Text>}
      {state.status === 'error' && <Text style={styles.error}>Couldn't load this PDF: {state.message}</Text>}
      {state.status === 'ready' && (
        <Pdf
          source={{ uri: `file://${state.path}` }}
          style={hasAudio ? [styles.pdf, styles.pdfWithPlayer] : styles.pdf}
          onError={(error) => setState({ status: 'error', message: String(error) })}
        />
      )}

      {hasAudio && <BottomAudioPlayer audio={entry.audio} />}
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
