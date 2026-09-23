import React, { useMemo } from 'react';
import { View } from 'react-native';
import { resolveOccasionAllYears } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useTranslation } from '../i18n/useTranslation';
import type { OccasionAllYearsScreenProps } from '../navigation/types';
import { useProgressMap } from '../player/useProgressMap';
import { hebrewDayMonthLabel, hebrewYearLabel } from '../utils/formatHebrewDate';
import { Row, RowTrailing } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { CategoryHeader, GapMessage, TabHelp } from '../ui/Typography';

/** Every occasion indexed on the same Hebrew (month, day) as this specific occasion, across every catalog year (web: `/occasion-all-years/:sourceHebrewYear/:sourceOccasionId`). */
export function OccasionAllYearsScreen({ navigation, route }: OccasionAllYearsScreenProps) {
  const { sourceHebrewYear, sourceOccasionId } = route.params;
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const sourceEntry: CatalogEntry | undefined = (catalog[sourceHebrewYear] ?? []).find((e) => e.occasionId === sourceOccasionId);
  const yearGroups = useMemo(() => (sourceEntry ? resolveOccasionAllYears(catalog, sourceEntry.hebrewDate) : []), [sourceEntry]);
  const back = { name: 'Farbrengen', params: { kind: 'browse', hebrewYear: sourceHebrewYear, occasionId: sourceOccasionId } } as const;

  if (!sourceEntry) {
    return (
      <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title="" />}>
        <GapMessage>{t.occasionNotFound}</GapMessage>
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader back={back} title={t.thisOccasionAllYearsTitle} />}>
      <TabHelp>{t.thisOccasionAllYearsHelp(hebrewDayMonthLabel(sourceEntry.hebrewDate, language))}</TabHelp>

      {yearGroups.length === 0 && <GapMessage>{t.noFarbrengensAnyYear}</GapMessage>}

      {yearGroups.map(({ hebrewYear, entries }, index) => (
        <View key={hebrewYear}>
          <CategoryHeader first={index === 0}>{hebrewYearLabel(hebrewYear, language)}</CategoryHeader>
          {entries.map((entry) => (
            <Row
              key={entry.occasionId}
              label={entry.occasionLabel}
              trailing={
                <RowTrailing>
                  <OccasionRowIcon entry={entry} progressMap={progressMap} />
                </RowTrailing>
              }
              onPress={() =>
                navigation.navigate('Farbrengen', {
                  kind: 'occasionAllYears',
                  sourceHebrewYear,
                  sourceOccasionId,
                  hebrewYear,
                  occasionId: entry.occasionId,
                })
              }
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
