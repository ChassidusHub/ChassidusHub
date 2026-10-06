import React, { useMemo } from 'react';
import { View } from 'react-native';
import { resolveThisWeekAllYears } from '@chassidushub-reader/catalog';
import { occasionTitle } from '@chassidushub-reader/app-core';
import { useCatalog } from '../catalog/catalogStore';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useTranslation } from '../i18n/useTranslation';
import type { AllYearsThisWeekScreenProps } from '../navigation/types';
import { useProgressMap } from '../player/useProgressMap';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { Row, RowTrailing } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { CategoryHeader, GapMessage, TabHelp } from '../ui/Typography';

/** Every occasion indexed on one of this Hebrew week's dates across every catalog year, not just kvius-matched ones (web: `/this-week-all-years`). */
export function AllYearsThisWeekScreen({ navigation }: AllYearsThisWeekScreenProps) {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const yearGroups = useMemo(() => resolveThisWeekAllYears(catalog), [catalog]);

  return (
    <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title={t.allFarbrengensThisWeekTitle} />}>
      <TabHelp>{t.allFarbrengensThisWeekHelp}</TabHelp>

      {yearGroups.length === 0 && <GapMessage>{t.noFarbrengensAnyYear}</GapMessage>}

      {yearGroups.map(({ hebrewYear, entries }, index) => (
        <View key={hebrewYear}>
          <CategoryHeader first={index === 0}>{hebrewYearLabel(hebrewYear, language)}</CategoryHeader>
          {entries.map((entry) => (
            <Row
              key={entry.occasionId}
              label={occasionTitle(entry, language)}
              trailing={
                <RowTrailing>
                  <OccasionRowIcon entry={entry} progressMap={progressMap} />
                </RowTrailing>
              }
              onPress={() => navigation.navigate('Farbrengen', { kind: 'allYearsThisWeek', hebrewYear, occasionId: entry.occasionId })}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
