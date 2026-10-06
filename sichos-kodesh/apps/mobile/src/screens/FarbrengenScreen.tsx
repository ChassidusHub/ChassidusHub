import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight, Clock, FileText, PenLine } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { CatalogEntry, CatalogPdf } from '@sichos-kodesh/catalog';
import { occasionParsha } from '@sichos-kodesh/catalog';
import { farbrengenTexts, hebrewFullDateLabel, neighborOccasions, occasionDescription, occasionMarks, occasionTitle, occasionWeekday, preferredHanachaEdition } from '@sichos-kodesh/app-core';
import { IL } from '../config';
import { useCatalog } from '../catalog/catalogStore';
import { ChapterList } from '../components/ChapterList';
import { OccasionActions } from '../components/OccasionActions';
import { PlaylistPlayButton } from '../components/PlaylistPlayButton';
import { useDownload } from '../download/useDownload';
import { useTranslation } from '../i18n/useTranslation';
import type { FarbrengenScreenProps } from '../navigation/types';
import { useProgressMap } from '../player/useProgressMap';
import { useReadHanacha } from '../player/useReadHanacha';
import { useRecordVisit } from '../player/useRecordVisit';
import { resolveOccasionRoute } from '../routes/catalogRoutes';
import { formatDuration } from '../utils/formatDuration';
import { parshaLabel } from '../utils/formatHebrewDate';
import { CategoryRow } from '../ui/CategoryRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { AppText } from '../ui/Text';
import { CategoryHeader, Description, GapMessage } from '../ui/Typography';
import { useColors } from '../ui/theme';
import { row, textAlign } from '../ui/rtl';

/**
 * A farbrengen's one page (web: FarbrengenScreen, `/f/<year>/<occasion>`):
 * when and what it was, Play for every chapter with the chapters right
 * under it, then its texts - the hanachos first, in the preferred edition
 * with the other right below it, then the mugah, maamorim, hagahos and
 * hosafos, each row opening its PDF - then this occasion in every year and
 * the farbrengens before and after it.
 */
export function FarbrengenScreen({ navigation, route }: FarbrengenScreenProps) {
  const catalog = useCatalog();
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const readHanacha = useReadHanacha();
  const progressMap = useProgressMap();
  const { settings } = useDownload();
  const resolved = useMemo(() => resolveOccasionRoute(catalog, route.params, language), [catalog, language, route.params]);
  const entry = resolved?.entry;
  const neighbors = useMemo(() => (entry ? neighborOccasions(catalog, entry.hebrewYear, entry.occasionId) : null), [catalog, entry]);
  useRecordVisit(entry);

  if (!resolved || !entry) {
    return (
      <Screen header={<ScreenHeader back={{ name: 'Farbrengens', params: undefined }} title="" />}>
        <GapMessage>{t.occasionNotFound}</GapMessage>
      </Screen>
    );
  }

  const { backRoute } = resolved;
  const texts = farbrengenTexts(entry, preferredHanachaEdition(settings.contentTypes.hanachaEditions));
  const marks = occasionMarks(entry);
  const weekday = occasionWeekday(entry.hebrewDate, language);
  const parsha = occasionParsha(entry.hebrewDate, IL);
  const hasTexts = texts.hanachos.length > 0 || texts.groups.length > 0;
  const Prev = isRtl ? ChevronRight : ChevronLeft;
  const Next = isRtl ? ChevronLeft : ChevronRight;

  function openPdf(pdf: CatalogPdf, hanacha: boolean): void {
    // Opening a hanacha also starts its recording (useReadHanacha).
    if (hanacha) readHanacha(entry!);
    navigation.navigate('PdfViewer', { hebrewYear: entry!.hebrewYear, occasionId: entry!.occasionId, driveFileId: pdf.driveFileId, resourceKey: pdf.resourceKey ?? null, label: pdf.label });
  }

  function openOccasion(other: CatalogEntry): void {
    navigation.push('Farbrengen', { kind: 'browse', hebrewYear: other.hebrewYear, occasionId: other.occasionId });
  }

  const textRow = (pdf: CatalogPdf, hanacha: boolean, first: boolean) => (
    <Pressable
      key={pdf.driveFileId}
      onPress={() => openPdf(pdf, hanacha)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.textRow, { flexDirection: row(isRtl) }, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.cardHover }]}
    >
      <FileText size={18} color={colors.accent} />
      <AppText style={[styles.textLabel, { color: colors.fg, textAlign: textAlign(isRtl) }]}>{pdf.label}</AppText>
    </Pressable>
  );

  const mark = (Icon: LucideIcon, label: string) => (
    <View key={label} style={[styles.mark, { backgroundColor: colors.cardBg, flexDirection: row(isRtl) }]}>
      <Icon size={13} color={colors.muted} />
      <AppText style={[styles.markLabel, { color: colors.muted }]}>{label}</AppText>
    </View>
  );

  return (
    <Screen header={<ScreenHeader back={{ name: backRoute.name, params: backRoute.params } as never} title={occasionTitle(entry, language)} />}>
      {/* The whole name, where the header shortens it - a yechidus says here who it was for. */}
      {occasionDescription(entry, language) && <Description>{occasionDescription(entry, language)}</Description>}
      <AppText style={[styles.date, { color: colors.muted, textAlign: textAlign(isRtl) }]}>
        {[weekday, hebrewFullDateLabel(entry.hebrewDate, entry.hebrewYear, language), parsha ? t.homeParsha(parshaLabel(parsha, language)) : null].filter(Boolean).join(' · ')}
      </AppText>
      {(marks.durationMs > 0 || marks.hanacha || marks.mugah) && (
        <View style={[styles.marks, { flexDirection: row(isRtl) }]} accessibilityLabel={t.farbrengenHas}>
          {marks.durationMs > 0 && mark(Clock, formatDuration(marks.durationMs / 1000))}
          {marks.hanacha && mark(FileText, t.markHanacha)}
          {marks.mugah && mark(PenLine, t.markMugah)}
        </View>
      )}

      <OccasionActions entry={entry} />

      {entry.audio.length === 0 && !hasTexts && <GapMessage>{t.nothingDownloadable}</GapMessage>}

      {entry.audio.length > 0 && (
        <View style={styles.section}>
          <View style={[styles.playHeader, { backgroundColor: colors.cardBg, flexDirection: row(isRtl) }]}>
            <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="large" />
            <View style={styles.playHeaderCopy}>
              <AppText style={[styles.playTitle, { textAlign: textAlign(isRtl) }]}>{t.recordings}</AppText>
              <AppText style={[styles.playSubtitle, { color: colors.muted, textAlign: textAlign(isRtl) }]}>
                {t.recordingsCount(entry.audio.length)} · {formatDuration(marks.durationMs / 1000)}
              </AppText>
            </View>
          </View>
          <ChapterList entry={entry} progressMap={progressMap} />
        </View>
      )}

      {hasTexts && (
        <View style={styles.section}>
          <CategoryHeader first>{t.texts}</CategoryHeader>
          {texts.hanachos.length > 0 && <View style={[styles.textList, { backgroundColor: colors.cardBg }]}>{texts.hanachos.map((pdf, i) => textRow(pdf, true, i === 0))}</View>}
          {texts.groups.map((group) => (
            <View key={group.section} style={styles.textGroup}>
              <AppText style={[styles.textGroupTitle, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{t.sectionLabels[group.section]}</AppText>
              <View style={[styles.textList, { backgroundColor: colors.cardBg }]}>{group.pdfs.map((pdf, i) => textRow(pdf, false, i === 0))}</View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <CategoryRow label={t.thisOccasionAllYears} onPress={() => navigation.navigate('OccasionAllYears', { sourceHebrewYear: entry.hebrewYear, sourceOccasionId: entry.occasionId })} />
        {neighbors && (neighbors.previous || neighbors.next) && (
          <View style={[styles.neighbors, { flexDirection: row(isRtl) }]} accessibilityLabel={t.farbrengenNeighbors}>
            {neighbors.previous ? (
              <Pressable onPress={() => openOccasion(neighbors.previous!)} accessibilityRole="button" style={({ pressed }) => [styles.neighbor, { backgroundColor: pressed ? colors.cardHover : colors.cardBg, flexDirection: row(isRtl) }]}>
                <Prev size={18} color={colors.muted} />
                <View style={styles.neighborText}>
                  <AppText style={[styles.neighborLabel, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{t.previousFarbrengen}</AppText>
                  <AppText numberOfLines={2} style={[styles.neighborTitle, { textAlign: textAlign(isRtl) }]}>
                    {occasionTitle(neighbors.previous, language)}
                  </AppText>
                </View>
              </Pressable>
            ) : (
              <View style={styles.neighborSpacer} />
            )}
            {neighbors.next ? (
              <Pressable onPress={() => openOccasion(neighbors.next!)} accessibilityRole="button" style={({ pressed }) => [styles.neighbor, { backgroundColor: pressed ? colors.cardHover : colors.cardBg, flexDirection: row(!isRtl) }]}>
                <Next size={18} color={colors.muted} />
                <View style={styles.neighborText}>
                  <AppText style={[styles.neighborLabel, { color: colors.muted, textAlign: textAlign(!isRtl) }]}>{t.nextFarbrengen}</AppText>
                  <AppText numberOfLines={2} style={[styles.neighborTitle, { textAlign: textAlign(!isRtl) }]}>
                    {occasionTitle(neighbors.next, language)}
                  </AppText>
                </View>
              </Pressable>
            ) : (
              <View style={styles.neighborSpacer} />
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.farbrengen-date`. */
  date: { fontSize: 15, marginBottom: 10 },
  /** Web: `.farbrengen-marks` - pills with gap 6. */
  marks: { flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  mark: { alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  markLabel: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  /** Web: `.farbrengen-section` - margin-top 22. */
  section: { marginTop: 22 },
  /** Web: `.playlist-header` - the recordings' card with the big Play. */
  playHeader: { alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, marginBottom: 8 },
  playHeaderCopy: { flex: 1, minWidth: 0, gap: 4 },
  playTitle: { fontSize: 18, fontWeight: '700' },
  playSubtitle: { fontSize: 14, fontVariant: ['tabular-nums'] },
  /** Web: `.text-list` / `.text-row`. */
  textList: { borderRadius: 12, overflow: 'hidden' },
  textRow: { alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 48 },
  textLabel: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21 },
  textGroup: { marginTop: 14 },
  textGroupTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  /** Web: `.farbrengen-neighbors` - two cards side by side. */
  neighbors: { gap: 8 },
  neighbor: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  neighborSpacer: { flex: 1 },
  neighborText: { flex: 1, minWidth: 0, gap: 2 },
  neighborLabel: { fontSize: 12, fontWeight: '700' },
  neighborTitle: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
});
