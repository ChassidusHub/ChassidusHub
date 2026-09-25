import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle2, Download } from 'lucide-react-native';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { occasionTitle } from '@sichos-kodesh/app-core';
import { useDownload } from '../download/useDownload';
import { useOnlineMode } from '../appMode/appMode';
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
  /** The recordings screen keeps its own "download all" icon in the playlist header and shows only the Share pill here. */
  showDownload?: boolean;
}

/**
 * The action bar under an occasion's title: a Download pill and a Share
 * pill of the same shape, side by side (web: `.action-bar` /
 * `.action-pill`). The download pill is the whole state in one place - a
 * button to start, then the live progress, then "Downloaded" - instead of
 * a text link next to a status line. The recordings screen renders the
 * same bar with Share alone (its download lives in the playlist header).
 */
export function OccasionActions({ entry, showDownload = true }: Props) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const { downloadOccasion } = useDownload();
  const state = useDownloadState(entry);
  const progress = useDownloadProgress(entry);
  const onlineMode = useOnlineMode();
  const tint = hexWithAlpha(colors.accent, 0.14);
  const direction = { flexDirection: row(isRtl) } as const;

  let download = null;
  // Offline pack mode has no downloads to offer or report: Share alone.
  if (!showDownload || !onlineMode) {
    download = null;
  } else if (state === 'downloaded') {
    download = (
      <View style={[actionPillStyles.pill, actionPillStyles.primary, direction, { backgroundColor: tint }]} accessibilityRole="text" accessibilityLabel={t.downloadedLabel}>
        <CheckCircle2 size={16} color={colors.accent} />
        <AppText style={[styles.label, { color: colors.accent }]}>{t.downloadedLabel}</AppText>
      </View>
    );
  } else if (state === 'downloading' || state === 'queued') {
    download = (
      <View style={[actionPillStyles.pill, actionPillStyles.primary, direction, { backgroundColor: tint }]} accessibilityRole="text" accessibilityLabel={t.downloadingLabel}>
        {progress !== undefined ? <DownloadProgressRing size={16} progress={progress} /> : <Spinner size={16} color={colors.accent} />}
        <AppText style={[styles.label, { color: colors.accent }]}>{t.downloadingLabel}</AppText>
      </View>
    );
  } else if (state === 'none' || state === 'loading') {
    // 'loading' (the brief storage lookup) draws the same pill, dimmed and inert, so the bar never pops in a moment after the screen.
    const pending = state === 'loading';
    download = (
      <Pressable
        onPress={() => {
          downloadOccasion(entry).catch(() => undefined);
        }}
        disabled={pending}
        hitSlop={6}
        accessibilityRole="button"
        style={({ pressed }) => [actionPillStyles.pill, actionPillStyles.primary, direction, { backgroundColor: tint }, pending && styles.pending, pressed && styles.pressed]}
      >
        <Download size={16} color={colors.accent} />
        <AppText style={[styles.label, { color: colors.accent }]}>{t.downloadLabel}</AppText>
      </Pressable>
    );
  }
  // 'unavailable' (offline, nothing on the phone yet) shows no download pill at all - there is no real action to offer.

  return (
    <View style={[styles.bar, direction]}>
      {download}
      <ShareButton title={occasionTitle(entry, language)} hebrewYear={entry.hebrewYear} occasionId={entry.occasionId} />
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
