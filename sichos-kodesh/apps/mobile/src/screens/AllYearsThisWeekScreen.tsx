import React, { useMemo } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import type { AllYearsThisWeekScreenProps } from '../navigation/types';
import { resolveAllYearsThisWeekGroups } from '../routes/catalogRoutes';
import { AppText } from '../ui/AppText';
import { EmptyState } from '../ui/EmptyState';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SectionLabel } from '../ui/SectionLabel';
import { spacing } from '../ui/theme';
import catalog from '../catalog/data';
import { hebrewYearLabel } from '../utils/formatHebrewDate';

export function AllYearsThisWeekScreen({ navigation }: AllYearsThisWeekScreenProps) {
  const { t, language } = useTranslation();
  const sections = useMemo(
    () =>
      resolveAllYearsThisWeekGroups(catalog).map((group) => ({
        title: hebrewYearLabel(group.hebrewYear, language),
        hebrewYear: group.hebrewYear,
        data: group.entries,
      })),
    [language],
  );

  return (
    <Screen>
      <ScreenHeader
        title={t.allFarbrengensThisWeekTitle}
        onBack={() => navigation.goBack()}
        backLabel={t.back}
      />
      <View style={styles.meta}>
        <AppText variant="bodySmall" color="muted">
          {t.allFarbrengensThisWeekHelp}
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
                kind: 'allYearsThisWeek',
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
