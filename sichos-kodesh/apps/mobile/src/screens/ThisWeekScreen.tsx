import React, { useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CatalogPdf } from '@sichos-kodesh/catalog';
import { IL } from '../config';
import catalog from '../catalog/data';
import { downloadAudio, downloadPdf } from '../download/download';
import { openPdf } from '../download/openPdf';
import { loadLocalSound } from '../audio/playLocalFile';
import type { LoadedSound } from '../audio/playLocalFile';
import { resolveThisWeek } from '../engine/resolveThisWeek';

interface Props {
  targetYear: number;
  sourceYear: number;
  onBack: () => void;
}

type AudioState = { status: 'idle' } | { status: 'downloading'; percent: number } | { status: 'ready'; sound: LoadedSound; playing: boolean };

export function ThisWeekScreen({ targetYear, sourceYear, onBack }: Props) {
  const occasion = useMemo(() => resolveThisWeek(targetYear, sourceYear, IL, catalog), [targetYear, sourceYear]);
  const [audioState, setAudioState] = useState<AudioState>({ status: 'idle' });

  async function handleDownloadAudio(workerFilename: string) {
    setAudioState({ status: 'downloading', percent: 0 });
    try {
      const path = await downloadAudio(workerFilename, ({ received, total }) =>
        setAudioState({ status: 'downloading', percent: total > 0 ? Math.round((received / total) * 100) : 0 }),
      );
      const sound = await loadLocalSound(path);
      setAudioState({ status: 'ready', sound, playing: false });
    } catch (error) {
      setAudioState({ status: 'idle' });
      Alert.alert('Download failed', String(error));
    }
  }

  function togglePlayback() {
    if (audioState.status !== 'ready') return;
    if (audioState.playing) {
      audioState.sound.pause();
      setAudioState({ ...audioState, playing: false });
    } else {
      audioState.sound.play();
      setAudioState({ ...audioState, playing: true });
    }
  }

  async function handleDownloadPdf(pdf: CatalogPdf) {
    try {
      const path = await downloadPdf(pdf.driveFileId);
      await openPdf(path);
    } catch (error) {
      Alert.alert('Download failed', String(error));
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'< change year'}</Text>
        </Pressable>
        <Text style={styles.title}>{occasion.label}</Text>
        <Text style={styles.subtitle}>{occasion.gregorianDate}</Text>

        {occasion.resolution.status === 'gap' && (
          <Text style={styles.gap}>No recording available for this occasion in {sourceYear} or nearby kvius-matched years.</Text>
        )}

        {occasion.entry && (
          <>
            <Text style={styles.sectionHeader}>From Hebrew year {occasion.resolution.resolvedYear}</Text>

            {occasion.entry.audio.map((audio) => (
              <View key={audio.workerFilename} style={styles.card}>
                {audioState.status === 'idle' && (
                  <Pressable style={styles.button} onPress={() => handleDownloadAudio(audio.workerFilename)}>
                    <Text style={styles.buttonText}>Download audio</Text>
                  </Pressable>
                )}
                {audioState.status === 'downloading' && <Text>Downloading... {audioState.percent}%</Text>}
                {audioState.status === 'ready' && (
                  <Pressable style={styles.button} onPress={togglePlayback}>
                    <Text style={styles.buttonText}>{audioState.playing ? 'Pause' : 'Play'}</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {occasion.entry.pdfs.map((pdf) => (
              <View key={pdf.driveFileId} style={styles.card}>
                <Text style={styles.pdfLabel}>{pdf.label}</Text>
                <Pressable style={styles.button} onPress={() => handleDownloadPdf(pdf)}>
                  <Text style={styles.buttonText}>Download & open</Text>
                </Pressable>
              </View>
            ))}

            {occasion.entry.audio.length === 0 && occasion.entry.pdfs.length === 0 && (
              <Text style={styles.gap}>Nothing downloadable is indexed for this occasion yet.</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  back: { color: '#3366cc', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  sectionHeader: { fontSize: 14, color: '#888', marginTop: 8, marginBottom: 8 },
  gap: { fontSize: 15, color: '#a33', marginTop: 16 },
  card: { marginBottom: 12, padding: 12, borderRadius: 8, backgroundColor: '#f2f2f2' },
  pdfLabel: { fontSize: 14, marginBottom: 8 },
  button: { backgroundColor: '#3366cc', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
