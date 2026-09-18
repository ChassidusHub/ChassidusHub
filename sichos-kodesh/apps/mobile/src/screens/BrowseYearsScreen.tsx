import React from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import { browsableYears } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import type { BrowseYearsScreenProps } from '../navigation/types';
import { colors } from '../ui/theme';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { SectionLabel } from '../ui/SectionLabel';
import { EmptyState } from '../ui/EmptyState';

export function BrowseYearsScreen({ navigation }: BrowseYearsScreenProps) {
  const allYears = browsableYears(catalog);

  return (
    <Screen>
      <ScreenHeader title="Browse Any Year" onBack={() => navigation.goBack()} backLabel="< Back" />
      <SectionLabel label="All indexed years" />
      <FlatList
        data={allYears}
        keyExtractor={(item) => String(item)}
        renderItem={({ item }: { item: number }) => (
          <ListRow
            label={String(item)}
            right={<Text style={styles.chevron}>›</Text>}
            onPress={() => navigation.navigate('YearBrowser', { hebrewYear: item })}
          />
        )}
        ItemSeparatorComponent={RowSeparator}
        ListEmptyComponent={<EmptyState title="No years indexed" />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chevron: { fontSize: 18, color: colors.textMuted },
});
