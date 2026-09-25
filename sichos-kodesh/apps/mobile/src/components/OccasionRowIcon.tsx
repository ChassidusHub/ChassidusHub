import React from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle2, Download, Music } from 'lucide-react-native';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { getOccasionProgress, isOccasionFinished } from '../player/progressStore';
import type { ProgressStore } from '../player/progressStore';
import { useDownload } from '../download/useDownload';
import { useOnlineMode } from '../appMode/appMode';
import { useDownloadState } from '../download/useDownloadState';
import { useDownloadProgress } from '../download/useDownloadProgress';
import { useTranslation } from '../i18n/useTranslation';
import { Spinner } from '../ui/Spinner';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';
import { DownloadProgressRing } from './DownloadProgressRing';

interface Props {
  entry: CatalogEntry;
  progressMap: ProgressStore;
  /** A row's own trailing date, rendered after all icons - only then do the icons get fixed-width slots (blank when absent) so every row's date starts at the same position. */
  dateSlot?: ReactNode;
}

/**
 * The trailing icon(s) on an occasion row, shared by every occasion list so
 * "finished" and "downloaded" read the same way everywhere: a plain arrow
 * to start a download, a spinner (or a real progress ring) while it runs, a
 * filled check once done, plus the recording/finished status icon.
 */
export function OccasionRowIcon({ entry, progressMap, dateSlot }: Props) {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const { downloadOccasion } = useDownload();
  const downloadState = useDownloadState(entry);
  const downloadProgress = useDownloadProgress(entry);
  const onlineMode = useOnlineMode();
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);

  let statusIcon: ReactNode = null;
  if (isOccasionFinished(progress, entry)) {
    statusIcon = <CheckCircle2 size={14} color={colors.accent} accessibilityLabel={t.finishedLabel} />;
  } else if (entry.audio.length > 0) {
    statusIcon = <Music size={14} color={colors.accent} accessibilityLabel={t.hasRecordingLabel} />;
  }

  let downloadIcon: ReactNode = null;
  if (!onlineMode) {
    // Offline pack mode: no download arrows, spinners or checks - the slot stays, so rows line up as before.
    downloadIcon = null;
  } else if (downloadState === 'loading') {
    downloadIcon = <View style={[styles.loadingDot, { backgroundColor: colors.border }]} />;
  } else if (downloadState === 'downloaded') {
    downloadIcon = <CheckCircle2 size={14} color={colors.accent} accessibilityLabel={t.downloadedLabel} />;
  } else if (downloadState === 'downloading' && downloadProgress !== undefined) {
    downloadIcon = <DownloadProgressRing progress={downloadProgress} />;
  } else if (downloadState === 'queued' || downloadState === 'downloading') {
    downloadIcon = <Spinner size={14} color={colors.muted} />;
  } else if (downloadState === 'none') {
    downloadIcon = (
      <Pressable
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t.downloadLabel}
        onPress={() => {
          downloadOccasion(entry).catch(() => undefined);
        }}
        style={({ pressed }) => [styles.downloadButton, pressed && styles.pressed]}
      >
        <Download size={14} color={colors.muted} />
      </Pressable>
    );
  }

  if (dateSlot !== undefined) {
    return (
      <View style={[styles.icons, { flexDirection: row(isRtl) }]}>
        <View style={styles.downloadSlot}>{downloadIcon}</View>
        <View style={styles.statusSlot}>{statusIcon}</View>
        {dateSlot}
      </View>
    );
  }

  if (!statusIcon && !downloadIcon) return null;

  return (
    <View style={[styles.icons, { flexDirection: row(isRtl) }]}>
      {statusIcon}
      {downloadIcon}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Web: `.row-icons` - inline-flex, gap 6. */
  icons: { alignItems: 'center', gap: 6, flexShrink: 0 },
  /** Web: `.row-download-icon-slot` / `.row-status-icon-slot` - fixed 18px / 14px footprints. */
  downloadSlot: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  statusSlot: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  loadingDot: { width: 8, height: 8, borderRadius: 4 },
  downloadButton: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
