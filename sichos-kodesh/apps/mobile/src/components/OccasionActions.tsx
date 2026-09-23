import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle2, Download } from 'lucide-react-native';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { useAllChaptersDownloadState } from '../download/useAllChaptersDownloadState';
import { useDownload } from '../download/useDownload';
import { useDownloadProgress } from '../download/useDownloadProgress';
import { useDownloadState } from '../download/useDownloadState';
import { useTranslation } from '../i18n/useTranslation';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { hexWithAlpha } from '../ui/color';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';
import { DownloadProgressRing } from './DownloadProgressRing';
import { ShareButton } from './ShareButton';

interface Props {
  entry: CatalogEntry;
  /** 'occasion' downloads everything the occasion has (FarbrengenScreen); 'recordings' downloads its chapters (RecordingsScreen) - the same pair of pills either way. */
  mode?: 'occasion' | 'recordings';
}

/**
 * The one action bar every occasion page and recordings page shares: a
 * Download pill and a Share pill of the same shape, side by side (web:
 * `.action-bar` / `.action-pill`). The download pill is the whole state in
 * one place - a button to start, then the live progress, then
 * "Downloaded" - so neither page needs its own arrangement of icons.
 */
export function OccasionActions({ entry, mode = 'occasion' }: Props) {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const { downloadOccasion, downloadAllChapters } = useDownload();
  const occasionState = useDownloadState(entry);
  const chaptersState = useAllChaptersDownloadState(entry);
  const progress = useDownloadProgress(entry);
  const state = mode === 'recordings' ? chaptersState : occasionState;
  const tint = hexWithAlpha(colors.accent, 0.14);
  const direction = { flexDirection: row(isRtl) } as const;

  let download = null;
  if (state === 'downloaded') {
    download = (
      <View style={[actionPillStyles.pill, actionPillStyles.primary, direction, { backgroundColor: tint }]} accessibilityRole="text" accessibilityLabel={t.downloadedLabel}>
        <CheckCircle2 size={16} color={colors.accent} />
        <AppText style={[styles.label, { color: colors.accent }]}>{t.downloadedLabel}</AppText>
      </View>
    );
  } else if (state === 'downloading' || state === 'queued') {
    download = (
      <View style={[actionPillStyles.pill, actionPillStyles.primary, direction, { backgroundColor: tint }]} accessibilityRole="text" accessibilityLabel={t.downloadingLabel}>
        {mode === 'occasion' && progress !== undefined ? <DownloadProgressRing size={16} progress={progress} /> : <Spinner size={16} color={colors.accent} />}
        <AppText style={[styles.label, { color: colors.accent }]}>{t.downloadingLabel}</AppText>
      </View>
    );
  } else if (state === 'none' || state === 'loading') {
    // 'loading' (the brief storage lookup) draws the same pill, dimmed and inert, so the bar never pops in a moment after the screen.
    const pending = state === 'loading';
    download = (
      <Pressable
        onPress={() => {
          (mode === 'recordings' ? downloadAllChapters(entry) : downloadOccasion(entry)).catch(() => undefined);
        }}
        disabled={pending}
        hitSlop={6}
        accessibilityRole="button"
        style={({ pressed }) => [actionPillStyles.pill, actionPillStyles.primary, direction, { backgroundColor: tint }, pending && styles.pending, pressed && styles.pressed]}
      >
        <Download size={16} color={colors.accent} />
        <AppText style={[styles.label, { color: colors.accent }]}>{mode === 'recordings' ? t.downloadAllRecordingsLabel : t.downloadLabel}</AppText>
      </Pressable>
    );
  }
  // 'unavailable' (offline, nothing on the phone yet) shows no download pill at all - there is no real action to offer.

  return (
    <View style={[styles.bar, direction]}>
      {download}
      <ShareButton title={entry.occasionLabel} hebrewYear={entry.hebrewYear} occasionId={entry.occasionId} />
    </View>
  );
}

/** Web: `.action-pill` - 36px tall, radius 999, 14px side padding, 6px gap; `.action-pill-primary` drops the border. Shared with ShareButton. */
export const actionPillStyles = StyleSheet.create({
  pill: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  primary: { borderColor: 'transparent' },
});

const styles = StyleSheet.create({
  /** Web: `.action-bar` - wrap, gap 8, margin-bottom 16. */
  bar: { flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600' },
  pending: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
