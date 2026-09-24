import React from 'react';
import { useLibrary } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import { LIBRARY_ORDER } from '../../library/libraryModel';
import type { LibraryScreenProps } from '../../navigation/types';
import { CategoryRow } from '../../ui/CategoryRow';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { CategoryHeader, TabHelp } from '../../ui/Typography';

/**
 * The library (docs/offline-plan.md WP4b): the farbrengens on two more
 * axes, mafteiach's moadim and parshiyos, then one browser per collection
 * of catalog schema 2. Phone only.
 */
export function LibraryScreen({ navigation }: LibraryScreenProps) {
  const library = useLibrary();
  const { t } = useTranslation();

  return (
    <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title={t.libraryTitle} />}>
      <TabHelp>{t.libraryHelp}</TabHelp>

      <CategoryHeader first>{t.libraryFarbrengensSection}</CategoryHeader>
      <CategoryRow label={t.libraryByMoed} count={library.moadim.length} onPress={() => navigation.navigate('OccasionGroups', { axis: 'moadim' })} />
      <CategoryRow label={t.libraryByParsha} count={library.parshiyos.length} onPress={() => navigation.navigate('OccasionGroups', { axis: 'parshiyos' })} />

      <CategoryHeader>{t.libraryCollectionsSection}</CategoryHeader>
      {LIBRARY_ORDER.map((collection) => {
        const count = library.collections[collection].items.length;
        if (count === 0) return null;
        return <CategoryRow key={collection} label={t.collectionNames[collection]} count={count} onPress={() => navigation.navigate('LibraryCollection', { collection })} />;
      })}
    </Screen>
  );
}
