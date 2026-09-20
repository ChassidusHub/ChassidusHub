import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import type { WeekOccasion } from '@sichos-kodesh/catalog';
import { ALL_CONTENT_TYPES, listDownloadTargets } from '@sichos-kodesh/app-core';
import catalog from '../catalog/data';
import { useTranslation } from '../i18n/useTranslation';
import { useDownload } from '../download/useDownload';
import { useDownloadState } from '../download/useDownloadState';
import type { ThisWeekScreenProps } from '../navigation/types';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { EmptyState } from '../ui/EmptyState';
import { spacing } from '../ui/theme';
import { hebrewDayMonthLabel } from '../utils/formatHebrewDate';

function StatusAccessory({ state }: { state: ReturnType<typeof useDownloadState> }) {
  if (state === 'downloaded') return <AppText color="accent">✓</AppText>;
  if (state === 'downloading') return <AppText color="accent">↓</AppText>;
  if (state === 'queued') return <AppText color="muted">…</AppText>;
  if (state === 'error') return <AppText color="error">!</AppText>;
  return null;
}

function OccasionRow({ item, onPress }: { item: WeekOccasion; onPress: () => void }) {
  const state = useDownloadState(item.entry);
  const { language } = useTranslation();
  return (
    <ListRow
      label={item.entry.occasionLabel}
      sublabel={hebrewDayMonthLabel(item.hebrewDate, language)}
      right={
        <View style={styles.rowRight}>
          <StatusAccessory state={state} />
          <AppText color="muted">›</AppText>
        </View>
      }
      onPress={onPress}
    />
  );
}

export function ThisWeekScreen({ navigation, route }: ThisWeekScreenProps) {
  const { sourceYear } = route.params;
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog), [sourceYear]);
  const { t } = useTranslation();
  const { enqueueTargets, settings } = useDownload();
  const footer = occasions.length > 0 ? (
    <View style={styles.footer}>
      <RowSeparator />
      <ListRow
        label={t.allOfYear(sourceYear)}
        right={<AppText color="muted">›</AppText>}
        onPress={() => navigation.navigate('FollowMonthList', { sourceYear })}
      />
    </View>
  ) : undefined;

  return (
    <Screen>
      <ScreenHeader title={t.thisWeek} onBack={() => navigation.goBack()} backLabel={t.changeYear} />
      <View style={styles.meta}>
        <AppText variant="bodySmall" color="secondary">{t.fromHebrewYear(sourceYear)}</AppText>
        {occasions.length > 0 ? (
          <AppButton
            label={t.downloadThisWeekLabel}
            variant="secondary"
            style={styles.downloadWeekButton}
            onPress={() => {
              enqueueTargets(
                listDownloadTargets(
                  occasions.map((item) => item.entry),
                  settings.manualDownloadAllContent ? ALL_CONTENT_TYPES : settings.contentTypes,
                ),
              ).catch(() => undefined);
            }}
          />
        ) : null}
      </View>
      <FlatList
        data={occasions}
        keyExtractor={(item) => String(item.entry.occasionId)}
        renderItem={({ item }) => (
          <OccasionRow
            item={item}
            onPress={() =>
              navigation.navigate('Farbrengen', {
                kind: 'follow',
                sourceYear,
                occasionId: item.entry.occasionId,
              })
            }
          />
        )}
        ItemSeparatorComponent={RowSeparator}
        ListEmptyComponent={<EmptyState title={t.nothingThisWeek(sourceYear)} />}
        ListFooterComponent={footer}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs, gap: spacing.sm },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  downloadWeekButton: { alignSelf: 'flex-start' },
  footer: { paddingBottom: spacing.xl },
});
