import React, { useMemo } from 'react';
import { occasionFullName } from '@sichos-kodesh/app-core';
import { useCatalog } from '../catalog/catalogStore';
import { useTranslation } from '../i18n/useTranslation';
import type { CategoryScreenProps } from '../navigation/types';
import { resolveOccasionRoute, selectCategoryPdfs } from '../routes/catalogRoutes';
import { Button } from '../ui/Button';
import { Card, PdfLabel } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { GapMessage, Subtitle } from '../ui/Typography';

/** A PDF section's own page (web: `.../category/:section`) - a label like hagahos's "צילום 1" doesn't make sense without its section header for context. */
export function CategoryScreen({ navigation, route }: CategoryScreenProps) {
  const catalog = useCatalog();
  const { categoryId, ...occasionRoute } = route.params;
  const { t, language } = useTranslation();
  const resolved = useMemo(() => resolveOccasionRoute(catalog, occasionRoute, language), [catalog, language, occasionRoute]);

  if (!resolved) {
    return (
      <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title="" />}>
        <GapMessage>{t.pageNotFound}</GapMessage>
      </Screen>
    );
  }

  const { entry } = resolved;
  const pdfs = selectCategoryPdfs(entry, categoryId, null);

  return (
    <Screen header={<ScreenHeader back={{ name: 'Farbrengen', params: occasionRoute }} title={t.sectionLabels[categoryId]} />}>
      <Subtitle>{occasionFullName(entry, language)}</Subtitle>

      {pdfs.map((pdf) => (
        <Card key={pdf.driveFileId}>
          <PdfLabel>{pdf.label}</PdfLabel>
          <Button
            label={t.read}
            lastInCard
            onPress={() =>
              navigation.navigate('PdfViewer', {
                hebrewYear: entry.hebrewYear,
                occasionId: entry.occasionId,
                driveFileId: pdf.driveFileId,
                resourceKey: pdf.resourceKey ?? null,
                label: pdf.label,
              })
            }
          />
        </Card>
      ))}
    </Screen>
  );
}
