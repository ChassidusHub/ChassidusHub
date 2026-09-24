import React, { useMemo } from 'react';
import { useCatalog, useLibrary } from '../../catalog/catalogStore';
import { OccasionRowIcon } from '../../components/OccasionRowIcon';
import { useTranslation } from '../../i18n/useTranslation';
import { occasionGroupEntries } from '../../library/libraryModel';
import type { OccasionGroupScreenProps } from '../../navigation/types';
import { useProgressMap } from '../../player/useProgressMap';
import { CategoryHeader, Subtitle } from '../../ui/Typography';
import { Row, RowDistance, RowTrailing } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { hebrewDayMonthLabel, hebrewYearLabel } from '../../utils/formatHebrewDate';

/** Every farbrengen mafteiach lists for one moed or parsha, year by year. */
export function OccasionGroupScreen({ navigation, route }: OccasionGroupScreenProps) {
  const library = useLibrary();
  const catalog = useCatalog();
  const progressMap = useProgressMap();
  const { t, language } = useTranslation();
  const { axis, slug } = route.params;
  const group = (axis === 'moadim' ? library.moadim : library.parshiyos).find((g) => g.slug === slug);
  const entries = useMemo(() => (group ? occasionGroupEntries(catalog, group) : []), [catalog, group]);

  const byYear: Array<{ year: number; entries: typeof entries }> = [];
  for (const entry of entries) {
    const last = byYear[byYear.length - 1];
    if (last && last.year === entry.hebrewYear) last.entries.push(entry);
    else byYear.push({ year: entry.hebrewYear, entries: [entry] });
  }

  return (
    <Screen header={<ScreenHeader back={{ name: 'OccasionGroups', params: { axis } }} title={group?.name ?? ''} />}>
      <Subtitle>{t.occasionsIndexed(entries.length)}</Subtitle>
      {byYear.map(({ year, entries: yearEntries }, index) => (
        <React.Fragment key={year}>
          <CategoryHeader first={index === 0}>{hebrewYearLabel(year, language)}</CategoryHeader>
          {yearEntries.map((entry) => (
            <Row
              key={entry.occasionId}
              label={entry.occasionLabel}
              trailing={
                <RowTrailing>
                  <OccasionRowIcon entry={entry} progressMap={progressMap} dateSlot={<RowDistance standalone={false}>{hebrewDayMonthLabel(entry.hebrewDate, language)}</RowDistance>} />
                </RowTrailing>
              }
              onPress={() => navigation.navigate('Farbrengen', { kind: 'browse', hebrewYear: entry.hebrewYear, occasionId: entry.occasionId })}
            />
          ))}
        </React.Fragment>
      ))}
    </Screen>
  );
}
