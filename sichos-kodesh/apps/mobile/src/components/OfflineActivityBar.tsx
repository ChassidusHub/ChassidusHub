import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { navigateTo } from '../navigation/navigationRef';
import { useOfflineStatus } from '../offline/offlineJobs';
import { offlineActivityLine, offlineActivityPercent } from '../offline/reportText';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';

/** Like DownloadProgressBar: one line while a pack imports or a ZIP is saved (the app-resume import runs with no screen open), linking to Settings > Offline packs. */
export function OfflineActivityBar() {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const { activity } = useOfflineStatus();

  if (!activity || activity.kind === 'state') return null;
  const percent = offlineActivityPercent(activity);

  return (
    <Pressable onPress={() => navigateTo('Offline', undefined)} accessibilityRole="button" style={[styles.bar, { backgroundColor: colors.bgElevated, borderTopColor: colors.border }]}>
      {percent !== null && <View style={[styles.fill, { backgroundColor: colors.accent, width: `${percent}%` }, isRtl ? styles.fillRtl : styles.fillLtr]} />}
      <AppText style={[styles.label, { color: colors.fg }]} numberOfLines={1}>
        {offlineActivityLine(t, activity)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, opacity: 0.18 },
  fillLtr: { left: 0 },
  fillRtl: { right: 0 },
  label: { fontSize: 13, fontWeight: '600' },
});
