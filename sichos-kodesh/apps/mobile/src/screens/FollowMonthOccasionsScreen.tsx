import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import type { FollowMonthOccasionsScreenProps } from '../navigation/types';
import { monthNameForToken, resolveMonthOccasions } from '../routes/catalogRoutes';
import { AppText } from '../ui/AppText';
import { EmptyState } from '../ui/EmptyState';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { spacing } from '../ui/theme';
import catalog from '../catalog/data';

export function FollowMonthOccasionsScreen({ navigation, route }: FollowMonthOccasionsScreenProps) {
  const { t, language } = useTranslation();
  const entries = useMemo(
    () => resolveMonthOccasions(catalog, route.params.sourceYear, route.params.monthToken),
    [route.params.sourceYear, route.params.monthToken],
  );
  const title = monthNameForToken(route.params.sourceYear, route.params.monthToken, language);

  return (
    <Screen>
      <ScreenHeader
        title={title}
        onBack={() => navigation.navigate('FollowMonthList', { sourceYear: route.params.sourceYear })}
        backLabel={t.back}
      />
      <View style={styles.meta}>
        <AppText variant="bodySmall" color="secondary">
          {t.occasionsIndexed(entries.length)}
        </AppText>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item) => String(item.occasionId)}
        renderItem={({ item }) => (
          <ListRow
            label={item.occasionLabel}
            sublabel={[
              item.audio.length > 0 ? t.recordingsCount(item.audio.length) : null,
              item.pdfs.length > 0 ? t.pdfCount(item.pdfs.length) : null,
            ]
              .filter(Boolean)
              .join(' • ')}
            right={<AppText color="muted">›</AppText>}
            onPress={() =>
              navigation.navigate('Farbrengen', {
                kind: 'follow',
                sourceYear: route.params.sourceYear,
                occasionId: item.occasionId,
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
