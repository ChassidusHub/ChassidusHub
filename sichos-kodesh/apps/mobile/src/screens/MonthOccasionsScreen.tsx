import React, { useMemo } from 'react';
import { useCatalog } from '../catalog/catalogStore';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useTranslation } from '../i18n/useTranslation';
import type { MonthOccasionsScreenProps } from '../navigation/types';
import { useProgressMap } from '../player/useProgressMap';
import { monthNameForToken, resolveMonthOccasions } from '../routes/catalogRoutes';
import { Row, RowTrailing } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Subtitle } from '../ui/Typography';

/** One month of a browsed year (web: `/browse/:hebrewYear/month/:monthToken`). */
export function MonthOccasionsScreen({ navigation, route }: MonthOccasionsScreenProps) {
  const catalog = useCatalog();
  const { hebrewYear, monthToken } = route.params;
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const entries = useMemo(() => resolveMonthOccasions(catalog, hebrewYear, monthToken), [catalog, hebrewYear, monthToken]);
  const monthName = monthNameForToken(hebrewYear, monthToken, language);

  return (
    <Screen header={<ScreenHeader back={{ name: 'YearBrowser', params: { hebrewYear } }} title={monthName} />}>
      <Subtitle>{t.occasionsIndexed(entries.length)}</Subtitle>
      {entries.map((entry) => (
        <Row
          key={entry.occasionId}
          label={entry.occasionLabel}
          trailing={
            <RowTrailing>
              <OccasionRowIcon entry={entry} progressMap={progressMap} />
            </RowTrailing>
          }
          onPress={() => navigation.navigate('Farbrengen', { kind: 'browse', hebrewYear, occasionId: entry.occasionId })}
        />
      ))}
    </Screen>
  );
}
