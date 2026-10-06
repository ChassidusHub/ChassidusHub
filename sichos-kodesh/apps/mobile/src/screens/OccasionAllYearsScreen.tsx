import React, { useMemo } from 'react';
import { View } from 'react-native';
import { resolveOccasionAllYears } from '@sichos-kodesh/catalog';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { occasionTitle } from '@sichos-kodesh/app-core';
import { useCatalog } from '../catalog/catalogStore';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useTranslation } from '../i18n/useTranslation';
import type { OccasionAllYearsScreenProps } from '../navigation/types';
import { useProgressMap } from '../player/useProgressMap';
import { hebrewDayMonthLabel, hebrewYearLabel } from '../utils/formatHebrewDate';
import { Row, RowTrailing } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { CategoryHeader, GapMessage, TabHelp } from '../ui/Typography';

/**
 * This specific occasion in every catalog year it happened, matched by what
 * it is rather than by its date alone (see `resolveOccasionAllYears` in
 * packages/catalog), with whatever else that year has on the same date
 * beneath it as "also on this date" (web: `/occasion-all-years/:sourceHebrewYear/:sourceOccasionId`).
 */
export function OccasionAllYearsScreen({ navigation, route }: OccasionAllYearsScreenProps) {
  const catalog = useCatalog();
  const { sourceHebrewYear, sourceOccasionId } = route.params;
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const sourceEntry: CatalogEntry | undefined = (catalog[sourceHebrewYear] ?? []).find((e) => e.occasionId === sourceOccasionId);
  const yearGroups = useMemo(() => (sourceEntry ? resolveOccasionAllYears(catalog, sourceEntry) : []), [catalog, sourceEntry]);
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
      <TabHelp>{t.thisOccasionAllYearsHelp(occasionTitle(sourceEntry, language), hebrewDayMonthLabel(sourceEntry.hebrewDate, language))}</TabHelp>

      {yearGroups.length === 0 && <GapMessage>{t.noFarbrengensAnyYear}</GapMessage>}

      {yearGroups.map(({ hebrewYear, matches, others }, index) => {
        const open = (entry: CatalogEntry) =>
          navigation.navigate('Farbrengen', {
            kind: 'occasionAllYears',
            sourceHebrewYear,
            sourceOccasionId,
            hebrewYear,
            occasionId: entry.occasionId,
          });
        return (
          <View key={hebrewYear}>
            <CategoryHeader first={index === 0}>{hebrewYearLabel(hebrewYear, language)}</CategoryHeader>
            {matches.map((entry) => (
              <Row
                key={entry.occasionId}
                label={occasionTitle(entry, language)}
                trailing={
                  <RowTrailing>
                    <OccasionRowIcon entry={entry} progressMap={progressMap} />
                  </RowTrailing>
                }
                onPress={() => open(entry)}
              />
            ))}
            {others.length > 0 && (
              <>
                <TabHelp>{t.alsoOnThisDate}</TabHelp>
                {others.map((entry) => (
                  <Row
                    key={entry.occasionId}
                    label={occasionTitle(entry, language)}
                    muted
                    trailing={
                      <RowTrailing>
                        <OccasionRowIcon entry={entry} progressMap={progressMap} />
                      </RowTrailing>
                    }
                    onPress={() => open(entry)}
                  />
                ))}
              </>
            )}
          </View>
        );
      })}
    </Screen>
  );
}
