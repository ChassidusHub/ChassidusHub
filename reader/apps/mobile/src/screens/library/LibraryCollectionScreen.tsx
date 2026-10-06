import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLibrary } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import { AXIS_VARIANTS, COLLECTION_AXES, axisGroups, axisTab, groupDisplayName, isCollectionAxis } from '@chassidushub-reader/app-core';
import type { LibraryCollectionScreenProps } from '../../navigation/types';
import { GroupGrid, GroupTile } from '../../ui/GroupGrid';
import { Row, RowCount } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { TabHelp } from '../../ui/Typography';
import { Segmented } from '../../ui/settings/SettingsControls';

/**
 * One collection of the library: its browse axes as tabs, and the groups of
 * the chosen one (volumes, years, months, parshiyos...). A tab with variants
 * (Melukat: its six volumes, or its edition by the months in four parts)
 * adds a second, smaller toggle under the tabs.
 */
/** A group whose name is at most this long goes in a tile (web: the same). */
const COMPACT_NAME = 10;

export function LibraryCollectionScreen({ navigation, route }: LibraryCollectionScreenProps) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const { collection } = route.params;
  const axes = COLLECTION_AXES[collection];
  const axis = isCollectionAxis(collection, route.params.axis) ? route.params.axis : axes[0]!;
  const tab = axisTab(axis);
  const variants = (AXIS_VARIANTS[tab] ?? []).filter((variant) => axisGroups(library, collection, variant).length > 0);
  const groups = axisGroups(library, collection, axis);
  const compact = groups.length > 0 && groups.every((group) => groupDisplayName(collection, axis, group, language).length <= COMPACT_NAME);

  return (
    <Screen header={<ScreenHeader back={{ name: 'Library', params: undefined }} title={t.collectionNames[collection]} />}>
      <TabHelp>{t.collectionHelp[collection]}</TabHelp>
      {axes.length > 1 && (
        <View style={styles.tabs}>
          <Segmented
            options={axes.map((value) => ({ value, label: t.axisNames[value] ?? value }))}
            value={tab}
            onChange={(next) => navigation.setParams({ axis: next })}
            label={t.collectionNames[collection]}
          />
        </View>
      )}
      {variants.length > 1 && (
        <View style={styles.tabs}>
          <Segmented
            options={variants.map((value) => ({ value, label: t.axisVariantNames[value] ?? value }))}
            value={axis}
            onChange={(next) => navigation.setParams({ axis: next })}
            label={t.axisNames[tab] ?? tab}
          />
        </View>
      )}
      {/* Short names (years, months, parshiyos) as a grid of tiles; long ones (moadim, the Melukat's parts) as a list. */}
      {compact ? (
        <GroupGrid>
          {groups.map((group) => (
            <GroupTile
              key={`${axis}:${group.slug}`}
              label={groupDisplayName(collection, axis, group, language)}
              count={group.itemIds.length}
              onPress={() => navigation.navigate('LibraryGroup', { collection, axis, slug: group.slug })}
            />
          ))}
        </GroupGrid>
      ) : (
        groups.map((group, index) => (
          <Row
            key={`${axis}:${group.slug}`}
            label={groupDisplayName(collection, axis, group, language)}
            trailing={<RowCount>{group.itemIds.length}</RowCount>}
            divider={index > 0}
            onPress={() => navigation.navigate('LibraryGroup', { collection, axis, slug: group.slug })}
          />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { marginBottom: 12 },
});
