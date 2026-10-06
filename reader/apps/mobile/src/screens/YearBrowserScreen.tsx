import React, { useMemo } from 'react';
import { useCatalog } from '../catalog/catalogStore';
import { useTranslation } from '../i18n/useTranslation';
import type { YearBrowserScreenProps } from '../navigation/types';
import { entriesWithContentForYear, groupEntriesByMonth } from '../routes/catalogRoutes';
import { Row, RowDistance } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Subtitle } from '../ui/Typography';

/** Browse mode's first screen for a year: only months with something to show, each linking to that month's own occasion list (web: `/browse/:hebrewYear`). */
export function YearBrowserScreen({ navigation, route }: YearBrowserScreenProps) {
  const catalog = useCatalog();
  const { hebrewYear } = route.params;
  const { t, language } = useTranslation();
  const entries = useMemo(() => entriesWithContentForYear(catalog, hebrewYear), [catalog, hebrewYear]);
  const monthGroups = useMemo(() => groupEntriesByMonth(entries, language), [entries, language]);

  return (
    <Screen header={<ScreenHeader back={{ name: 'Farbrengens', params: undefined }} title={t.hebrewYearTitle(hebrewYear)} />}>
      <Subtitle>{t.occasionsIndexed(entries.length)}</Subtitle>
      {monthGroups.map((group) => (
        <Row
          key={group.monthToken}
          label={group.monthName}
          trailing={<RowDistance>{t.occasionsIndexed(group.entries.length)}</RowDistance>}
          onPress={() => navigation.navigate('MonthOccasions', { hebrewYear, monthToken: group.monthToken })}
        />
      ))}
    </Screen>
  );
}
