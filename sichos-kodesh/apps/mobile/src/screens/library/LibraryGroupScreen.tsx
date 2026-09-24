import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useLibrary } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import { findGroup, groupDisplayName, groupItems, itemSubtitle, itemTitle } from '@sichos-kodesh/app-core';
import type { LibraryGroupScreenProps } from '../../navigation/types';
import { EmptyState } from '../../ui/EmptyState';
import { Row } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { AppText } from '../../ui/Text';
import { Subtitle, TabHelp } from '../../ui/Typography';
import { useColors } from '../../ui/theme';

/** One group of a collection (a volume, a year, a masechta): its items in the order mafteiach lists them. */
export function LibraryGroupScreen({ navigation, route }: LibraryGroupScreenProps) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const colors = useColors();
  const { collection, axis, slug } = route.params;
  const group = findGroup(library, collection, axis, slug);
  const items = useMemo(() => (group ? groupItems(library, collection, group) : []), [collection, group, library]);
  const title = group ? groupDisplayName(collection, axis, group, language) : t.collectionNames[collection];

  return (
    <Screen header={<ScreenHeader back={{ name: 'LibraryCollection', params: { collection, axis } }} title={title} />}>
      <Subtitle>
        {t.collectionNames[collection]} · {t.libraryItemsCount(items.length)}
      </Subtitle>
      {collection === 'likkuteiSichos' && slug === '40' && <TabHelp>{t.libraryDisputedNote}</TabHelp>}
      {items.length === 0 && <EmptyState text={t.libraryNotFound} />}
      {items.map((item) => {
        // The group this list is (a sicha's parsha) is already its title: not repeated under each item.
        const line = itemSubtitle(collection, item, language);
        const subtitle = line === title ? '' : line;
        return (
          <Row key={item.id} label={itemTitle(collection, item, language)} marquee onPress={() => navigation.navigate('LibraryItem', { collection, id: item.id })}>
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
