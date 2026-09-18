import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import type { PdfEdition } from '@sichos-kodesh/catalog';
import { useEditionPreference } from '../settings/editionPreference';
import type { SettingsScreenProps } from '../navigation/types';

const OPTIONS: Array<{ value: PdfEdition | null; label: string }> = [
  { value: null, label: 'No preference' },
  { value: 'sichosKodesh', label: 'Sichos Kodesh (שיחו"ק)' },
  { value: 'sefer', label: 'Sefer (Sefer HaSichos / Sefer HaMaamarim)' },
  { value: 'torasMenachem', label: 'Toras Menachem' },
];

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const [preference, setPreference] = useEditionPreference();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'< back'}</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>When an occasion has PDFs from more than one printed edition, show this one first.</Text>
        {OPTIONS.map((option) => (
          <Pressable key={option.label} style={styles.row} onPress={() => setPreference(option.value)}>
            <Text style={preference === option.value ? styles.rowTextSelected : styles.rowText}>{option.label}</Text>
            {preference === option.value && <Text style={styles.check}>✓</Text>}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  back: { color: '#3366cc', marginBottom: 12, fontSize: 16 },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  rowText: { fontSize: 16, flexShrink: 1 },
  rowTextSelected: { fontSize: 16, flexShrink: 1, color: '#3366cc', fontWeight: '600' },
  check: { color: '#3366cc', fontWeight: '600' },
});
