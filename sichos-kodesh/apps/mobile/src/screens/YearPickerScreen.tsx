import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BookOpen, BookText, CalendarRange, Feather, GraduationCap, Headphones, Library, Mail, NotebookPen, ScrollText, Search, Settings, Sparkles } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { LibraryCollectionId } from '@sichos-kodesh/catalog';
import { currentHebrewYear, currentParsha, todayHebrewDateLabel } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { IL } from '../config';
import { getLibrary } from '../catalog/catalogStore';
import { ContinueSection } from '../components/ContinueSection';
import { useTranslation } from '../i18n/useTranslation';
import { lsParshaSlugs } from '../library/libraryAutoDownload';
import type { HomeScreenProps } from '../navigation/types';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useHasOfflinePack } from '../offline/useHasOfflinePack';
import { useDownloadsCanRun } from '../download/useDownloadsCanRun';
import { useOnlineMode } from '../appMode/appMode';
import { parshaLabel } from '../utils/formatHebrewDate';
import { Button } from '../ui/Button';
import { CategoryRow } from '../ui/CategoryRow';
import { hexWithAlpha } from '../ui/color';
import { HomeChip, HomeLink, HomeTile, TileGrid } from '../ui/HomeTiles';
import { OfflineNote } from '../ui/OfflineNote';
import { Screen } from '../ui/Screen';
import { AppText } from '../ui/Text';
import { CategoryHeader, H1, Subtitle } from '../ui/Typography';
import { useColors } from '../ui/theme';
import { row, textAlign } from '../ui/rtl';

/** The library's collections on the home screen, in the order the Rebbe's own Torah comes first, then what was written and recorded around it. */
const COLLECTION_TILES: ReadonlyArray<{ collection: LibraryCollectionId; icon: LucideIcon }> = [
  { collection: 'likkuteiSichos', icon: BookOpen },
  { collection: 'maamorim', icon: ScrollText },
  { collection: 'michtavimKlolim', icon: Mail },
  { collection: 'reshimos', icon: NotebookPen },
  { collection: 'hadranim', icon: GraduationCap },
  { collection: 'yomanim', icon: Feather },
  { collection: 'jemEvents', icon: Headphones },
];

/**
 * The home page (web: `/`). What is on this week comes first - the kvius
 * farbrengens, every year's farbrengens of this week, the parsha's Likkutei
 * Sichos - then where the listener left off, then every way into the rest:
 * the farbrengens by year, moed and parsha, and a door into each part of
 * the library. Nothing here reads the library until a door is opened, so
 * the phone starts as fast as before it had one.
 */
export function YearPickerScreen({ navigation }: HomeScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const online = useOnlineStatus();
  const hasPack = useHasOfflinePack();
  const downloadsCanRun = useDownloadsCanRun();
  const onlineMode = useOnlineMode();
  // Online, the pack is asked for when nothing can download; offline pack mode never talks about the connection - its import row sits at the foot of the page.
  const askForPack = onlineMode && hasPack === false && (!online || !downloadsCanRun);
  const askText = online ? t.noWifiAskForPack : t.offlineAskForPack;
  const targetYear = currentHebrewYear();
  const bestMatch = findMatchingYears(targetYear)[0];
  const { parsha } = currentParsha(IL);
  const hebrewDate = todayHebrewDateLabel();
  const parshaName = parsha ? parshaLabel(parsha, language) : null;

  // The parsha's sichos: its group in Likkutei Sichos, found when the door is opened (reading the library costs a moment).
  const openLsOnParsha = () => {
    const slug = lsParshaSlugs(getLibrary(), parsha)[0];
    if (slug) navigation.navigate('LibraryGroup', { collection: 'likkuteiSichos', axis: 'parsha', slug });
    else navigation.navigate('LibraryCollection', { collection: 'likkuteiSichos', axis: 'parsha' });
  };

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
      <Subtitle style={styles.date}>{hebrewDate}</Subtitle>

      {/* The app is meant to work offline: with a pack on the phone nothing needs saying. Without one, with no connection - or no Wi-Fi for downloads set to Wi-Fi only - it asks for the pack. */}
      {askForPack && <OfflineNote pack text={askText} />}
      {askForPack && <CategoryRow label={t.offlineImportPack} onPress={() => navigation.navigate('Offline')} />}

      {/* This week: the kvius farbrengens first, then every year's, then the parsha's sichos. */}
      <View style={[styles.week, { backgroundColor: hexWithAlpha(colors.accent, 0.08), borderColor: hexWithAlpha(colors.accent, 0.22) }]}>
        <AppText style={[styles.weekEyebrow, { color: colors.accent, textAlign: textAlign(isRtl) }]}>{t.homeThisWeek}</AppText>
        {parshaName && <AppText style={[styles.weekTitle, { color: colors.fg, textAlign: textAlign(isRtl) }]}>{t.homeParsha(parshaName)}</AppText>}
        {bestMatch && <Button hero label={t.weekKviusFarbrengens} onPress={() => navigation.navigate('KviusYears', { targetYear })} style={styles.weekButton} />}
        <HomeLink label={t.allFarbrengensThisWeek} onPress={() => navigation.navigate('AllYearsThisWeek')} last={!parsha} />
        {parsha && <HomeLink label={t.homeLsOnParsha} onPress={openLsOnParsha} last />}
      </View>

      <ContinueSection />

      <CategoryHeader>{t.homeFarbrengensSection}</CategoryHeader>
      <View style={[styles.chips, { flexDirection: row(isRtl) }]}>
        <HomeChip icon={CalendarRange} label={t.homeByYear} onPress={() => navigation.navigate('BrowseYears')} />
        <HomeChip icon={Sparkles} label={t.homeByMoed} onPress={() => navigation.navigate('OccasionGroups', { axis: 'moadim' })} />
        <HomeChip icon={BookText} label={t.homeByParsha} onPress={() => navigation.navigate('OccasionGroups', { axis: 'parshiyos' })} />
      </View>

      <CategoryHeader>{t.homeLibrarySection}</CategoryHeader>
      <TileGrid>
        {COLLECTION_TILES.map(({ collection, icon }) => (
          <HomeTile key={collection} icon={icon} label={t.collectionNames[collection]} blurb={t.homeBlurbs[collection]} onPress={() => navigation.navigate('LibraryCollection', { collection })} />
        ))}
        <HomeTile icon={Library} label={t.homeSeforim} blurb={t.homeBlurbs.seforim} onPress={() => navigation.navigate('Seforim')} />
      </TileGrid>
      <CategoryRow label={t.homeAllLibrary} onPress={() => navigation.navigate('Library')} />
      {onlineMode && <CategoryRow label={t.viewDownloadedLabel} onPress={() => navigation.navigate('Downloaded')} />}
      {!onlineMode && <CategoryRow label={t.offlineImportPack} onPress={() => navigation.navigate('Offline')} />}
      <View style={styles.bottomSpace} />
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
  date: { marginBottom: 16 },
  /** Web: `.home-week` - the week's card, tinted with the accent. */
  week: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, marginBottom: 8 },
  weekEyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.72 },
  weekTitle: { fontSize: 22, lineHeight: 29, fontWeight: '700', marginTop: 2 },
  weekButton: { marginTop: 12, marginBottom: 6 },
  chips: { gap: 8, marginBottom: 4 },
  bottomSpace: { height: 8 },
});
