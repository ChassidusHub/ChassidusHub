import React, { useMemo } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import type { OccasionAllYearsScreenProps } from '../navigation/types';
import { resolveOccasionAllYearsGroups } from '../routes/catalogRoutes';
import { AppText } from '../ui/AppText';
import { EmptyState } from '../ui/EmptyState';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SectionLabel } from '../ui/SectionLabel';
import { spacing } from '../ui/theme';
import catalog from '../catalog/data';
import { hebrewDayMonthLabel, hebrewYearLabel } from '../utils/formatHebrewDate';

export function OccasionAllYearsScreen({ navigation, route }: OccasionAllYearsScreenProps) {
  const { t, language } = useTranslation();
  const { sourceEntry, yearGroups } = useMemo(
    () => resolveOccasionAllYearsGroups(catalog, route.params.sourceHebrewYear, route.params.sourceOccasionId),
    [route.params.sourceHebrewYear, route.params.sourceOccasionId],
  );
  const sections = useMemo(
    () =>
      yearGroups.map((group) => ({
        title: hebrewYearLabel(group.hebrewYear, language),
        hebrewYear: group.hebrewYear,
        data: group.entries,
      })),
    [language, yearGroups],
  );

  if (!sourceEntry) {
    return (
      <Screen>
        <ScreenHeader title={t.occasionNotFound} onBack={() => navigation.goBack()} backLabel={t.back} />
        <EmptyState title={t.occasionNotFound} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={t.thisOccasionAllYearsTitle}
        onBack={() =>
          navigation.navigate(
            'Farbrengen',
            route.params.sourceRoute ?? {
              kind: 'browse',
              hebrewYear: sourceEntry.hebrewYear,
              occasionId: sourceEntry.occasionId,
            },
          )
        }
        backLabel={t.back}
      />
      <View style={styles.meta}>
        <AppText variant="bodySmall" color="muted">
          {t.thisOccasionAllYearsHelp(hebrewDayMonthLabel(sourceEntry.hebrewDate, language))}
        </AppText>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.hebrewYear}-${item.occasionId}`}
        renderSectionHeader={({ section }) => <SectionLabel label={section.title} />}
        renderItem={({ item, section }) => (
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
                kind: 'occasionAllYears',
                sourceHebrewYear: sourceEntry.hebrewYear,
                sourceOccasionId: sourceEntry.occasionId,
                hebrewYear: section.hebrewYear,
                occasionId: item.occasionId,
              })
            }
          />
        )}
        ItemSeparatorComponent={RowSeparator}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={<EmptyState title={t.noFarbrengensAnyYear} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
});
