import React, { useMemo } from 'react';
import { thisWeekDays } from '@chassidushub-reader/catalog';
import { findMatchingYears, findPartialWeekMatches } from '@chassidushub-reader/kvius-engine';
import { IL } from '../config';
import { useCatalog } from '../catalog/catalogStore';
import { useTranslation } from '../i18n/useTranslation';
import type { KviusYearsScreenProps } from '../navigation/types';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { filterAndSortForDisplay, findSpecialAnniversaries } from '../utils/weekYears';
import { Row, RowDistance } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { CategoryHeader, TabHelp } from '../ui/Typography';

/** Every kvius-matched year with something indexed for the current week, oldest first; below it, partial (this-week-only) matches and special anniversaries (web: `/kvius`). */
export function KviusYearsScreen({ navigation, route }: KviusYearsScreenProps) {
  const { targetYear } = route.params;
  const { t, language } = useTranslation();
  const catalog = useCatalog();
  const today = useMemo(() => new Date(), []);
  const matches = useMemo(() => filterAndSortForDisplay(findMatchingYears(targetYear), catalog, today), [catalog, targetYear, today]);
  const partialMatches = useMemo(() => filterAndSortForDisplay(findPartialWeekMatches(targetYear, thisWeekDays(today), IL), catalog, today), [catalog, targetYear, today]);
  const specialAnniversaries = useMemo(() => findSpecialAnniversaries(targetYear, catalog, today), [catalog, targetYear, today]);

  return (
    <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title={t.weekKviusFarbrengens} />}>
      <TabHelp>{t.kviusHelp(targetYear)}</TabHelp>
      {matches.map((item) => (
        <Row key={item.hebrewYear} label={hebrewYearLabel(item.hebrewYear, language)} onPress={() => navigation.navigate('ThisWeek', { sourceYear: item.hebrewYear })} />
      ))}

      {partialMatches.length > 0 && (
        <>
          <CategoryHeader>{t.partialKviusMatchesHeader}</CategoryHeader>
          <TabHelp>{t.partialKviusMatchesHelp}</TabHelp>
          {partialMatches.map((item) => (
            <Row key={item.hebrewYear} label={hebrewYearLabel(item.hebrewYear, language)} onPress={() => navigation.navigate('ThisWeek', { sourceYear: item.hebrewYear })} />
          ))}
        </>
      )}

      {specialAnniversaries.length > 0 && (
        <>
          <CategoryHeader>{t.specialAnniversariesHeader}</CategoryHeader>
          <TabHelp>{t.specialAnniversariesHelp}</TabHelp>
          {specialAnniversaries.map((item) => (
            <Row
              key={item.hebrewYear}
              label={hebrewYearLabel(item.hebrewYear, language)}
              trailing={<RowDistance>{t.specialAnniversaryLabel(item.anniversaryNumber)}</RowDistance>}
              onPress={() => navigation.navigate('ThisWeek', { sourceYear: item.hebrewYear })}
            />
          ))}
        </>
      )}
    </Screen>
  );
}
