import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useActiveDownloads } from '../download/useActiveDownloads';
import { useTranslation } from '../i18n/useTranslation';
import { navigateTo } from '../navigation/navigationRef';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';

/** A slim, always-visible-while-downloading strip stacked above the player bar - a glanceable summary linking to DownloadedScreen's own "in progress" section. */
export function DownloadProgressBar() {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const { count, percent } = useActiveDownloads();

  if (count === 0) return null;

  return (
    <Pressable onPress={() => navigateTo('Downloaded', undefined)} accessibilityRole="button" style={[styles.bar, { backgroundColor: colors.bgElevated, borderTopColor: colors.border }]}>
      <View style={[styles.fill, { backgroundColor: colors.accent, width: `${percent}%` }, isRtl ? styles.fillRtl : styles.fillLtr]} />
      <AppText style={[styles.label, { color: colors.fg }]}>
        {t.downloadingCount(count)} · {percent}%
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Web: `.download-progress-bar` - padding 10px 16px, 1px top border, 13px/600. */
  bar: { paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, opacity: 0.18 },
  fillLtr: { left: 0 },
  fillRtl: { right: 0 },
  label: { fontSize: 13, fontWeight: '600' },
});
