import React, { useMemo } from 'react';
import { BookText, ExternalLink, Library } from 'lucide-react-native';
import type { CatalogWork, LibraryCollectionId } from '@chassidushub-reader/catalog';
import { authorShelf, libraryShelf, names, scanCount, unitsAreLetters, workKind, workScans } from '@chassidushub-reader/app-core';
import { useOnlineMode } from '../../appMode/appMode';
import { useShelf, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { RebbeScreenProps } from '../../navigation/types';
import { COLLECTION_ICONS } from '../../ui/collectionIcons';
import { EmptyState } from '../../ui/EmptyState';
import { HomeTile, TileGrid } from '../../ui/HomeTiles';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';

/**
 * One Rebbe's seforim (the library's last shelf, by Rebbe; web: `/s/by/`):
 * the ones that open in the app first, then - online - the ones read on
 * other sites and his books on HebrewBooks. The external links stay with
 * him, never a shelf of their own; offline mode leaves them out, since a
 * link needs a connection.
 */
export function RebbeScreen({ navigation, route }: RebbeScreenProps) {
  const { authorId } = route.params;
  const works = useWorks();
  const shelf = useShelf();
  const onlineMode = useOnlineMode();
  const { t, language } = useTranslation();
  const author = works.authors.find((a) => a.id === authorId) ?? null;
  const seforim = useMemo(() => {
    const entry = libraryShelf(null, works, { offline: !onlineMode }).find((e) => e.kind === 'seforim');
    const section = entry?.kind === 'seforim' ? entry.sections.find((s) => (s.author?.id ?? null) === authorId) : undefined;
    // What opens here before what opens elsewhere, each in the registry's order.
    return [...(section?.works ?? [])].sort((a, b) => Number(workKind(a) === 'links') - Number(workKind(b) === 'links'));
  }, [authorId, onlineMode, works]);
  const scans = onlineMode ? scanCount(authorShelf(shelf, authorId)) : 0;

  const meta = (work: CatalogWork): string => {
    switch (workKind(work)) {
      case 'read':
        return t.seforimChapters(work.units ?? 0, unitsAreLetters(work));
      case 'collection':
        return t.seforimInLibrary;
      case 'links': {
        const count = scanCount(workScans(shelf, work.id));
        return count > 0 ? t.seforimScans(count) : t.seforimLink;
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
    <Screen header={<ScreenHeader back={{ name: 'Library', params: undefined }} title={author ? names(author.name, language) : t.seforimOtherAuthors} />}>
      {seforim.length === 0 && scans === 0 && <EmptyState text={t.libraryNotFound} />}
      <TileGrid>
        {seforim.map((work) => (
          <HomeTile key={work.id} icon={icon(work)} label={names(work.title, language)} blurb={meta(work)} onPress={() => navigation.navigate('Work', { workId: work.id })} />
        ))}
        {scans > 0 && <HomeTile icon={Library} label={authorId ? t.shelfRow : t.shelfOthersRow} blurb={t.shelfBooks(scans)} onPress={() => navigation.navigate('HebrewBooksShelf', { authorId })} />}
      </TileGrid>
    </Screen>
  );
}
