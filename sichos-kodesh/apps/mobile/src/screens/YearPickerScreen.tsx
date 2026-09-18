import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { kviusCode } from '@sichos-kodesh/kvius-engine';
import type { HomeScreenProps } from '../navigation/types';

export function YearPickerScreen({ navigation, route }: HomeScreenProps) {
  const { targetYear } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Sichos Kodesh</Text>
        <Pressable onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.settingsLink}>⚙</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>
        Hebrew year {targetYear} (kvius {kviusCode(targetYear)})
      </Text>

      <View style={styles.tabs}>
        <Pressable
          style={styles.tab}
          onPress={() => navigation.navigate('KviusYears', { targetYear })}
        >
          <Text style={styles.tabText}>Follow along</Text>
          <View style={styles.tabUnderline} />
        </Pressable>
        <Pressable
          style={styles.tab}
          onPress={() => navigation.navigate('BrowseYears', { targetYear })}
        >
          <Text style={styles.tabText}>Browse any year</Text>
          <View style={styles.tabUnderlineHidden} />
        </Pressable>
      </View>

      <Text style={styles.tabHelp}>
        Select a tab to find kvius-matched years or browse all indexed years.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingsLink: { fontSize: 20, color: '#888' },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc', marginBottom: 4 },
  tab: { marginRight: 20, paddingBottom: 10 },
  tabText: { fontSize: 15, fontWeight: '600', color: '#3366cc' },
  tabUnderline: { height: 2, backgroundColor: '#3366cc', marginTop: 8 },
  tabUnderlineHidden: { height: 2, marginTop: 8 },
  tabHelp: { fontSize: 12, color: '#888', marginVertical: 12 },
});
