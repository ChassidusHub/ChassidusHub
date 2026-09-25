import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLibrary } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import { AXIS_VARIANTS, COLLECTION_AXES, axisGroups, axisTab, groupDisplayName, isCollectionAxis } from '@sichos-kodesh/app-core';
import type { LibraryCollectionScreenProps } from '../../navigation/types';
import { Row, RowDistance } from '../../ui/Row';
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
export function LibraryCollectionScreen({ navigation, route }: LibraryCollectionScreenProps) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const { collection } = route.params;
  const axes = COLLECTION_AXES[collection];
  const axis = isCollectionAxis(collection, route.params.axis) ? route.params.axis : axes[0]!;
  const tab = axisTab(axis);
  const variants = (AXIS_VARIANTS[tab] ?? []).filter((variant) => axisGroups(library, collection, variant).length > 0);
  const groups = axisGroups(library, collection, axis);

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
      {groups.map((group) => (
        <Row
          key={`${axis}:${group.slug}`}
          label={groupDisplayName(collection, axis, group, language)}
          trailing={<RowDistance>{group.itemIds.length}</RowDistance>}
          onPress={() => navigation.navigate('LibraryGroup', { collection, axis, slug: group.slug })}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { marginBottom: 12 },
});
