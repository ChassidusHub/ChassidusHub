import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle2, Download } from 'lucide-react-native';
import type { RowDownloadState } from '../download/downloadContext';
import { useTranslation } from '../i18n/useTranslation';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { hexWithAlpha } from '../ui/color';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';
import { DownloadProgressRing } from './DownloadProgressRing';
import { actionPillStyles } from './OccasionActions';

interface Props {
  state: RowDownloadState;
  progress: number | undefined;
  onStart: () => void;
}

/** OccasionActions' Download pill for anything that is not one occasion (a library item): start, then live progress, then "Downloaded". */
export function DownloadPill({ state, progress, onStart }: Props) {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const tint = hexWithAlpha(colors.accent, 0.14);
  const direction = { flexDirection: row(isRtl) } as const;

  if (state === 'unavailable') return null;
  if (state === 'downloaded') {
    return (
      <View style={[actionPillStyles.pill, actionPillStyles.primary, direction, { backgroundColor: tint }]} accessibilityRole="text" accessibilityLabel={t.downloadedLabel}>
        <CheckCircle2 size={16} color={colors.accent} />
        <AppText style={[styles.label, { color: colors.accent }]}>{t.downloadedLabel}</AppText>
      </View>
    );
  }
  if (state === 'downloading' || state === 'queued') {
    return (
      <View style={[actionPillStyles.pill, actionPillStyles.primary, direction, { backgroundColor: tint }]} accessibilityRole="text" accessibilityLabel={t.downloadingLabel}>
        {progress !== undefined ? <DownloadProgressRing size={16} progress={progress} /> : <Spinner size={16} color={colors.accent} />}
        <AppText style={[styles.label, { color: colors.accent }]}>{t.downloadingLabel}</AppText>
      </View>
    );
  }
  const pending = state === 'loading';
  return (
    <Pressable
      onPress={onStart}
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

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600' },
  pending: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
