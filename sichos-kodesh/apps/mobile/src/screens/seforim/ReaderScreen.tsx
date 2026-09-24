import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALargeSmall, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react-native';
import { catalogUnit, type CatalogEdition, type CatalogNames, type CatalogUnit, type CatalogWork } from '@sichos-kodesh/catalog';
import {
  MARGIN_POINTS,
  chooseEdition,
  citation,
  editionLabel,
  linkEditions,
  names,
  neighbours,
  parseTextObject,
  pathToUnit,
  readableEditions,
  readerFont,
  readerFontFor,
  readerTextSize,
  unitPart,
  unitPosition,
  unitsAreLetters,
  type ReaderPalette,
  type ReaderSettings,
  type TextObject,
} from '@sichos-kodesh/app-core';
import { editionUrl } from '@sichos-kodesh/sefaria-index/reader';
import { getWorkContents, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { ReaderScreenProps } from '../../navigation/types';
import { useOnlineStatus } from '../../network/useOnlineStatus';
import { readerPalette, readerScheme } from '../../seforim/readerPalette';
import { isBookmarked, recordPlace, toggleBookmark, useReadingState } from '../../seforim/readingState';
import { TextLoadError, loadUnitText, type TextFrom, type TextProblem } from '../../seforim/seforimText';
import { TextObjectView } from '../../seforim/TextObjectView';
import { BackLink } from '../../ui/BackLink';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Spinner } from '../../ui/Spinner';
import { AppText } from '../../ui/Text';
import { TabHelp } from '../../ui/Typography';
import { setKeepScreenOn } from '../../ui/systemBars';
import { useTheme } from '../../ui/theme';
import { row } from '../../ui/rtl';
import { ReaderSettingsSheet } from './ReaderSettingsSheet';

type Loaded = { state: 'loading' } | { state: 'ready'; text: TextObject; from: TextFrom } | { state: 'error'; problem: TextProblem };

/** One chapter on the page: the first is the one opened, the rest were read on into. */
interface Section {
  unit: CatalogUnit;
  edition: CatalogEdition;
  loaded: Loaded;
}

/** The reader's bar under the status bar; it slides away while reading down and comes back on the way up. */
const BAR_HEIGHT = 56;

function textLanguage(work: CatalogWork, edition: CatalogEdition): 'he' | 'en' {
  return work.sources[edition.source]?.language === 'en' ? 'en' : 'he';
}

function sefariaLink(work: CatalogWork, unit: CatalogUnit, edition: CatalogEdition): string | null {
  const source = work.sources[edition.source];
  if (!source || source.source !== 'sefaria' || !unit.ref) return null;
  return editionUrl({ source: 'sefaria', sourceId: unit.ref, language: source.language, version: source.version });
}

/**
 * A sefer, read the way the reader's settings set it (ReaderSettingsSheet):
 * its font, size, spacing and paper, with the bar sliding out of the way
 * while reading. A chapter comes from the phone when a pack or a saved copy
 * holds it, otherwise live from Sefaria. At a chapter's end the next one
 * follows on the same page (or previous and next buttons, when that is
 * off); the place is kept to the paragraph, so a sefer reopens where it
 * was left. A long press on a paragraph shares it with its source.
 */
export function ReaderScreen({ navigation, route }: ReaderScreenProps) {
  const works = useWorks();
  const reading = useReadingState();
  const online = useOnlineStatus();
  const { t, language, isRtl } = useTranslation();
  const { colors, baseScheme, setSchemeOverride } = useTheme();
  const insets = useSafeAreaInsets();
  const { workId, unitId } = route.params;
  const work = works.works.find((w) => w.id === workId);
  // The settings as this sefer is read: the Igros open in their own font until one is chosen.
  const settings = useMemo(() => ({ ...reading.settings, font: readerFontFor(reading.settings, work) }), [reading.settings, work]);
  const palette = readerPalette(settings.theme, colors);
  const contents = useMemo(() => (work?.units ? getWorkContents(workId) : null), [work, workId]);
  const unit = contents ? catalogUnit(contents, unitId) : undefined;
  const place = reading.places[workId];
  const edition = work && unit ? chooseEdition(work, unit, route.params.source, place?.source) : null;

  const [sections, setSections] = useState<Section[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [sheet, setSheet] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const layouts = useRef(new Map<string, { y: number; height: number }>());
  const generation = useRef(0);
  const appending = useRef(false);
  const restoreTo = useRef<number | null>(null);
  const lastY = useRef(0);
  const viewport = useRef(0);
  const onlineNow = useRef(online);
  onlineNow.current = online;
  const here = useRef<{ unitId: string; source: number; offset: number } | null>(null);
  const bar = useRef(new Animated.Value(0)).current;
  const barShown = useRef(true);

  // The chapter opened: loaded afresh when it or its edition changes; anything read on into is dropped.
  useEffect(() => {
    if (!work || !unit || !edition) return;
    const gen = ++generation.current;
    appending.current = false;
    layouts.current.clear();
    setCurrent(0);
    setProgress(0);
    const remembered = place && place.unitId === unit.id && place.source === edition.source ? (place.offset ?? 0) : 0;
    restoreTo.current = remembered > 0 ? remembered : null;
    setSections([{ unit, edition, loaded: { state: 'loading' } }]);
    loadUnitText(work, unit, edition, online)
      .then(({ html, from }) => {
        if (gen !== generation.current) return;
        setSections((s) => s.map((x, i) => (i === 0 ? { ...x, loaded: { state: 'ready', text: parseTextObject(html), from } } : x)));
        here.current = { unitId: unit.id, source: edition.source, offset: remembered };
        recordPlace(work.id, unit.id, edition.source, remembered);
      })
      .catch((error: unknown) => {
        if (gen !== generation.current) return;
        setSections((s) => s.map((x, i) => (i === 0 ? { ...x, loaded: { state: 'error', problem: error instanceof TextLoadError ? error.problem : 'unavailable' } } : x)));
      });
  }, [work, unit, edition?.source, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // A failed load is tried again once when the connection comes back - not on every failure, which would loop.
  const failed = sections[0]?.loaded.state === 'error';
  useEffect(() => {
    if (online && failed) setAttempt((n) => n + 1);
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  // The reader's paper sets the app's chrome (status bar, dialogs) to match; the screen stays on while reading, if asked.
  useEffect(() => {
    const wanted = readerScheme(settings.theme);
    setSchemeOverride(wanted === null || wanted === baseScheme ? null : wanted);
    return () => setSchemeOverride(null);
  }, [settings.theme, baseScheme, setSchemeOverride]);
  useEffect(() => {
    setKeepScreenOn(settings.keepAwake);
    return () => setKeepScreenOn(false);
  }, [settings.keepAwake]);

  // Where the reader was, written when a scroll comes to rest and on the way out.
  const remember = useCallback(() => {
    if (here.current) recordPlace(workId, here.current.unitId, here.current.source, here.current.offset);
  }, [workId]);
  useEffect(() => remember, [remember]);

  /** The next chapter, loaded onto the end of the page. */
  const readOn = useCallback(() => {
    if (!settings.continuous || appending.current || !work || !contents) return;
    const last = sections[sections.length - 1];
    if (!last || last.loaded.state !== 'ready') return;
    const { next } = neighbours(contents, last.unit.id);
    const nextEdition = next ? chooseEdition(work, next, last.edition.source) : null;
    if (!next || !nextEdition) return;
    const gen = generation.current;
    appending.current = true;
    setSections((s) => [...s, { unit: next, edition: nextEdition, loaded: { state: 'loading' } }]);
    const settle = (loaded: Loaded) => {
      if (gen !== generation.current) return;
      appending.current = false;
      setSections((s) => s.map((x) => (x.unit.id === next.id ? { ...x, loaded } : x)));
    };
    loadUnitText(work, next, nextEdition, onlineNow.current)
      .then(({ html, from }) => settle({ state: 'ready', text: parseTextObject(html), from }))
      .catch((error: unknown) => settle({ state: 'error', problem: error instanceof TextLoadError ? error.problem : 'unavailable' }));
  }, [settings.continuous, work, contents, sections]);

  /** A chapter read on into that failed: tried again in place. */
  const retrySection = useCallback(
    (index: number) => {
      const section = sections[index];
      if (!work || !section || index === 0) return;
      const gen = generation.current;
      setSections((s) => s.map((x, i) => (i === index ? { ...x, loaded: { state: 'loading' } } : x)));
      loadUnitText(work, section.unit, section.edition, onlineNow.current)
        .then(({ html, from }) => gen === generation.current && setSections((s) => s.map((x, i) => (i === index ? { ...x, loaded: { state: 'ready', text: parseTextObject(html), from } } : x))))
        .catch((error: unknown) => gen === generation.current && setSections((s) => s.map((x, i) => (i === index ? { ...x, loaded: { state: 'error', problem: error instanceof TextLoadError ? error.problem : 'unavailable' } } : x))));
    },
    [work, sections],
  );

  const showBar = useCallback(
    (shown: boolean) => {
      if (barShown.current === shown) return;
      barShown.current = shown;
      Animated.timing(bar, { toValue: shown ? 0 : 1, duration: 180, useNativeDriver: true }).start();
    },
    [bar],
  );

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const y = contentOffset.y;
    const height = layoutMeasurement.height;
    const dy = y - lastY.current;
    lastY.current = y;
    viewport.current = height;
    if (y < BAR_HEIGHT || dy < -8) showBar(true);
    else if (dy > 8) showBar(false);

    // The chapter under the upper part of the screen is the one being read.
    const probe = y + height * 0.25;
    let index = 0;
    sections.forEach((section, i) => {
      const at = layouts.current.get(section.unit.id);
      if (at && at.y <= probe) index = i;
    });
    const section = sections[index];
    const at = section ? layouts.current.get(section.unit.id) : undefined;
    if (section && at) {
      const offset = Math.min(1, Math.max(0, (y - at.y) / Math.max(1, at.height)));
      here.current = { unitId: section.unit.id, source: section.edition.source, offset };
      const read = at.height <= height ? 1 : Math.min(1, Math.max(0, (y - at.y) / (at.height - height * 0.6)));
      const rounded = Math.round(read * 100) / 100;
      if (rounded !== progress) setProgress(rounded);
      if (index !== current) setCurrent(index);
    }
    if (contentSize.height - (y + height) < height * 1.5) readOn();
  };

  const onSectionLayout = (index: number, section: Section) => (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    layouts.current.set(section.unit.id, { y, height });
    // Reopening a chapter where it was left: once its text has its height.
    if (index === 0 && restoreTo.current !== null && section.loaded.state === 'ready' && height > 0) {
      const target = y + restoreTo.current * height;
      restoreTo.current = null;
      requestAnimationFrame(() => scroll.current?.scrollTo({ y: target, animated: false }));
    }
  };

  // A new screen in this one's place, so the chapter opens at its top and "back" still leads to the contents.
  const open = useCallback((nextUnitId: string) => navigation.replace('Reader', { workId, unitId: nextUnitId, source: edition?.source }), [navigation, workId, edition?.source]);

  const back = work && contents && unit ? ({ name: 'Work', params: { workId, path: pathToUnit(contents, unit.id) } } as const) : ({ name: 'Seforim', params: undefined } as const);
  if (!work || !unit || !contents) {
    return (
      <Screen header={<ScreenHeader back={back} title={work ? names(work.title, language) : t.seforimTitle} />}>
        <EmptyState text={t.readerNotFound} />
      </Screen>
    );
  }

  const label = (u: CatalogUnit) => (language === 'en' ? (u.labelEn ?? u.label) : u.label);
  const shown = sections[current] ?? sections[0];
  const shownUnit = shown?.unit ?? unit;
  const marked = isBookmarked(reading, workId, shownUnit.id);
  const margin = MARGIN_POINTS[settings.margins];
  const barTop = insets.top;
  const translateY = bar.interpolate({ inputRange: [0, 1], outputRange: [0, -(BAR_HEIGHT + 2)] });
  const last = sections[sections.length - 1];
  const after = last ? neighbours(contents, last.unit.id).next : null;
  const afterReadable = after ? chooseEdition(work, after, last?.edition.source) !== null : false;
  const { previous } = neighbours(contents, unit.id);
  const Back = isRtl ? ChevronRight : ChevronLeft;
  const On = isRtl ? ChevronLeft : ChevronRight;
  const align = { textAlign: isRtl ? 'right' : 'left' } as const;

  const share = (section: Section) => (paragraph: string) => {
    if (!paragraph) return;
    const message = citation(paragraph, work, section.unit, textLanguage(work, section.edition), sefariaLink(work, section.unit, section.edition));
    Share.share({ message }).catch(() => undefined);
  };

  return (
    <View style={[styles.fill, { backgroundColor: palette.background }]}>
      <ScrollView
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={{ paddingTop: barTop + BAR_HEIGHT + 12, paddingBottom: insets.bottom + 48, paddingHorizontal: margin }}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onMomentumScrollEnd={remember}
        onScrollEndDrag={remember}
        onContentSizeChange={(_, height) => {
          // A short chapter leaves room on the screen: the next one comes straight away.
          if (viewport.current > 0 && height < viewport.current * 1.6) readOn();
        }}
        onLayout={(event) => {
          viewport.current = event.nativeEvent.layout.height;
        }}
      >
        {previous && (
          <Pressable accessibilityRole="button" onPress={() => open(previous.id)} style={[styles.previous, { flexDirection: row(isRtl) }]}>
            <Back size={16} color={palette.muted} />
            <AppText numberOfLines={1} style={[styles.previousText, { color: palette.muted }]}>
              {`${t.readerPrevious}: ${label(previous)}`}
            </AppText>
          </Pressable>
        )}

        {sections.map((section, index) => (
          <View key={section.unit.id} onLayout={onSectionLayout(index, section)} style={index > 0 ? styles.nextSection : null}>
            <SectionHead work={work} section={section} position={unitPosition(contents, section.unit.id)} part={unitsAreLetters(work) ? unitPart(contents, section.unit.id) : null} settings={settings} palette={palette} first={index === 0} onEdition={(source) => navigation.setParams({ source })} />
            {section.loaded.state === 'loading' && (
              <View style={styles.center}>
                <Spinner size={22} color={palette.accent} />
              </View>
            )}
            {section.loaded.state === 'error' && (
              <View style={styles.block}>
                <TabHelp>{section.loaded.problem === 'offline' ? t.readerOffline : t.readerUnavailable}</TabHelp>
                <Button label={t.readerRetry} onPress={() => (index === 0 ? setAttempt((n) => n + 1) : retrySection(index))} />
              </View>
            )}
            {section.loaded.state === 'ready' && (
              <>
                {section.loaded.from === 'sefaria' && index === 0 && <AppText style={[styles.from, { color: palette.muted }]}>{t.readerFromSefaria}</AppText>}
                <TextObjectView text={section.loaded.text} settings={settings} palette={palette} onShare={share(section)} />
              </>
            )}
          </View>
        ))}

        {!edition && <EmptyState text={t.workNoText} />}

        {last?.loaded.state === 'ready' && (
          <View style={styles.end}>
            {settings.continuous && after && afterReadable ? (
              <View style={styles.center}>
                <Spinner size={18} color={palette.muted} />
              </View>
            ) : after ? (
              <Pressable accessibilityRole="button" onPress={() => open(after.id)} style={[styles.nextButton, { borderColor: palette.rule, flexDirection: row(isRtl) }]}>
                <View style={styles.nextText}>
                  <AppText style={[styles.nextEyebrow, align, { color: palette.muted }]}>{t.readerNext}</AppText>
                  <AppText numberOfLines={2} style={[styles.nextLabel, align, { color: palette.text }]}>
                    {label(after)}
                  </AppText>
                </View>
                <On size={20} color={palette.accent} />
              </Pressable>
            ) : (
              <View style={styles.center}>
                <View style={[styles.ornament, { backgroundColor: palette.accent }]} />
                <AppText style={[styles.endText, { color: palette.muted }]}>{t.readerEndOfSefer}</AppText>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Animated.View style={[styles.bar, { top: barTop, backgroundColor: palette.background, borderBottomColor: palette.rule, transform: [{ translateY }] }]}>
        <View style={[styles.barRow, { flexDirection: row(isRtl) }]}>
          <BackLink fallback={back} />
          <View style={styles.titles}>
            <AppText numberOfLines={1} style={[styles.workTitle, { color: palette.muted }]}>
              {names(work.title, language)}
            </AppText>
            <AppText numberOfLines={1} style={[styles.unitTitle, { color: palette.text }]}>
              {label(shownUnit)}
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={marked ? t.readerRemoveBookmark : t.readerBookmark} onPress={() => toggleBookmark(workId, shownUnit.id)} style={styles.iconButton}>
            {marked ? <BookmarkCheck size={22} color={palette.accent} /> : <Bookmark size={22} color={palette.text} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t.readerSettings} onPress={() => setSheet(true)} style={styles.iconButton}>
            <ALargeSmall size={24} color={palette.text} />
          </Pressable>
        </View>
        <View style={[styles.track, { backgroundColor: palette.rule }]}>
          <View style={[styles.progress, { backgroundColor: palette.accent, width: `${Math.round(progress * 100)}%` }, isRtl ? styles.fromRight : styles.fromLeft]} />
        </View>
      </Animated.View>
      {/* The status bar's strip keeps the page's colour while the bar is away. */}
      <View style={[styles.statusStrip, { height: insets.top, backgroundColor: palette.background }]} />

      <ReaderSettingsSheet visible={sheet} settings={settings} onClose={() => setSheet(false)} />
    </View>
  );
}

/** A chapter's head: where it falls in the sefer, its name, and (for the chapter opened) its editions. */
function SectionHead({
  work,
  section,
  position,
  part,
  settings,
  palette,
  first,
  onEdition,
}: {
  work: CatalogWork;
  section: Section;
  position: { number: number; total: number } | null;
  /** A letter's volume, which places it (its number is its title); null for a chapter, placed by its position. */
  part: CatalogNames | null;
  settings: ReaderSettings;
  palette: ReaderPalette;
  first: boolean;
  onEdition: (source: number) => void;
}) {
  const { t, language, isRtl } = useTranslation();
  const { unit, edition } = section;
  const readable = readableEditions(work, unit);
  const links = first ? linkEditions(work, unit) : [];
  const languageCount = (lang: string | undefined) => readable.filter((e) => work.sources[e.source]?.language === lang).length;
  const heading = language === 'en' ? (unit.labelEn ?? unit.label) : unit.label;
  const size = readerTextSize(settings);

  return (
    <View style={styles.head}>
      {part ? (
        <AppText style={[styles.position, { color: palette.muted }]}>{names(part, language)}</AppText>
      ) : (
        position && position.total > 1 && <AppText style={[styles.position, { color: palette.muted }]}>{t.readerChapterOf(position.number, position.total)}</AppText>
      )}
      <AppText style={[styles.heading, { color: palette.text, fontFamily: readerFont(settings.font).family ?? undefined, fontSize: Math.round(size * 1.25), lineHeight: Math.round(size * 1.7) }]}>{heading}</AppText>
      <View style={[styles.ornament, { backgroundColor: palette.accent }]} />
      {first && (readable.length > 1 || links.length > 0) && (
        <View style={[styles.editions, { flexDirection: row(isRtl) }]}>
          {readable.map((e) => {
            const source = work.sources[e.source]!;
            const active = e.source === edition.source;
            return (
              <Pressable
                key={e.source}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onEdition(e.source)}
                style={[styles.chip, { borderColor: active ? palette.accent : palette.rule }, active ? { backgroundColor: palette.accent } : null]}
              >
                <AppText style={[styles.chipText, { color: active ? palette.background : palette.text }]}>{editionLabel(source, t.editionLanguages, languageCount(source.language))}</AppText>
              </Pressable>
            );
          })}
          {links.map((e) => {
            const url = sefariaLink(work, unit, e);
            if (!url) return null;
            return (
              <Pressable key={`link-${e.source}`} accessibilityRole="link" onPress={() => Linking.openURL(url).catch(() => undefined)} style={[styles.chip, styles.linkChip, { borderColor: palette.rule, flexDirection: row(isRtl) }]}>
                <AppText style={[styles.chipText, { color: palette.muted }]}>{editionLabel(work.sources[e.source]!, t.editionLanguages, 1)}</AppText>
                <ExternalLink size={14} color={palette.muted} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { position: 'absolute', left: 0, right: 0, height: BAR_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 1 },
  barRow: { flex: 1, alignItems: 'center', paddingHorizontal: 12, gap: 4 },
  titles: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4 },
  workTitle: { fontSize: 12, fontWeight: '600' },
  unitTitle: { fontSize: 15, fontWeight: '700' },
  iconButton: { padding: 8 },
  track: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2 },
  progress: { position: 'absolute', top: 0, bottom: 0 },
  fromLeft: { left: 0 },
  fromRight: { right: 0 },
  statusStrip: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  previous: { alignItems: 'center', gap: 4, alignSelf: 'center', paddingVertical: 6, marginBottom: 6, maxWidth: '100%' },
  previousText: { fontSize: 13, fontWeight: '600' },
  head: { alignItems: 'center', marginBottom: 18 },
  position: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, marginBottom: 4 },
  heading: { fontWeight: '700', textAlign: 'center' },
  ornament: { width: 36, height: 2, borderRadius: 1, marginTop: 10, marginBottom: 4, opacity: 0.8 },
  editions: { flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  linkChip: { alignItems: 'center', gap: 6 },
  chipText: { fontSize: 14, fontWeight: '600' },
  nextSection: { marginTop: 40 },
  center: { alignItems: 'center', paddingVertical: 28 },
  block: { marginTop: 8 },
  from: { fontSize: 12, marginBottom: 10, textAlign: 'center' },
  end: { marginTop: 28 },
  nextButton: { alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  nextText: { flex: 1, minWidth: 0, gap: 2 },
  nextEyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  nextLabel: { fontSize: 16, fontWeight: '600' },
  endText: { fontSize: 13, fontWeight: '600', marginTop: 8 },
});
