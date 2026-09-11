import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CatalogEntry, CatalogPdf } from '@sichos-kodesh/catalog';
import { downloadAudio, downloadPdf } from '../download/download';
import { openPdf } from '../download/openPdf';
import { loadLocalSound } from '../audio/playLocalFile';
import type { LoadedSound } from '../audio/playLocalFile';

type AudioState = { status: 'idle' } | { status: 'downloading'; percent: number } | { status: 'ready'; sound: LoadedSound; playing: boolean };

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
    <>
      {entry.audio.map((audio) => (
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

      {entry.pdfs.map((pdf) => (
        <View key={pdf.driveFileId} style={styles.card}>
          <Text style={styles.pdfLabel}>{pdf.label}</Text>
          <Pressable style={styles.button} onPress={() => handleDownloadPdf(pdf)}>
            <Text style={styles.buttonText}>Download & open</Text>
          </Pressable>
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
  card: { marginBottom: 12, padding: 12, borderRadius: 8, backgroundColor: '#f2f2f2' },
  pdfLabel: { fontSize: 14, marginBottom: 8 },
  button: { backgroundColor: '#3366cc', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
