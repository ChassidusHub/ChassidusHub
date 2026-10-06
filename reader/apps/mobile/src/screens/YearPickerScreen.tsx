import React, { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react-native';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { currentHebrewYear, currentParsha, resolveThisWeek, resolveThisWeekAllYears, todayHebrewDateLabel } from '@chassidushub-reader/catalog';
import { farbrengenTexts, occasionTitle, occasionWeekday, preferredHanachaEdition } from '@chassidushub-reader/app-core';
import { IL } from '../config';
import { getLibrary, useCatalog } from '../catalog/catalogStore';
import { ContinueSection } from '../components/ContinueSection';
import { PlaylistPlayButton } from '../components/PlaylistPlayButton';
import { useDownload } from '../download/useDownload';
import { useTranslation } from '../i18n/useTranslation';
import { lsParshaSlugs } from '../library/libraryAutoDownload';
import type { HomeScreenProps } from '../navigation/types';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useHasOfflinePack } from '../offline/useHasOfflinePack';
import { useDownloadsCanRun } from '../download/useDownloadsCanRun';
import { useOnlineMode } from '../appMode/appMode';
import { useProgressMap } from '../player/useProgressMap';
import { useReadHanacha } from '../player/useReadHanacha';
import { hebrewDayMonthLabel, hebrewYearLabel, parshaLabel } from '../utils/formatHebrewDate';
import { bestKviusYear, findSpecialAnniversaries } from '../utils/weekYears';
import { CategoryRow } from '../ui/CategoryRow';
import { OfflineNote } from '../ui/OfflineNote';
import { Screen } from '../ui/Screen';
import { AppText } from '../ui/Text';
import { CategoryHeader, GapMessage, Subtitle } from '../ui/Typography';
import { ScreenHeader } from '../ui/ScreenHeader';
import { DISPLAY_FONT, useColors } from '../ui/theme';
import { alignStart, row, textAlign } from '../ui/rtl';

type Navigation = HomeScreenProps['navigation'];

/** One of the kvius year's farbrengens this week (web: `.week-card`): its name and day, Play, and its hanacha. */
function WeekCard({ entry, navigation }: { entry: CatalogEntry; navigation: Navigation }) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const progressMap = useProgressMap();
  const readHanacha = useReadHanacha();
  const { settings } = useDownload();
  const hanacha = farbrengenTexts(entry, preferredHanachaEdition(settings.contentTypes.hanachaEditions)).hanachos[0];
  const weekday = occasionWeekday(entry.hebrewDate, language);
  const openHanacha = () => {
    if (!hanacha) return;
    readHanacha(entry);
    navigation.navigate('PdfViewer', { hebrewYear: entry.hebrewYear, occasionId: entry.occasionId, driveFileId: hanacha.driveFileId, resourceKey: hanacha.resourceKey ?? null, label: hanacha.label });
  };
  return (
    <View style={[styles.card, { backgroundColor: colors.accentSoft, flexDirection: row(isRtl) }]}>
      <Pressable
        onPress={() => navigation.navigate('Farbrengen', { kind: 'browse', hebrewYear: entry.hebrewYear, occasionId: entry.occasionId })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}
      >
        <AppText style={[styles.cardTitle, { color: colors.fg, textAlign: textAlign(isRtl) }]}>{occasionTitle(entry, language)}</AppText>
        <AppText style={[styles.cardDate, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{[weekday, hebrewDayMonthLabel(entry.hebrewDate, language)].filter(Boolean).join(' · ')}</AppText>
      </Pressable>
      {(entry.audio.length > 0 || hanacha) && (
        <View style={[styles.cardActions, { flexDirection: row(isRtl) }]}>
          {entry.audio.length > 0 && <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="compact" />}
          {hanacha && (
            <Pressable
              onPress={openHanacha}
              accessibilityRole="button"
              hitSlop={4}
              style={({ pressed }) => [styles.cardAction, { backgroundColor: pressed ? colors.cardHover : colors.bgElevated, flexDirection: row(isRtl) }]}
            >
              <FileText size={16} color={colors.accent} />
              <AppText style={[styles.cardActionLabel, { color: colors.fg }]}>{t.markHanacha}</AppText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

interface StripItem {
  hebrewYear: number;
  note: string;
}

/** A strip of years across the page, scrolling sideways on its own (web: `.year-strip`); in Hebrew it starts at the right. */
function YearStrip({ items, onPress }: { items: StripItem[]; onPress: (hebrewYear: number) => void }) {
  const { language, isRtl } = useTranslation();
  const colors = useColors();
  const scroller = useRef<ScrollViewInstance>(null);
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={[styles.stripContent, { flexDirection: row(isRtl) }]}
      onContentSizeChange={() => {
        if (isRtl) scroller.current?.scrollToEnd({ animated: false });
      }}
    >
      {items.map((item) => (
        <Pressable
          key={item.hebrewYear}
          onPress={() => onPress(item.hebrewYear)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.stripYear, { backgroundColor: pressed ? colors.cardHover : colors.cardBg }]}
        >
          <AppText style={[styles.stripLabel, { color: colors.fg }]}>{hebrewYearLabel(item.hebrewYear, language)}</AppText>
          <AppText style={[styles.stripNote, { color: colors.muted }]}>{item.note}</AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** "All" under a section: a quiet link to the whole list (web: `.home-more`). */
function MoreLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { isRtl } = useTranslation();
  const colors = useColors();
  const Chevron = isRtl ? ChevronLeft : ChevronRight;
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={({ pressed }) => [styles.more, { flexDirection: row(isRtl), alignSelf: alignStart(isRtl) }, pressed && styles.pressed]}>
      <AppText style={[styles.moreLabel, { color: colors.accent }]}>{label}</AppText>
      <Chevron size={16} color={colors.accent} />
    </Pressable>
  );
}

/**
 * This week (web: HomeScreen; docs: the UI/UX redo plan, "השבוע"): the date
 * and the parsha, then the week itself on the page - the kvius year's
 * farbrengens as cards to play and read, every year's farbrengens of the
 * week as a strip of years, the parsha's Likkutei Sichos - then where the
 * listener left off, and the round anniversaries. The rest of the app is
 * one tab away. Nothing here reads the library until the parsha's sichos
 * are opened, so the phone starts as fast as before it had one.
 */
export function YearPickerScreen({ navigation }: HomeScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const catalog = useCatalog();
  const online = useOnlineStatus();
  const hasPack = useHasOfflinePack();
  const downloadsCanRun = useDownloadsCanRun();
  const onlineMode = useOnlineMode();
  // Online, the pack is asked for when nothing can download; offline pack mode never talks about the connection - its import row sits at the foot of the page.
  const askForPack = onlineMode && hasPack === false && (!online || !downloadsCanRun);
  const askText = online ? t.noWifiAskForPack : t.offlineAskForPack;
  const today = useMemo(() => new Date(), []);
  const targetYear = currentHebrewYear();
  const { parsha } = currentParsha(IL);
  const kviusYear = useMemo(() => bestKviusYear(targetYear, catalog, today), [catalog, targetYear, today]);
  const kviusWeek = useMemo(() => (kviusYear ? resolveThisWeek(kviusYear, catalog, today).map((occasion) => occasion.entry) : []), [catalog, kviusYear, today]);
  const everyYear = useMemo(() => resolveThisWeekAllYears(catalog, today), [catalog, today]);
  const anniversaries = useMemo(() => findSpecialAnniversaries(targetYear, catalog, today), [catalog, targetYear, today]);

  // The parsha's sichos: its group in Likkutei Sichos, found when it is opened (reading the library costs a moment).
  const openLsOnParsha = () => {
    const slug = lsParshaSlugs(getLibrary(), parsha)[0];
    if (slug) navigation.navigate('LibraryGroup', { collection: 'likkuteiSichos', axis: 'parsha', slug });
    else navigation.navigate('LibraryCollection', { collection: 'likkuteiSichos', axis: 'parsha' });
  };
  const openYear = (sourceYear: number) => navigation.navigate('ThisWeek', { sourceYear });

  return (
    <Screen header={<ScreenHeader title={t.appTitle} />}>
      <Subtitle style={styles.date}>{todayHebrewDateLabel()}</Subtitle>
      {parsha && <AppText style={[styles.parsha, { color: colors.fg, textAlign: textAlign(isRtl) }]}>{t.homeParsha(parshaLabel(parsha, language))}</AppText>}

      {/* The app is meant to work offline: with a pack on the phone nothing needs saying. Without one, with no connection - or no Wi-Fi for downloads set to Wi-Fi only - it asks for the pack. */}
      {askForPack && <OfflineNote pack text={askText} />}
      {askForPack && <CategoryRow label={t.offlineImportPack} onPress={() => navigation.navigate('Offline')} />}

      <CategoryHeader>{kviusYear ? t.homeKviusWeek(hebrewYearLabel(kviusYear, language)) : t.weekKviusFarbrengens}</CategoryHeader>
      {kviusWeek.length > 0 ? (
        <View style={styles.cards}>
          {kviusWeek.map((entry) => (
            <WeekCard key={entry.occasionId} entry={entry} navigation={navigation} />
          ))}
        </View>
      ) : (
        <GapMessage>{t.homeNothingThisWeek}</GapMessage>
      )}
      <MoreLink label={t.homeAllKviusYears} onPress={() => navigation.navigate('KviusYears', { targetYear })} />

      {everyYear.length > 0 && (
        <>
          <CategoryHeader>{t.homeEveryYear}</CategoryHeader>
          <YearStrip items={everyYear.map(({ hebrewYear, entries }) => ({ hebrewYear, note: String(entries.length) }))} onPress={openYear} />
          <MoreLink label={t.allFarbrengensThisWeek} onPress={() => navigation.navigate('AllYearsThisWeek')} />
        </>
      )}

      {parsha && (
        <View style={styles.section}>
          <CategoryRow label={t.homeLsOnParsha} onPress={openLsOnParsha} />
        </View>
      )}

      <ContinueSection />

      {anniversaries.length > 0 && (
        <>
          <CategoryHeader>{t.specialAnniversariesHeader}</CategoryHeader>
          <YearStrip items={anniversaries.map((item) => ({ hebrewYear: item.hebrewYear, note: t.specialAnniversaryLabel(item.anniversaryNumber) }))} onPress={openYear} />
        </>
      )}

      {!onlineMode && <CategoryRow label={t.offlineImportPack} onPress={() => navigation.navigate('Offline')} />}
      <View style={styles.bottomSpace} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.home-date`. */
  date: { marginBottom: 0 },
  /** Web: `.home-parsha` - the parsha, large. */
  parsha: { fontFamily: DISPLAY_FONT, fontSize: 30, lineHeight: 38, fontWeight: '700', marginTop: 2, marginBottom: 8 },
  /** Web: `.week-cards` / `.week-card`. */
  cards: { gap: 8 },
  card: { alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14 },
  cardMain: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  cardDate: { fontSize: 13 },
  cardActions: { alignItems: 'center', gap: 6, flexShrink: 0 },
  cardAction: { alignItems: 'center', gap: 5, minHeight: 36, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  cardActionLabel: { fontSize: 13, fontWeight: '600' },
  /** Web: `.year-strip` - runs to the screen's edges, past the page's 20px padding. */
  strip: { marginHorizontal: -20, flexGrow: 0 },
  stripContent: { gap: 8, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 6 },
  stripYear: { alignItems: 'center', minWidth: 72, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  stripLabel: { fontSize: 15, fontWeight: '700' },
  stripNote: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  /** Web: `.home-more`. */
  more: { alignItems: 'center', gap: 4, marginTop: 10 },
  moreLabel: { fontSize: 14, fontWeight: '600' },
  section: { marginTop: 16 },
  pressed: { opacity: 0.7 },
  bottomSpace: { height: 8 },
});
