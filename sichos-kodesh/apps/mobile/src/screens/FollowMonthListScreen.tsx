import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import type { FollowMonthListScreenProps } from '../navigation/types';
import { entriesWithContentForYear, groupEntriesByMonth } from '../routes/catalogRoutes';
import { AppText } from '../ui/AppText';
import { EmptyState } from '../ui/EmptyState';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { spacing } from '../ui/theme';
import catalog from '../catalog/data';

export function FollowMonthListScreen({ navigation, route }: FollowMonthListScreenProps) {
  const { t, language } = useTranslation();
  const entries = useMemo(
    () => entriesWithContentForYear(catalog, route.params.sourceYear),
    [route.params.sourceYear],
  );
  const monthGroups = useMemo(() => groupEntriesByMonth(entries, language), [entries, language]);

  return (
    <Screen>
      <ScreenHeader
        title={t.allOfYear(route.params.sourceYear)}
        onBack={() => navigation.navigate('ThisWeek', { sourceYear: route.params.sourceYear })}
        backLabel={t.back}
      />
      <View style={styles.meta}>
        <AppText variant="bodySmall" color="secondary">
          {t.occasionsIndexed(entries.length)}
        </AppText>
      </View>
      <FlatList
        data={monthGroups}
        keyExtractor={(item) => item.monthToken}
        renderItem={({ item }) => (
          <ListRow
            label={item.monthName}
            sublabel={t.occasionsIndexed(item.entries.length)}
            right={<AppText color="muted">›</AppText>}
            onPress={() =>
              navigation.navigate('FollowMonthOccasions', {
                sourceYear: route.params.sourceYear,
                monthToken: item.monthToken,
              })
            }
          />
        )}
        ItemSeparatorComponent={RowSeparator}
        ListEmptyComponent={<EmptyState title={t.nothingDownloadable} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
});
