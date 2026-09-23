import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react-native';
import { currentHebrewYear, currentParsha, resolveThisWeek, resolveWeekWithFallback } from '@sichos-kodesh/catalog';
import { IL } from '../config';
import catalog from '../catalog/data';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useDownload } from '../download/useDownload';
import { useTranslation } from '../i18n/useTranslation';
import type { ThisWeekScreenProps } from '../navigation/types';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useProgressMap } from '../player/useProgressMap';
import { hebrewDayMonthLabel, hebrewYearLabel, parshaLabel } from '../utils/formatHebrewDate';
import { Button } from '../ui/Button';
import { CategoryRow } from '../ui/CategoryRow';
import { Row, RowDistance, RowTrailing } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { AppText } from '../ui/Text';
import { GapMessage, Subtitle } from '../ui/Typography';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** The Gregorian instant `weekOffset` weeks from now - shifting the calendar date by whole weeks before translating it into `sourceYear` is what steps through consecutive weeks there. */
function shiftedToday(weekOffset: number): Date {
  return new Date(Date.now() + weekOffset * MS_PER_WEEK);
}

/** One kvius-matched source year's occasions for the current (or a stepped) week (web: `/follow/:sourceYear`). */
export function ThisWeekScreen({ navigation, route }: ThisWeekScreenProps) {
  const { sourceYear } = route.params;
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const progressMap = useProgressMap();
  const { enqueueBulk } = useDownload();
  const online = useOnlineStatus();
  const [weekOffset, setWeekOffset] = useState(0);
  const shiftedDate = useMemo(() => shiftedToday(weekOffset), [weekOffset]);
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog, shiftedDate), [sourceYear, shiftedDate]);
  const suggestedYear = useMemo(
    () => (occasions.length > 0 ? null : (resolveWeekWithFallback(sourceYear, currentHebrewYear(), catalog, IL, shiftedDate)?.hebrewYear ?? null)),
    [occasions, sourceYear, shiftedDate],
  );
  // Kvius-matched years share the same Sedra schedule by construction, so this is `sourceYear`'s parsha for this week too.
  const weekParsha = useMemo(() => currentParsha(IL, shiftedDate).parsha, [shiftedDate]);
  // Chevron glyphs swap for Hebrew, same as BackLink: "previous" points toward the reading-start side.
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <Screen header={<ScreenHeader back={{ name: 'KviusYears', params: { targetYear: currentHebrewYear() } }} title={t.thisWeek} />}>
      <Subtitle>{t.fromHebrewYear(sourceYear)}</Subtitle>

      <View style={[styles.weekNav, { flexDirection: row(isRtl) }]}>
        <Pressable onPress={() => setWeekOffset((n) => n - 1)} accessibilityRole="button" accessibilityLabel={t.previousWeek} style={({ pressed }) => [styles.weekNavButton, { backgroundColor: pressed ? colors.cardHover : colors.cardBg }]}>
          <PrevIcon size={18} strokeWidth={2.5} color={colors.fg} />
        </Pressable>
        <View style={styles.weekNavCenter}>
          {weekParsha && (
            <AppText numberOfLines={1} style={styles.weekNavParsha}>
              {parshaLabel(weekParsha, language)}
            </AppText>
          )}
          {weekOffset !== 0 && (
            <Pressable onPress={() => setWeekOffset(0)} hitSlop={6} accessibilityRole="button">
              <AppText style={[styles.weekNavReset, { color: colors.accent }]}>{t.backToThisWeek}</AppText>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setWeekOffset((n) => n + 1)} accessibilityRole="button" accessibilityLabel={t.nextWeek} style={({ pressed }) => [styles.weekNavButton, { backgroundColor: pressed ? colors.cardHover : colors.cardBg }]}>
          <NextIcon size={18} strokeWidth={2.5} color={colors.fg} />
        </Pressable>
      </View>

      {occasions.length === 0 && (
        <>
          <GapMessage>{t.nothingThisWeek(sourceYear)}</GapMessage>
          {suggestedYear != null && <Button label={t.tryYearInstead(hebrewYearLabel(suggestedYear, language))} onPress={() => navigation.push('ThisWeek', { sourceYear: suggestedYear })} />}
        </>
      )}

      {occasions.map((occasion) => (
        <Row
          key={occasion.entry.occasionId}
          label={occasion.entry.occasionLabel}
          trailing={
            <RowTrailing>
              <OccasionRowIcon entry={occasion.entry} progressMap={progressMap} dateSlot={<RowDistance standalone={false}>{hebrewDayMonthLabel(occasion.hebrewDate, language)}</RowDistance>} />
            </RowTrailing>
          }
          onPress={() => navigation.navigate('Farbrengen', { kind: 'follow', sourceYear, occasionId: occasion.entry.occasionId })}
        />
      ))}

      {occasions.length > 0 && online && (
        <Button
          label={t.downloadThisWeekLabel}
          icon={<Download size={16} color={colors.accentFg} />}
          onPress={() => {
            enqueueBulk(
              occasions.map((occasion) => occasion.entry),
              'manual',
            ).catch(() => undefined);
          }}
        />
      )}

      <CategoryRow label={t.allOfYear(sourceYear)} onPress={() => navigation.navigate('FollowMonthList', { sourceYear })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.week-nav` - space-between, gap 12, margin 4px 0 16px. */
  weekNav: { alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4, marginBottom: 16 },
  /** Web: `.week-nav-button` - 36px card-colored circle. */
  weekNavButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  weekNavCenter: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  weekNavParsha: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  weekNavReset: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
