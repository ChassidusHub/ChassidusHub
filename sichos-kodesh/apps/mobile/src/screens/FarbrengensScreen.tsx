import React from 'react';
import { StyleSheet, View } from 'react-native';
import { browsableYears } from '@sichos-kodesh/catalog';
import { occasionGroupName } from '@sichos-kodesh/app-core';
import { useCatalog, useLibrary } from '../catalog/catalogStore';
import { useTranslation } from '../i18n/useTranslation';
import type { FarbrengensView } from '../navigation/tabs';
import type { FarbrengensScreenProps } from '../navigation/types';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { Row, RowCount } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Segmented } from '../ui/settings/SettingsControls';

/**
 * The farbrengens tab (web: FarbrengensScreen, `/farbrengens?by=`): every
 * farbrengen by year, by mafteiach's moadim (and yemei d'pagra) or by its
 * parshiyos - one switch at the top, kept in the route's params so Back
 * returns to the same view.
 */
export function FarbrengensScreen({ navigation, route }: FarbrengensScreenProps) {
  const catalog = useCatalog();
  const library = useLibrary();
  const { t, language } = useTranslation();
  const view: FarbrengensView = route.params?.view ?? 'year';
  const options: Array<{ value: FarbrengensView; label: string }> = [
    { value: 'year', label: t.homeByYear },
    { value: 'moed', label: t.homeByMoed },
    { value: 'parsha', label: t.homeByParsha },
  ];
  const axis = view === 'moed' ? 'moadim' : 'parshiyos';
  const groups = view === 'moed' ? library.moadim : library.parshiyos;

  return (
    <Screen header={<ScreenHeader title={t.tabNames.farbrengens} />}>
      <View style={styles.switch}>
        <Segmented options={options} value={view} label={t.tabNames.farbrengens} onChange={(next) => navigation.setParams({ view: next })} />
      </View>
      {view === 'year'
        ? browsableYears(catalog).map((year, index) => (
            <Row key={year} divider={index > 0} label={hebrewYearLabel(year, language)} onPress={() => navigation.navigate('YearBrowser', { hebrewYear: year })} />
          ))
        : groups.map((group, index) => (
            <Row
              divider={index > 0}
              key={group.slug}
              label={occasionGroupName(group, language)}
              trailing={<RowCount>{group.occasionIds.length}</RowCount>}
              onPress={() => navigation.navigate('OccasionGroup', { axis, slug: group.slug })}
            />
          ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switch: { marginTop: 4, marginBottom: 16 },
});
