import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLibrary } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import { COLLECTION_AXES, axisGroups, groupDisplayName } from '../../library/libraryModel';
import type { LibraryCollectionScreenProps } from '../../navigation/types';
import { Row, RowDistance } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { TabHelp } from '../../ui/Typography';
import { Segmented } from '../../ui/settings/SettingsControls';

/** One collection of the library: its browse axes as tabs, and the groups of the chosen one (volumes, years, parshiyos...). */
export function LibraryCollectionScreen({ navigation, route }: LibraryCollectionScreenProps) {
  const library = useLibrary();
  const { t, language } = useTranslation();
  const { collection } = route.params;
  const axes = COLLECTION_AXES[collection];
  const axis = route.params.axis && axes.includes(route.params.axis) ? route.params.axis : axes[0]!;
  const groups = axisGroups(library, collection, axis);

  return (
    <Screen header={<ScreenHeader back={{ name: 'Library', params: undefined }} title={t.collectionNames[collection]} />}>
      <TabHelp>{t.collectionHelp[collection]}</TabHelp>
      {axes.length > 1 && (
        <View style={styles.tabs}>
          <Segmented
            options={axes.map((value) => ({ value, label: t.axisNames[value] ?? value }))}
            value={axis}
            onChange={(next) => navigation.setParams({ axis: next })}
            label={t.collectionNames[collection]}
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
