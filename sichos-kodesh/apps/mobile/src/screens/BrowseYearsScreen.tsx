import React from 'react';
import { browsableYears } from '@sichos-kodesh/catalog';
import { useCatalog } from '../catalog/catalogStore';
import { useTranslation } from '../i18n/useTranslation';
import type { BrowseYearsScreenProps } from '../navigation/types';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { Row } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { TabHelp } from '../ui/Typography';

/** Every year with something indexed (web: `/years`). */
export function BrowseYearsScreen({ navigation }: BrowseYearsScreenProps) {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const allYears = browsableYears(catalog);

  return (
    <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title={t.browseAnyYear} />}>
      <TabHelp>{t.browseHelp}</TabHelp>
      {allYears.map((year) => (
        <Row key={year} label={hebrewYearLabel(year, language)} onPress={() => navigation.navigate('YearBrowser', { hebrewYear: year })} />
      ))}
    </Screen>
  );
}
