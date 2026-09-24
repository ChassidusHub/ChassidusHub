import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { AArrowDown, AArrowUp, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react-native';
import { catalogUnit } from '@sichos-kodesh/catalog';
import { editionUrl } from '@sichos-kodesh/sefaria-index/reader';
import { getWorkContents, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { ReaderScreenProps } from '../../navigation/types';
import { useOnlineStatus } from '../../network/useOnlineStatus';
import { FONT_SCALE_MAX, FONT_SCALE_MIN, isBookmarked, recordPlace, setFontScale, toggleBookmark, useReadingState } from '../../seforim/readingState';
import { chooseEdition, editionLabel, linkEditions, names, neighbours, pathToUnit, readableEditions } from '../../seforim/seforimModel';
import { TextLoadError, loadUnitText, type TextFrom } from '../../seforim/seforimText';
import { TextObjectView } from '../../seforim/TextObjectView';
import { parseTextObject, type TextObject } from '../../seforim/textObject';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Spinner } from '../../ui/Spinner';
import { AppText } from '../../ui/Text';
import { TabHelp } from '../../ui/Typography';
import { useColors } from '../../ui/theme';
import { row } from '../../ui/rtl';

type Loaded = { state: 'loading' } | { state: 'ready'; text: TextObject; from: TextFrom } | { state: 'error'; problem: 'offline' | 'unavailable' };

/**
 * One chapter of a sefer, in one of its editions: from the phone when its
 * pack was imported, otherwise read live from Sefaria. The text size and
 * bookmark sit in the bar; the other editions are a tap away; the link-only
 * ones open on Sefaria; previous and next follow the sefer's order.
 */
export function ReaderScreen({ navigation, route }: ReaderScreenProps) {
  const works = useWorks();
  const reading = useReadingState();
  const online = useOnlineStatus();
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const { workId, unitId } = route.params;
  const work = works.works.find((w) => w.id === workId);
  const contents = useMemo(() => (work?.units ? getWorkContents(workId) : null), [work, workId]);
  const unit = contents ? catalogUnit(contents, unitId) : undefined;
  const remembered = reading.places[workId]?.source;
  const edition = work && unit ? chooseEdition(work, unit, route.params.source, remembered) : null;
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!work || !unit || !edition) return;
    let alive = true;
    setLoaded({ state: 'loading' });
    loadUnitText(work, unit, edition, online)
      .then(({ html, from }) => {
        if (!alive) return;
        setLoaded({ state: 'ready', text: parseTextObject(html), from });
        recordPlace(work.id, unit.id, edition.source);
      })
      .catch((error: unknown) => alive && setLoaded({ state: 'error', problem: error instanceof TextLoadError ? error.problem : 'unavailable' }));
    return () => {
      alive = false;
    };
  }, [work, unit, edition?.source, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // A failed load is tried again once when the connection comes back - not on every failure, which would loop.
  const failed = loaded.state === 'error';
  useEffect(() => {
    if (online && failed) setAttempt((n) => n + 1);
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new screen in this one's place, so the next chapter opens at its top and "back" still leads to the contents.
  const open = useCallback((nextUnitId: string) => navigation.replace('Reader', { workId, unitId: nextUnitId, source: edition?.source }), [navigation, workId, edition?.source]);

  const back = work && contents && unit ? ({ name: 'Work', params: { workId, path: pathToUnit(contents, unit.id) } } as const) : ({ name: 'Seforim', params: undefined } as const);
  if (!work || !unit || !contents) {
    return (
      <Screen header={<ScreenHeader back={back} title={work ? names(work.title, language) : t.seforimTitle} />}>
        <EmptyState text={t.readerNotFound} />
      </Screen>
    );
  }

  const readable = readableEditions(work, unit);
  const links = linkEditions(work, unit);
  const { previous, next } = neighbours(contents, unit.id);
  const marked = isBookmarked(reading, workId, unit.id);
  const heading = language === 'en' ? (unit.labelEn ?? unit.label) : unit.label;
  const languageCount = (lang: string | undefined) => readable.filter((e) => work.sources[e.source]?.language === lang).length;
  const iconColor = colors.fg;

  const bar = (
    <View style={[styles.bar, { flexDirection: row(isRtl) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t.readerTextSmaller} disabled={reading.fontScale <= FONT_SCALE_MIN} onPress={() => setFontScale(reading.fontScale - 0.1)} style={styles.iconButton}>
        <AArrowDown size={22} color={reading.fontScale <= FONT_SCALE_MIN ? colors.muted : iconColor} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t.readerTextLarger} disabled={reading.fontScale >= FONT_SCALE_MAX} onPress={() => setFontScale(reading.fontScale + 0.1)} style={styles.iconButton}>
        <AArrowUp size={22} color={reading.fontScale >= FONT_SCALE_MAX ? colors.muted : iconColor} />
      </Pressable>
      <View style={styles.spacer} />
      <Pressable accessibilityRole="button" accessibilityLabel={marked ? t.readerRemoveBookmark : t.readerBookmark} onPress={() => toggleBookmark(workId, unit.id)} style={styles.iconButton}>
        {marked ? <BookmarkCheck size={22} color={colors.accent} /> : <Bookmark size={22} color={iconColor} />}
      </Pressable>
    </View>
  );

  return (
    <Screen header={<ScreenHeader back={back} title={names(work.title, language)} />}>
      {bar}
      <AppText style={styles.heading}>{heading}</AppText>

      {(readable.length > 1 || links.length > 0) && (
        <View style={[styles.editions, { flexDirection: row(isRtl) }]}>
          {readable.map((e) => {
            const source = work.sources[e.source]!;
            const active = e.source === edition?.source;
            return (
              <Pressable
                key={e.source}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => navigation.setParams({ source: e.source })}
                style={[styles.chip, { borderColor: active ? colors.accent : colors.border }, active ? { backgroundColor: colors.accent } : null]}
              >
                <AppText style={[styles.chipText, { color: active ? colors.accentFg : colors.fg }]}>{editionLabel(source, t.editionLanguages, languageCount(source.language))}</AppText>
              </Pressable>
            );
          })}
          {links.map((e) => {
            const source = work.sources[e.source]!;
            const url = unit.ref ? editionUrl({ source: source.source as 'sefaria', sourceId: unit.ref, language: source.language, version: source.version }) : null;
            if (!url) return null;
            return (
              <Pressable key={`link-${e.source}`} accessibilityRole="link" onPress={() => Linking.openURL(url).catch(() => undefined)} style={[styles.chip, styles.linkChip, { borderColor: colors.border, flexDirection: row(isRtl) }]}>
                <AppText style={[styles.chipText, { color: colors.muted }]}>{editionLabel(source, t.editionLanguages, 1)}</AppText>
                <ExternalLink size={14} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>
      )}

      {!edition && <EmptyState text={t.workNoText} />}
      {edition && loaded.state === 'loading' && (
        <View style={styles.center}>
          <Spinner size={22} color={colors.accent} />
        </View>
      )}
      {edition && loaded.state === 'error' && (
        <View style={styles.block}>
          <TabHelp>{loaded.problem === 'offline' ? t.readerOffline : t.readerUnavailable}</TabHelp>
          <Button label={t.readerRetry} onPress={() => setAttempt((n) => n + 1)} />
        </View>
      )}
      {edition && loaded.state === 'ready' && (
        <>
          {loaded.from === 'sefaria' && <AppText style={[styles.from, { color: colors.muted }]}>{t.readerFromSefaria}</AppText>}
          <TextObjectView text={loaded.text} fontScale={reading.fontScale} />
        </>
      )}

      <View style={[styles.nav, { flexDirection: row(isRtl) }]}>
        {previous ? (
          <Pressable accessibilityRole="button" onPress={() => open(previous.id)} style={[styles.navButton, { flexDirection: row(isRtl) }]}>
            {isRtl ? <ChevronRight size={18} color={colors.accent} /> : <ChevronLeft size={18} color={colors.accent} />}
            <AppText numberOfLines={1} style={[styles.navText, { color: colors.accent }]}>
              {t.readerPrevious}
            </AppText>
          </Pressable>
        ) : (
          <View />
        )}
        {next && (
          <Pressable accessibilityRole="button" onPress={() => open(next.id)} style={[styles.navButton, { flexDirection: row(isRtl) }]}>
            <AppText numberOfLines={1} style={[styles.navText, { color: colors.accent }]}>
              {t.readerNext}
            </AppText>
            {isRtl ? <ChevronLeft size={18} color={colors.accent} /> : <ChevronRight size={18} color={colors.accent} />}
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', marginBottom: 4 },
  iconButton: { padding: 8 },
  spacer: { flex: 1 },
  heading: { fontSize: 20, fontWeight: '700', lineHeight: 28, marginBottom: 10 },
  editions: { flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  linkChip: { alignItems: 'center', gap: 6 },
  chipText: { fontSize: 14, fontWeight: '600' },
  center: { alignItems: 'center', paddingVertical: 32 },
  block: { marginTop: 8 },
  from: { fontSize: 12, marginBottom: 8 },
  nav: { justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 12 },
  navButton: { alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4 },
  navText: { fontSize: 16, fontWeight: '600' },
});
