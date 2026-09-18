import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { browsableYears } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import type { BrowseYearsScreenProps } from '../navigation/types';
import { colors, spacing, typography } from '../ui/theme';
import { Screen } from '../ui/Screen';

function Separator() {
  return <View style={styles.separator} />;
}

export function BrowseYearsScreen({ navigation }: BrowseYearsScreenProps) {
  const allYears = browsableYears(catalog);

  return (
    <Screen>
      <View style={styles.content}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'< back'}</Text>
        </Pressable>
        <Text style={styles.title}>Browse Any Year</Text>
        <Text style={styles.help}>Every year with something indexed — explore freely, no kvius match required.</Text>
      </View>
      <FlatList
        data={allYears}
        keyExtractor={(item) => String(item)}
        renderItem={({ item }: { item: number }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('YearBrowser', { hebrewYear: item })}>
            <Text style={styles.rowText}>{item}</Text>
          </Pressable>
        )}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg },
  list: { paddingHorizontal: spacing.lg },
  back: { color: colors.textLink, marginBottom: spacing.md },
  title: { ...typography.titleMedium, marginBottom: spacing.sm },
  help: { ...typography.label, color: colors.textMuted, marginBottom: spacing.md },
  row: { paddingVertical: 14 },
  rowText: { fontSize: 18 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.lg },
});
