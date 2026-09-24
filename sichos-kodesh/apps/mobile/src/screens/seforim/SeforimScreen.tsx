import React, { useMemo } from 'react';
import { Search } from 'lucide-react-native';
import { catalogUnit } from '@sichos-kodesh/catalog';
import { getWorkContents, useShelf, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { SeforimScreenProps } from '../../navigation/types';
import { authorSections, authorShelf, names, scanCount, unitsAreLetters, workKind, workScans } from '@sichos-kodesh/app-core';
import { recentPlaces, useReadingState } from '../../seforim/readingState';
import { CategoryRow } from '../../ui/CategoryRow';
import { Row, RowDistance, RowTrailing } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { CategoryHeader, TabHelp } from '../../ui/Typography';
import { useColors } from '../../ui/theme';

/**
 * The seforim (catalog schema 3): where the reader left off, the
 * bookmarks, then the Rebbeim in order - the Baal Shem Tov and the Maggid,
 * the Alter Rebbe to the Rebbe - each with his seforim, and his other books
 * on HebrewBooks.
 */
export function SeforimScreen({ navigation }: SeforimScreenProps) {
  const works = useWorks();
  const shelf = useShelf();
  const reading = useReadingState();
  const { t, language } = useTranslation();
  const colors = useColors();
  const sections = useMemo(() => authorSections(works), [works]);
  const byId = useMemo(() => new Map(works.works.map((w) => [w.id, w])), [works]);
  const recent = recentPlaces(reading);

  const unitLabel = (workId: string, unitId: string) => {
    const unit = getWorkContents(workId) ? catalogUnit(getWorkContents(workId)!, unitId) : undefined;
    return unit ? (language === 'en' ? (unit.labelEn ?? unit.label) : unit.label) : unitId;
  };

  const meta = (workId: string): string => {
    const work = byId.get(workId)!;
    switch (workKind(work)) {
      case 'read':
        return t.seforimChapters(work.units ?? 0, unitsAreLetters(work));
      case 'collection':
        return t.seforimInLibrary;
      case 'links': {
        const scans = scanCount(workScans(shelf, workId));
        return scans > 0 ? t.seforimScans(scans) : t.seforimLink;
      }
      default:
        return '';
    }
  };

  // An author's books on HebrewBooks that no sefer here holds.
  const shelfRow = (authorId: string | null) => {
    const count = scanCount(authorShelf(shelf, authorId));
    if (count === 0) return null;
    return (
      <Row
        label={authorId ? t.shelfRow : t.shelfOthersRow}
        trailing={
          <RowTrailing>
            <RowDistance standalone={false}>{t.shelfBooks(count)}</RowDistance>
          </RowTrailing>
        }
        onPress={() => navigation.navigate('HebrewBooksShelf', { authorId })}
      />
    );
  };

  return (
    <Screen header={<ScreenHeader back={{ name: 'Library', params: undefined }} title={t.seforimTitle} />}>
      <TabHelp>{t.seforimHelp}</TabHelp>
      <CategoryRow label={t.seforimSearchRow} trailing={<Search size={18} color={colors.muted} />} onPress={() => navigation.navigate('SeforimSearch')} />

      {recent.length > 0 && (
        <>
          <CategoryHeader>{t.seforimContinue}</CategoryHeader>
          {recent
            .filter(({ workId }) => byId.has(workId))
            .map(({ workId, place }) => (
              <Row
                key={workId}
                label={`${names(byId.get(workId)!.title, language)} · ${unitLabel(workId, place.unitId)}`}
                onPress={() => navigation.navigate('Reader', { workId, unitId: place.unitId, source: place.source })}
              />
            ))}
        </>
      )}

      {reading.bookmarks.length > 0 && (
        <>
          <CategoryHeader>{t.seforimBookmarks}</CategoryHeader>
          {reading.bookmarks
            .filter((b) => byId.has(b.workId))
            .map((b) => (
              <Row key={`${b.workId}/${b.unitId}`} label={`${names(byId.get(b.workId)!.title, language)} · ${unitLabel(b.workId, b.unitId)}`} onPress={() => navigation.navigate('Reader', { workId: b.workId, unitId: b.unitId })} />
            ))}
        </>
      )}

      {sections.map((section) => (
        <React.Fragment key={section.author?.id ?? 'others'}>
          <CategoryHeader>{section.author ? names(section.author.name, language) : t.seforimOtherAuthors}</CategoryHeader>
          {section.works.map((work) => (
            <Row
              key={work.id}
              label={names(work.title, language)}
              muted={workKind(work) === 'listed'}
              trailing={
                <RowTrailing>
                  <RowDistance standalone={false}>{meta(work.id)}</RowDistance>
                </RowTrailing>
              }
              onPress={() => navigation.navigate('Work', { workId: work.id })}
            />
          ))}
          {shelfRow(section.author?.id ?? null)}
        </React.Fragment>
      ))}
      {!sections.some((section) => !section.author) && authorShelf(shelf, null).length > 0 && (
        <>
          <CategoryHeader>{t.seforimOtherAuthors}</CategoryHeader>
          {shelfRow(null)}
        </>
      )}
    </Screen>
  );
}
