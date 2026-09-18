import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { currentHebrewYear } from '@sichos-kodesh/catalog';
import { kviusCode } from '@sichos-kodesh/kvius-engine';
import type { HomeScreenProps } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { AppButton } from '../ui/AppButton';
import { SectionLabel } from '../ui/SectionLabel';
import { colors, spacing, typography } from '../ui/theme';

export function YearPickerScreen({ navigation }: HomeScreenProps) {
  const targetYear = currentHebrewYear();

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.appName}>Sichos Kodesh</Text>
          <Pressable hitSlop={8} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.settingsIcon}>⚙</Text>
          </Pressable>
        </View>
        <Text style={styles.yearBadge}>
          {targetYear} · kvius {kviusCode(targetYear)}
        </Text>
      </View>

      <View style={styles.actionsSection}>
        <AppButton
          label="Follow Along This Week"
          variant="primary"
          style={styles.primaryAction}
          onPress={() => navigation.navigate('KviusYears', { targetYear })}
        />
        <AppButton
          label="Browse Any Year"
          variant="secondary"
          style={styles.secondaryAction}
          onPress={() => navigation.navigate('BrowseYears')}
        />
      </View>

      <View style={styles.placeholderSection}>
        <SectionLabel label="Coming soon" />
        <Pressable
          style={styles.placeholderRow}
          onPress={() => navigation.navigate('Search')}
        >
          <Text style={styles.placeholderRowText}>🔍 Search</Text>
          <Text style={styles.placeholderBadge}>Not yet implemented</Text>
        </Pressable>
        <Pressable
          style={styles.placeholderRow}
          onPress={() => navigation.navigate('Downloaded')}
        >
          <Text style={styles.placeholderRowText}>⬇ Downloaded</Text>
          <Text style={styles.placeholderBadge}>Not yet implemented</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  appName: { ...typography.titleMedium, color: colors.textDefault },
  settingsIcon: { fontSize: 20, color: colors.textSecondary },
  yearBadge: { ...typography.bodySmall, color: colors.textSecondary },
  actionsSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  primaryAction: { marginBottom: 0 },
  secondaryAction: {},
  placeholderSection: {
    marginTop: spacing.xxl,
  },
  placeholderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    opacity: 0.5,
  },
  placeholderRowText: { fontSize: 15, color: colors.textDefault },
  placeholderBadge: { fontSize: 12, color: colors.textMuted },
});
