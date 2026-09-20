import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import type { CategoryScreenProps } from '../navigation/types';
import { resolveOccasionRoute, selectCategoryPdfs } from '../routes/catalogRoutes';
import { useEditionPreference } from '../settings/editionPreference';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { spacing, typography } from '../ui/theme';
import catalog from '../catalog/data';

export function CategoryScreen({ navigation, route }: CategoryScreenProps) {
  const { t, language } = useTranslation();
  const [editionPreference] = useEditionPreference();
  const resolved = useMemo(
    () => resolveOccasionRoute(catalog, route.params, language),
    [language, route.params],
  );

  if (!resolved) {
    return (
      <Screen>
        <ScreenHeader title={t.occasionNotFound} onBack={() => navigation.goBack()} backLabel={t.back} />
        <EmptyState title={t.occasionNotFound} />
      </Screen>
    );
  }

  const pdfs = selectCategoryPdfs(resolved.entry, route.params.categoryId, editionPreference);

  return (
    <Screen>
      <ScreenHeader
        title={t.sectionLabels[route.params.categoryId]}
        onBack={() => navigation.navigate('Farbrengen', route.params)}
        backLabel={t.back}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="bodySmall" color="secondary">
          {resolved.entry.occasionLabel}
        </AppText>

        {pdfs.length === 0 ? (
          <EmptyState title={t.pdfNotFound} />
        ) : (
          pdfs.map((pdf) => (
            <Card key={pdf.driveFileId} style={styles.card}>
              <AppText style={styles.title}>{pdf.label}</AppText>
              <AppButton
                label={t.read}
                onPress={() =>
                  navigation.navigate('PdfViewer', {
                    hebrewYear: resolved.entry.hebrewYear,
                    occasionId: resolved.entry.occasionId,
                    driveFileId: pdf.driveFileId,
                    resourceKey: pdf.resourceKey ?? null,
                    label: pdf.label,
                  })
                }
              />
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { gap: spacing.sm },
  title: typography.bodyMedium,
});
