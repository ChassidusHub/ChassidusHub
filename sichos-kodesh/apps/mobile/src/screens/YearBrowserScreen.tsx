import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import catalog from '../catalog/data';
import { useTranslation } from '../i18n/useTranslation';
import type { YearBrowserScreenProps } from '../navigation/types';
import { AppText } from '../ui/AppText';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { EmptyState } from '../ui/EmptyState';
import { spacing } from '../ui/theme';
import { entriesWithContentForYear, groupEntriesByMonth } from '../routes/catalogRoutes';

export function YearBrowserScreen({ navigation, route }: YearBrowserScreenProps) {
  const { hebrewYear, initialOccasionId } = route.params;
  const { t, language } = useTranslation();
  const entries = useMemo(
    () => entriesWithContentForYear(catalog, hebrewYear),
    [hebrewYear],
  );
  const monthGroups = useMemo(() => groupEntriesByMonth(entries, language), [entries, language]);

  React.useEffect(() => {
    if (initialOccasionId == null) return;
    navigation.navigate('Farbrengen', {
      kind: 'browse',
      hebrewYear,
      occasionId: initialOccasionId,
    });
  }, [hebrewYear, initialOccasionId, navigation]);

  return (
    <Screen>
      <ScreenHeader
        title={t.hebrewYearTitle(hebrewYear)}
        onBack={() => navigation.goBack()}
        backLabel={t.back}
      />
      <View style={styles.meta}>
        <AppText variant="bodySmall" color="secondary">{t.occasionsIndexed(entries.length)}</AppText>
      </View>
      {entries.length === 0 ? (
        <EmptyState title={t.nothingDownloadable} />
      ) : (
        <FlatList
          data={monthGroups}
          keyExtractor={(item) => item.monthToken}
          renderItem={({ item }) => (
            <ListRow
              label={item.monthName}
              sublabel={t.occasionsIndexed(item.entries.length)}
              right={
                <View style={styles.rowRight}>
                  <AppText color="muted">›</AppText>
                </View>
              }
              onPress={() => navigation.navigate('MonthOccasions', { hebrewYear, monthToken: item.monthToken })}
            />
          )}
          ItemSeparatorComponent={RowSeparator}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
