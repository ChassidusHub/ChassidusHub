import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { currentHebrewYear } from '@sichos-kodesh/catalog';
import { kviusCode } from '@sichos-kodesh/kvius-engine';
import { useTranslation } from '../i18n/useTranslation';
import type { HomeScreenProps } from '../navigation/types';
import { AppText } from '../ui/AppText';
import { Screen } from '../ui/Screen';
import { AppButton } from '../ui/AppButton';
import { ListRow } from '../ui/ListRow';
import { SectionLabel } from '../ui/SectionLabel';
import { colors, spacing, typography } from '../ui/theme';

export function YearPickerScreen({ navigation }: HomeScreenProps) {
  const targetYear = currentHebrewYear();
  const { t } = useTranslation();

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <AppText variant="titleMedium" style={styles.appName}>
            {t.appTitle}
          </AppText>
          <Pressable hitSlop={8} onPress={() => navigation.navigate('Settings')}>
            <AppText style={styles.settingsIcon}>⚙</AppText>
          </Pressable>
        </View>
        <AppText variant="bodySmall" color="secondary" style={styles.yearBadge}>
          {targetYear} · kvius {kviusCode(targetYear)}
        </AppText>
      </View>

      <View style={styles.actionsSection}>
        <AppButton
          label={t.weekKviusFarbrengens}
          variant="primary"
          style={styles.primaryAction}
          onPress={() => navigation.navigate('KviusYears', { targetYear })}
        />
        <AppButton
          label={t.browseAnyYear}
          variant="secondary"
          style={styles.secondaryAction}
          onPress={() => navigation.navigate('BrowseYears')}
        />
      </View>

      <View style={styles.placeholderSection}>
        <SectionLabel label={t.comingSoonSection} />
        <ListRow
          label={`🔍 ${t.searchLink}`}
          onPress={() => navigation.navigate('Search')}
        />
        <Pressable
          style={styles.placeholderRow}
          onPress={() => navigation.navigate('Downloaded')}
        >
          <AppText style={styles.placeholderRowText}>⬇ {t.viewDownloadedLabel}</AppText>
          <AppText variant="caption" color="muted" style={styles.placeholderBadge}>
            {t.notYetImplementedShort}
          </AppText>
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
  yearBadge: { color: colors.textSecondary },
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
