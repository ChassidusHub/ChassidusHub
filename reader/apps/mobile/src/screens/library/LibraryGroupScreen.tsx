import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useLibrary } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import { findGroup, groupDisplayName, groupItems, itemSubtitle, itemTitle, volumeSections } from '@chassidushub-reader/app-core';
import type { LibraryGroupScreenProps } from '../../navigation/types';
import { EmptyState } from '../../ui/EmptyState';
import { Row, RowCount } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { AppText } from '../../ui/Text';
import { Subtitle, TabHelp } from '../../ui/Typography';
import { useColors } from '../../ui/theme';

/**
 * One group of a collection (a volume, a year, a masechta): its items in the
 * order mafteiach lists them. A Likkutei Sichos volume opens on its
 * parshiyos first, and a parsha on its sichos.
 */
export function LibraryGroupScreen({ navigation, route }: LibraryGroupScreenProps) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const colors = useColors();
  const { collection, axis, slug, section: sectionKey } = route.params;
  const group = findGroup(library, collection, axis, slug);
  const allItems = useMemo(() => (group ? groupItems(library, collection, group) : []), [collection, group, library]);
  const sections = useMemo(() => volumeSections(collection, axis, allItems), [allItems, axis, collection]);
  const section = sectionKey !== undefined ? sections?.find((s) => s.key === sectionKey) : undefined;
  const items = section ? section.items : allItems;
  const groupName = group ? groupDisplayName(collection, axis, group, language) : t.collectionNames[collection];
  const title = section ? section.name[language] : groupName;
  const back = section ? { name: 'LibraryGroup' as const, params: { collection, axis, slug } } : { name: 'LibraryCollection' as const, params: { collection, axis } };

  if (sections && !section) {
    return (
      <Screen header={<ScreenHeader back={back} title={title} />}>
        <Subtitle>
          {t.collectionNames[collection]} · {t.libraryItemsCount(allItems.length)}
        </Subtitle>
        {collection === 'likkuteiSichos' && slug === '40' && <TabHelp>{t.libraryDisputedNote}</TabHelp>}
        {sections.map((s, index) => (
          <Row
            key={s.key}
            label={s.name[language]}
            divider={index > 0}
            trailing={<RowCount>{s.items.length}</RowCount>}
            onPress={() => navigation.push('LibraryGroup', { collection, axis, slug, section: s.key })}
          />
        ))}
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader back={back} title={title} />}>
      <Subtitle>
        {section ? groupName : t.collectionNames[collection]} · {t.libraryItemsCount(items.length)}
      </Subtitle>
      {collection === 'likkuteiSichos' && slug === '40' && <TabHelp>{t.libraryDisputedNote}</TabHelp>}
      {items.length === 0 && <EmptyState text={t.libraryNotFound} />}
      {items.map((item, index) => {
        // The group this list is (a sicha's parsha) is already its title: not repeated under each item.
        const line = itemSubtitle(collection, item, language);
        const subtitle = line === title ? '' : line;
        return (
          <Row key={item.id} label={itemTitle(collection, item, language)} marquee divider={index > 0} onPress={() => navigation.navigate('LibraryItem', { collection, id: item.id })}>
            {subtitle ? (
              <AppText numberOfLines={2} style={[styles.subtitle, { color: colors.muted }]}>
                {subtitle}
              </AppText>
            ) : null}
          </Row>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, lineHeight: 19 },
});
