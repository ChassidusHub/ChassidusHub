import React, { useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { catalogUnit } from '@sichos-kodesh/catalog';
import { names } from '@sichos-kodesh/app-core';
import { getWorkContents, useWorks } from '../catalog/catalogStore';
import { useTranslation } from '../i18n/useTranslation';
import type { RootStackParamList } from '../navigation/types';
import { recentPlaces, useReadingState } from '../seforim/readingState';
import { Row } from '../ui/Row';
import { CategoryHeader } from '../ui/Typography';

/**
 * Where the reader left off in each sefer, and the bookmarks (web:
 * ReadingPlaces; the redo plan's "שלי": history and bookmarks) - each
 * opening the reader right there. Nothing shows until something was read.
 */
export function ReadingPlaces() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const works = useWorks();
  const reading = useReadingState();
  const { t, language } = useTranslation();
  const byId = useMemo(() => new Map(works.works.map((w) => [w.id, w])), [works]);
  const recent = recentPlaces(reading).filter(({ workId }) => byId.has(workId));
  const bookmarks = reading.bookmarks.filter((b) => byId.has(b.workId));

  const unitLabel = (workId: string, unitId: string) => {
    const contents = getWorkContents(workId);
    const unit = contents ? catalogUnit(contents, unitId) : undefined;
    return unit ? (language === 'en' ? (unit.labelEn ?? unit.label) : unit.label) : unitId;
  };
  const label = (workId: string, unitId: string) => `${names(byId.get(workId)!.title, language)} · ${unitLabel(workId, unitId)}`;

  return (
    <>
      {recent.length > 0 && (
        <>
          <CategoryHeader>{t.seforimContinue}</CategoryHeader>
          {recent.map(({ workId, place }) => (
            <Row key={workId} label={label(workId, place.unitId)} onPress={() => navigation.navigate('Reader', { workId, unitId: place.unitId, source: place.source })} />
          ))}
        </>
      )}
      {bookmarks.length > 0 && (
        <>
          <CategoryHeader>{t.seforimBookmarks}</CategoryHeader>
          {bookmarks.map((b) => (
            <Row key={`${b.workId}/${b.unitId}`} label={label(b.workId, b.unitId)} onPress={() => navigation.navigate('Reader', { workId: b.workId, unitId: b.unitId })} />
          ))}
        </>
      )}
    </>
  );
}
