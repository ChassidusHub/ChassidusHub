import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BookText, ExternalLink, Library, Search } from 'lucide-react-native';
import type { CatalogWork, LibraryCollectionId } from '@sichos-kodesh/catalog';
import { catalogUnit } from '@sichos-kodesh/catalog';
import { useOnlineMode } from '../../appMode/appMode';
import { getWorkContents, useShelf, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { SeforimScreenProps } from '../../navigation/types';
import { authorShelf, names, scanCount, shelfSections, unitsAreLetters, workKind, workScans } from '@sichos-kodesh/app-core';
import type { SeforimShelf } from '@sichos-kodesh/app-core';
import { recentPlaces, useReadingState } from '../../seforim/readingState';
import { CategoryRow } from '../../ui/CategoryRow';
import { COLLECTION_ICONS } from '../../ui/collectionIcons';
import { HomeTile, TileGrid } from '../../ui/HomeTiles';
import { Row } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Segmented } from '../../ui/settings/SettingsControls';
import { CategoryHeader, TabHelp } from '../../ui/Typography';
import { useColors } from '../../ui/theme';

/**
 * The seforim (catalog schema 3) on two shelves: what opens in the app -
 * the texts, and the library's PDFs - and what opens on other sites. Each
 * shelf goes by Rebbe - the Baal Shem Tov and the Maggid, the Alter Rebbe
 * to the Rebbe - his seforim as tiles, like the home screen's. Offline mode
 * shows the first shelf only: a link needs a connection. Igros Kodesh has a
 * tile of its own on the home screen, and is not here.
 */
export function SeforimScreen({ navigation, route }: SeforimScreenProps) {
  const works = useWorks();
  const shelf = useShelf();
  const reading = useReadingState();
  const onlineMode = useOnlineMode();
  const { t, language } = useTranslation();
  const colors = useColors();
  const [picked, setPicked] = useState<SeforimShelf>(route.params?.shelf ?? 'text');
  const shown: SeforimShelf = onlineMode ? picked : 'text';
  const sections = useMemo(() => shelfSections(works, shown, (authorId) => scanCount(authorShelf(shelf, authorId)) > 0), [shelf, shown, works]);
  const byId = useMemo(() => new Map(works.works.map((w) => [w.id, w])), [works]);
  const recent = recentPlaces(reading);

  const unitLabel = (workId: string, unitId: string) => {
    const unit = getWorkContents(workId) ? catalogUnit(getWorkContents(workId)!, unitId) : undefined;
    return unit ? (language === 'en' ? (unit.labelEn ?? unit.label) : unit.label) : unitId;
  };

  const meta = (work: CatalogWork): string => {
    switch (workKind(work)) {
      case 'read':
        return t.seforimChapters(work.units ?? 0, unitsAreLetters(work));
      case 'collection':
        return t.seforimInLibrary;
      case 'links': {
        const scans = scanCount(workScans(shelf, work.id));
        return scans > 0 ? t.seforimScans(scans) : t.seforimLink;
      }
      default:
        return '';
    }
  };

  const icon = (work: CatalogWork) => {
    if (workKind(work) === 'links') return ExternalLink;
    return (work.collection && COLLECTION_ICONS[work.collection as LibraryCollectionId]) || BookText;
  };

  return (
    <Screen header={<ScreenHeader back={{ name: 'Library', params: undefined }} title={t.seforimTitle} />}>
      <TabHelp>{t.seforimHelp}</TabHelp>
      <CategoryRow label={t.seforimSearchRow} trailing={<Search size={18} color={colors.muted} />} onPress={() => navigation.navigate('Search', { scope: 'seforim' })} />
      {onlineMode && (
        <View style={styles.shelves}>
          <Segmented<SeforimShelf>
            label={t.seforimShelves}
            value={picked}
            onChange={setPicked}
            options={[
              { value: 'text', label: t.seforimShelfText },
              { value: 'links', label: t.seforimShelfLinks },
            ]}
          />
        </View>
      )}

      {shown === 'text' && recent.length > 0 && (
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

      {shown === 'text' && reading.bookmarks.length > 0 && (
        <>
          <CategoryHeader>{t.seforimBookmarks}</CategoryHeader>
          {reading.bookmarks
            .filter((b) => byId.has(b.workId))
            .map((b) => (
              <Row key={`${b.workId}/${b.unitId}`} label={`${names(byId.get(b.workId)!.title, language)} · ${unitLabel(b.workId, b.unitId)}`} onPress={() => navigation.navigate('Reader', { workId: b.workId, unitId: b.unitId })} />
            ))}
        </>
      )}

      {sections.map((section) => {
        const authorId = section.author?.id ?? null;
        const scans = shown === 'links' ? scanCount(authorShelf(shelf, authorId)) : 0;
        return (
          <React.Fragment key={authorId ?? 'others'}>
            <CategoryHeader>{section.author ? names(section.author.name, language) : t.seforimOtherAuthors}</CategoryHeader>
            <TileGrid>
              {section.works.map((work) => (
                <HomeTile key={work.id} icon={icon(work)} label={names(work.title, language)} blurb={meta(work)} onPress={() => navigation.navigate('Work', { workId: work.id })} />
              ))}
              {scans > 0 && <HomeTile icon={Library} label={authorId ? t.shelfRow : t.shelfOthersRow} blurb={t.shelfBooks(scans)} onPress={() => navigation.navigate('HebrewBooksShelf', { authorId })} />}
            </TileGrid>
          </React.Fragment>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  shelves: { marginTop: 14, marginBottom: 4 },
});
