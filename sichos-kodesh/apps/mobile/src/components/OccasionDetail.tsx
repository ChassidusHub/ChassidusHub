import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { CatalogAudio, CatalogEntry, CatalogPdf, PdfSection } from '@sichos-kodesh/catalog';
import { PDF_SECTION_ORDER, sortPdfsByEditionPreference } from '@sichos-kodesh/catalog';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@sichos-kodesh/app-core';
import { loadCachedSound } from '../audio/loadCachedSound';
import type { LoadedSound } from '../audio/playLocalFile';
import { useDownload } from '../download/useDownload';
import { useEditionPreference } from '../settings/editionPreference';
import { useTranslation } from '../i18n/useTranslation';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { SectionLabel } from '../ui/SectionLabel';
import { spacing } from '../ui/theme';

type AudioState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; sound: LoadedSound; playing: boolean };

interface Props {
  entry: CatalogEntry;
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

export function OccasionDetail({ entry, onOpenPdf }: Props) {
  const [audioStates, setAudioStates] = useState<Record<string, AudioState>>({});
  const [editionPreference] = useEditionPreference();
  const { t } = useTranslation();
  const { downloadAudio, downloadOccasion, downloadPdf, targetStates } = useDownload();
  const allTargets = useMemo(() => listDownloadTargets([entry], ALL_CONTENT_TYPES), [entry]);
  const pdfGroups = groupPdfsBySection(entry.pdfs);
  const anyTargets = allTargets.length > 0;

  async function handlePlayAudio(audio: CatalogAudio) {
    setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'loading' } }));
    try {
      const sound = await loadCachedSound(audio.workerFilename);
      sound.play();
      setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'ready', sound, playing: true } }));
    } catch (error) {
      setAudioStates((prev) => ({ ...prev, [audio.workerFilename]: { status: 'idle' } }));
      Alert.alert(t.audioLoadError, String(error));
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

  function renderDownloadButton(stateKey: string, onPress: () => void) {
    const state = targetStates[stateKey];
    if (state?.status === 'downloaded') return <AppButton label={t.downloadedLabel} variant="ghost" />;
    if (state?.status === 'queued') return <AppButton label={t.downloadQueuedLabel} variant="ghost" />;
    if (state?.status === 'downloading') return <AppButton label={`${t.downloadingLabel} ${Math.round(state.progress * 100)}%`} variant="ghost" />;
    if (state?.status === 'error') return <AppButton label={t.retryDownloadLabel} variant="ghost" onPress={onPress} />;
    return <AppButton label={t.downloadLabel} variant="secondary" onPress={onPress} />;
  }

  return (
    <>
      {anyTargets ? (
        <View style={styles.category}>
          <AppButton label={t.downloadLabel} variant="secondary" onPress={() => { downloadOccasion(entry); }} />
        </View>
      ) : null}

      {entry.audio.length > 0 && (
        <View style={styles.category}>
          <SectionLabel label={t.recordings} />
          {entry.audio.map((audio, index) => {
            const state = audioStates[audio.workerFilename] ?? { status: 'idle' as const };
            const chapterLabel = audio.chapterName ?? (entry.audio.length > 1 ? t.track(index + 1) : null);
            const downloadTarget = allTargets.find(
              (target) => target.kind === 'audio' && target.workerFilename === audio.workerFilename && target.chapterIndex === index,
            );
            return (
              <Card key={audio.workerFilename} style={styles.card}>
                {chapterLabel ? <AppText color="secondary" style={styles.itemLabel}>{chapterLabel}</AppText> : null}
                <View style={styles.actionRow}>
                  {state.status === 'idle' && <AppButton label={t.play} onPress={() => { handlePlayAudio(audio); }} style={styles.actionButton} />}
                  {state.status === 'loading' && <AppButton label={t.loading} variant="ghost" style={styles.actionButton} />}
                  {state.status === 'ready' && (
                    <AppButton label={state.playing ? t.pause : t.play} onPress={() => togglePlayback(audio)} style={styles.actionButton} />
                  )}
                  {downloadTarget ? (
                    <View style={styles.actionButton}>{renderDownloadButton(downloadTarget.key, () => { downloadAudio(entry, audio, index); })}</View>
                  ) : null}
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {pdfGroups.map(([section, pdfs]) => (
        <View style={styles.category} key={section}>
          <SectionLabel label={t.sectionLabels[section]} />
          {sortPdfsByEditionPreference(pdfs, editionPreference).map((pdf) => {
            const downloadTarget = allTargets.find(
              (target) => target.kind === 'pdf' && target.driveFileId === pdf.driveFileId,
            );
            return (
              <Card key={pdf.driveFileId} style={styles.card}>
                <AppText color="secondary" style={styles.itemLabel}>{pdf.label}</AppText>
                <View style={styles.actionRow}>
                  <AppButton label={t.read} onPress={() => onOpenPdf(pdf)} style={styles.actionButton} />
                  {downloadTarget ? (
                    <View style={styles.actionButton}>{renderDownloadButton(downloadTarget.key, () => { downloadPdf(entry, pdf); })}</View>
                  ) : null}
                </View>
              </Card>
            );
          })}
        </View>
      ))}

      {entry.audio.length === 0 && entry.pdfs.length === 0 && (
        <AppText color="error" style={styles.empty}>{t.nothingDownloadable}</AppText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: spacing.md },
  category: { marginBottom: spacing.sm },
  card: { marginBottom: spacing.md },
  itemLabel: { marginBottom: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
});
