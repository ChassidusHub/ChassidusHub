import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { PdfEdition } from '@sichos-kodesh/catalog';
import { useEditionPreference } from '../settings/editionPreference';
import type { SettingsScreenProps } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { SectionLabel } from '../ui/SectionLabel';
import { colors } from '../ui/theme';

const OPTIONS: Array<{ value: PdfEdition | null; label: string; sublabel: string }> = [
  { value: null, label: 'No preference', sublabel: 'Show PDFs in default order' },
  { value: 'sichosKodesh', label: 'Sichos Kodesh', sublabel: 'שיחו"ק edition first' },
  { value: 'sefer', label: 'Sefer', sublabel: 'Sefer HaSichos / Sefer HaMaamarim first' },
  { value: 'torasMenachem', label: 'Toras Menachem', sublabel: 'Toras Menachem edition first' },
];

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const [preference, setPreference] = useEditionPreference();

  return (
    <Screen>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} backLabel="< Back" />
      <ScrollView>
        <SectionLabel label="PDF edition preference" />
        <Text style={styles.sectionHelp}>
          When an occasion has PDFs from more than one printed edition, show this one first.
        </Text>
        {OPTIONS.map((option, i) => (
          <React.Fragment key={option.label}>
            {i > 0 && <RowSeparator />}
            <ListRow
              label={option.label}
              sublabel={option.sublabel}
              right={preference === option.value ? <Text style={styles.check}>✓</Text> : null}
              onPress={() => setPreference(option.value)}
            />
          </React.Fragment>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHelp: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 16, marginBottom: 4 },
  check: { fontSize: 16, color: colors.accent, fontWeight: '600' },
});
