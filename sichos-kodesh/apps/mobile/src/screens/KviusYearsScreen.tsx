import React, { useMemo } from 'react';
import { resolveThisWeek, thisWeekDays } from '@sichos-kodesh/catalog';
import type { CatalogByYear } from '@sichos-kodesh/catalog';
import { SPECIAL_ANNIVERSARY_YEARS, findMatchingYears, findPartialWeekMatches } from '@sichos-kodesh/kvius-engine';
import type { MatchingYearResult } from '@sichos-kodesh/kvius-engine';
import { IL } from '../config';
import { useCatalog } from '../catalog/catalogStore';
import { useTranslation } from '../i18n/useTranslation';
import type { KviusYearsScreenProps } from '../navigation/types';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { Row, RowDistance } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { CategoryHeader, TabHelp } from '../ui/Typography';

/** Drops a candidate year with nothing indexed for the current week, then sorts chronologically (oldest first) - `findMatchingYears`/`findPartialWeekMatches` return nearest-first, which is right for finding the best match but wrong for reading a list top to bottom. */
function filterAndSortForDisplay(results: MatchingYearResult[], catalog: CatalogByYear, today: Date): MatchingYearResult[] {
  return results
    .filter((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)
    .slice()
    .sort((a, b) => a.hebrewYear - b.hebrewYear);
}

interface SpecialAnniversaryMatch {
  hebrewYear: number;
  anniversaryNumber: number;
}

/** Years hitting a round-number anniversary this calendar year - independent of kvius matching, so a separate section. Same "must have something for this week, oldest first" filtering as the other two. */
function findSpecialAnniversaries(targetYear: number, catalog: CatalogByYear, today: Date): SpecialAnniversaryMatch[] {
  return SPECIAL_ANNIVERSARY_YEARS.map((anniversaryNumber) => ({ hebrewYear: targetYear - anniversaryNumber, anniversaryNumber }))
    .filter((item) => resolveThisWeek(item.hebrewYear, catalog, today).length > 0)
    .sort((a, b) => a.hebrewYear - b.hebrewYear);
}

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
