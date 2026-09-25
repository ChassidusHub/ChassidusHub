import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Search, Settings } from 'lucide-react-native';
import { currentHebrewYear, currentParsha, todayHebrewDateLabel } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { IL } from '../config';
import { ContinueSection } from '../components/ContinueSection';
import { useTranslation } from '../i18n/useTranslation';
import type { HomeScreenProps } from '../navigation/types';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useHasOfflinePack } from '../offline/useHasOfflinePack';
import { useDownloadsCanRun } from '../download/useDownloadsCanRun';
import { useOnlineMode } from '../appMode/appMode';
import { parshaLabel } from '../utils/formatHebrewDate';
import { Button } from '../ui/Button';
import { CategoryRow } from '../ui/CategoryRow';
import { OfflineNote } from '../ui/OfflineNote';
import { Screen } from '../ui/Screen';
import { H1, Subtitle } from '../ui/Typography';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';

/** The home page (web: `/`). */
export function YearPickerScreen({ navigation }: HomeScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const online = useOnlineStatus();
  const hasPack = useHasOfflinePack();
  const downloadsCanRun = useDownloadsCanRun();
  const onlineMode = useOnlineMode();
  // Offline pack mode asks for the pack until one is on the phone; online mode only when it can't download.
  const askForPack = hasPack === false && (!onlineMode || !online || !downloadsCanRun);
  const askText = !onlineMode ? t.offlineModeAskForPack : online ? t.noWifiAskForPack : t.offlineAskForPack;
  const targetYear = currentHebrewYear();
  const bestMatch = findMatchingYears(targetYear)[0];
  const { parsha } = currentParsha(IL);
  const hebrewDate = todayHebrewDateLabel();

  return (
    <Screen>
      <View style={[styles.headerRow, { flexDirection: row(isRtl) }]}>
        <H1>{t.appTitle}</H1>
        <View style={[styles.actions, { flexDirection: row(isRtl) }]}>
          <Pressable onPress={() => navigation.navigate('Search')} hitSlop={6} accessibilityRole="button" accessibilityLabel={t.searchLink} style={styles.iconLink}>
            <Search size={22} strokeWidth={2} color={colors.muted} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={6} accessibilityRole="button" accessibilityLabel={t.settingsLabel} style={styles.iconLink}>
            <Settings size={22} strokeWidth={2} color={colors.muted} />
          </Pressable>
        </View>
      </View>
      <Subtitle>
        {hebrewDate}
        {parsha ? ` · ${parshaLabel(parsha, language)}` : ''}
      </Subtitle>

      {/* The app is meant to work offline: with a pack on the phone nothing needs saying. Without one, with no connection - or no Wi-Fi for downloads set to Wi-Fi only - it asks for the pack. */}
      {askForPack && <OfflineNote pack text={askText} />}
      {askForPack && <CategoryRow label={t.offlineImportPack} onPress={() => navigation.navigate('Offline')} />}

      {bestMatch && <Button hero label={t.weekKviusFarbrengens} onPress={() => navigation.navigate('KviusYears', { targetYear })} />}

      <CategoryRow label={t.allFarbrengensThisWeek} onPress={() => navigation.navigate('AllYearsThisWeek')} />

      <CategoryRow label={t.browseAnyYear} onPress={() => navigation.navigate('BrowseYears')} />

      {/* Phone only: the library of catalog schema 2 (docs/offline-plan.md WP4b). */}
      <CategoryRow label={t.libraryLink} onPress={() => navigation.navigate('Library')} />

      <ContinueSection />
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.header-row` - flex, space-between, centered. */
  headerRow: { alignItems: 'center', justifyContent: 'space-between' },
  /** Web: `.header-row-actions` - gap 4. */
  actions: { alignItems: 'center', gap: 4 },
  /** Web: `.settings-link` - padding 4. */
  iconLink: { padding: 4 },
});
