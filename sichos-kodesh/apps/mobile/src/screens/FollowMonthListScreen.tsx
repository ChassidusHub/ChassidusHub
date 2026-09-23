import React, { useMemo } from 'react';
import catalog from '../catalog/data';
import { useTranslation } from '../i18n/useTranslation';
import type { FollowMonthListScreenProps } from '../navigation/types';
import { entriesWithContentForYear, groupEntriesByMonth } from '../routes/catalogRoutes';
import { Row, RowDistance } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Subtitle } from '../ui/Typography';

/** Follow-flow twin of YearBrowserScreen: same month-first browsing, linking into the follow flow instead (web: `/follow/:sourceYear/month`). */
export function FollowMonthListScreen({ navigation, route }: FollowMonthListScreenProps) {
  const { sourceYear } = route.params;
  const { t, language } = useTranslation();
  const entries = useMemo(() => entriesWithContentForYear(catalog, sourceYear), [sourceYear]);
  const monthGroups = useMemo(() => groupEntriesByMonth(entries, language), [entries, language]);

  return (
    <Screen header={<ScreenHeader back={{ name: 'ThisWeek', params: { sourceYear } }} title={t.allOfYear(sourceYear)} />}>
      <Subtitle>{t.occasionsIndexed(entries.length)}</Subtitle>
      {monthGroups.map((group) => (
        <Row
          key={group.monthToken}
          label={group.monthName}
          trailing={<RowDistance>{t.occasionsIndexed(group.entries.length)}</RowDistance>}
          onPress={() => navigation.navigate('FollowMonthOccasions', { sourceYear, monthToken: group.monthToken })}
        />
      ))}
    </Screen>
  );
}
