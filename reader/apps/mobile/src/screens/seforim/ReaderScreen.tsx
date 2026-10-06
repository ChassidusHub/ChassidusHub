import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALargeSmall, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Flag } from 'lucide-react-native';
import { openFixLink } from '../../components/FixLinks';
import { catalogUnit, type CatalogEdition, type CatalogNames, type CatalogUnit, type CatalogWork } from '@chassidushub-reader/catalog';
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
} from '@chassidushub-reader/app-core';
import { editionUrl } from '@chassidushub-reader/sefaria-index/reader';
import { getWorkContents, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { ReaderScreenProps } from '../../navigation/types';
import { useOnlineStatus } from '../../network/useOnlineStatus';
import { readerPalette, readerScheme } from '../../seforim/readerPalette';
import { isBookmarked, recordPlace, toggleBookmark, useReadingState } from '../../seforim/readingState';
import { TextLoadError, loadUnitText, type TextFrom, type TextProblem } from '../../seforim/seforimText';
import { EditionPicker } from '../../seforim/EditionPicker';
import { TextObjectView } from '../../seforim/TextObjectView';
import { ReadingBar, READING_BAR_HEIGHT } from '../../ui/ReadingBar';
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

/** One chapter on the page: the one opened, those read on into after it, and those read back into before it. */
interface Section {
  unit: CatalogUnit;
  edition: CatalogEdition;
  loaded: Loaded;
}

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
 * follows on the same page, and the one before comes in above as the top
 * is neared, the page staying where it was (previous and next buttons,
 * when that is off); the place is kept to the paragraph, so a sefer
 * reopens where it was left. A long press on a paragraph shares it with
 * its source.
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
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const layouts = useRef(new Map<string, { y: number; height: number }>());
  const generation = useRef(0);
  const appending = useRef(false);
  const prepending = useRef(false);
  /** The chapter before that could not be had: not asked for again on every scroll. */
  const backFailed = useRef<string | null>(null);
  const restoreTo = useRef<number | null>(null);
  const lastY = useRef(0);
  const viewport = useRef(0);
  const onlineNow = useRef(online);
  onlineNow.current = online;
  const here = useRef<{ unitId: string; source: number; offset: number } | null>(null);
  // The bar (and the status strip under it) step aside on a scroll down and come back on a small scroll up; a tap on the text hides them or brings them back.
  const [barHidden, setBarHidden] = useState(false);
  const barShown = useRef(true);

  // The chapter opened: loaded afresh when it or its edition changes; anything read on into is dropped.
  useEffect(() => {
    if (!work || !unit || !edition) return;
    const gen = ++generation.current;
    appending.current = false;
    prepending.current = false;
    backFailed.current = null;
    layouts.current.clear();
    setCurrentId(null);
    const remembered = place && place.unitId === unit.id && place.source === edition.source ? (place.offset ?? 0) : 0;
    restoreTo.current = remembered > 0 ? remembered : null;
    setSections([{ unit, edition, loaded: { state: 'loading' } }]);
    loadUnitText(work, unit, edition, online)
      .then(({ html, from }) => {
        if (gen !== generation.current) return;
        setSections((s) => s.map((x) => (x.unit.id === unit.id ? { ...x, loaded: { state: 'ready', text: parseTextObject(html), from } } : x)));
        here.current = { unitId: unit.id, source: edition.source, offset: remembered };
        recordPlace(work.id, unit.id, edition.source, remembered);
      })
      .catch((error: unknown) => {
        if (gen !== generation.current) return;
        setSections((s) => s.map((x) => (x.unit.id === unit.id ? { ...x, loaded: { state: 'error', problem: error instanceof TextLoadError ? error.problem : 'unavailable' } } : x)));
      });
  }, [work, unit, edition?.source, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // A failed load is tried again once when the connection comes back - not on every failure, which would loop.
  const opened = sections.find((s) => s.unit.id === unit?.id);
  const failed = opened?.loaded.state === 'error';
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
      if (!work || !section || section.unit.id === unit?.id) return;
      const gen = generation.current;
      setSections((s) => s.map((x, i) => (i === index ? { ...x, loaded: { state: 'loading' } } : x)));
      loadUnitText(work, section.unit, section.edition, onlineNow.current)
        .then(({ html, from }) => gen === generation.current && setSections((s) => s.map((x, i) => (i === index ? { ...x, loaded: { state: 'ready', text: parseTextObject(html), from } } : x))))
        .catch((error: unknown) => gen === generation.current && setSections((s) => s.map((x, i) => (i === index ? { ...x, loaded: { state: 'error', problem: error instanceof TextLoadError ? error.problem : 'unavailable' } } : x))));
    },
    [work, unit, sections],
  );

  /** The chapter before, loaded onto the top of the page as the top is neared; the page stays where it was (maintainVisibleContentPosition). */
  const readBack = useCallback(() => {
    if (!settings.continuous || prepending.current || restoreTo.current !== null || !work || !contents) return;
    const first = sections[0];
    if (!first || first.loaded.state !== 'ready') return;
    const { previous: before } = neighbours(contents, first.unit.id);
    const beforeEdition = before ? chooseEdition(work, before, first.edition.source) : null;
    if (!before || !beforeEdition || backFailed.current === before.id) return;
    const gen = generation.current;
    prepending.current = true;
    loadUnitText(work, before, beforeEdition, onlineNow.current)
      .then(({ html, from }) => {
        if (gen !== generation.current) return;
        prepending.current = false;
        setSections((s) => [{ unit: before, edition: beforeEdition, loaded: { state: 'ready', text: parseTextObject(html), from } }, ...s]);
      })
      .catch(() => {
        if (gen !== generation.current) return;
        prepending.current = false;
        backFailed.current = before.id;
      });
  }, [settings.continuous, work, contents, sections]);

  // Opened at its top: the chapter before is put above it straight away, ready to scroll up into.
  const openedReady = opened?.loaded.state === 'ready';
  useEffect(() => {
    if (openedReady && restoreTo.current === null) readBack();
  }, [openedReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const showBar = useCallback((shown: boolean) => {
    if (barShown.current === shown) return;
    barShown.current = shown;
    setBarHidden(!shown);
  }, []);
  const toggleBar = useCallback(() => showBar(!barShown.current), [showBar]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const y = contentOffset.y;
    const height = layoutMeasurement.height;
    const dy = y - lastY.current;
    lastY.current = y;
    viewport.current = height;
    if (y < READING_BAR_HEIGHT || dy < -8) showBar(true);
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
      if (section.unit.id !== currentId) setCurrentId(section.unit.id);
    }
    if (contentSize.height - (y + height) < height * 1.5) readOn();
    if (y < height * 1.2) readBack();
  };

  const onSectionLayout = (section: Section) => (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    layouts.current.set(section.unit.id, { y, height });
    // Reopening a chapter where it was left: once its text has its height.
    if (section.unit.id === unit?.id && restoreTo.current !== null && section.loaded.state === 'ready' && height > 0) {
      const target = y + restoreTo.current * height;
      restoreTo.current = null;
      requestAnimationFrame(() => scroll.current?.scrollTo({ y: target, animated: false }));
    }
  };

  // A new screen in this one's place, so the chapter opens at its top and "back" still leads to the contents.
  const open = useCallback((nextUnitId: string) => navigation.replace('Reader', { workId, unitId: nextUnitId, source: edition?.source }), [navigation, workId, edition?.source]);

  const back = work && contents && unit ? ({ name: 'Work', params: { workId, path: pathToUnit(contents, unit.id) } } as const) : ({ name: 'Library', params: undefined } as const);
  if (!work || !unit || !contents) {
    return (
      <Screen header={<ScreenHeader back={back} title={work ? names(work.title, language) : t.seforimTitle} />}>
        <EmptyState text={t.readerNotFound} />
      </Screen>
    );
  }

  const label = (u: CatalogUnit) => (language === 'en' ? (u.labelEn ?? u.label) : u.label);
  const shown = sections.find((s) => s.unit.id === currentId) ?? opened ?? sections[0];
  const shownUnit = shown?.unit ?? unit;
  const marked = isBookmarked(reading, workId, shownUnit.id);
  const margin = MARGIN_POINTS[settings.margins];
  const barTop = insets.top;
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
        contentContainerStyle={{ paddingTop: barTop + READING_BAR_HEIGHT + 12, paddingBottom: insets.bottom + 48, paddingHorizontal: margin }}
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
        // A chapter put above the one on screen leaves the words on screen where they were.
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      >
        {/* Read chapter by chapter: the one before is a step away. Read on continuously, it comes in above as the top is neared. */}
        {!settings.continuous && previous && (
          <Pressable accessibilityRole="button" onPress={() => open(previous.id)} style={[styles.nextButton, styles.before, { borderColor: palette.rule, flexDirection: row(isRtl) }]}>
            <Back size={20} color={palette.accent} />
            <View style={styles.nextText}>
              <AppText style={[styles.nextEyebrow, align, { color: palette.muted }]}>{t.readerPrevious}</AppText>
              <AppText numberOfLines={2} style={[styles.nextLabel, align, { color: palette.text }]}>
                {label(previous)}
              </AppText>
            </View>
          </Pressable>
        )}

        {sections.map((section, index) => (
          <View key={section.unit.id} onLayout={onSectionLayout(section)} style={index > 0 ? styles.nextSection : null}>
            <SectionHead work={work} section={section} position={unitPosition(contents, section.unit.id)} part={unitsAreLetters(work) ? unitPart(contents, section.unit.id) : null} settings={settings} palette={palette} first={section.unit.id === unit.id} onEdition={(source) => navigation.setParams({ source })} />
            {section.loaded.state === 'loading' && (
              <View style={styles.center}>
                <Spinner size={22} color={palette.accent} />
              </View>
            )}
            {section.loaded.state === 'error' && (
              <View style={styles.block}>
                <TabHelp>{section.loaded.problem === 'offline' ? t.readerOffline : t.readerUnavailable}</TabHelp>
                <Button label={t.readerRetry} onPress={() => (section.unit.id === unit.id ? setAttempt((n) => n + 1) : retrySection(index))} />
              </View>
            )}
            {section.loaded.state === 'ready' && (
              <>
                {section.loaded.from === 'sefaria' && section.unit.id === unit.id && <AppText style={[styles.from, { color: palette.muted }]}>{t.readerFromSefaria}</AppText>}
                <TextObjectView text={section.loaded.text} settings={settings} palette={palette} onShare={share(section)} onTap={toggleBar} />
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

      <ReadingBar
        back={back}
        context={names(work.title, language)}
        title={label(shownUnit)}
        hidden={barHidden && !sheet}
        palette={{ background: palette.background, rule: palette.rule, text: palette.text, muted: palette.muted }}
        overlay={{ top: barTop }}
      >
        <Pressable accessibilityRole="button" accessibilityLabel={marked ? t.readerRemoveBookmark : t.readerBookmark} onPress={() => toggleBookmark(workId, shownUnit.id)} style={styles.iconButton}>
          {marked ? <BookmarkCheck size={22} color={palette.accent} /> : <Bookmark size={22} color={palette.text} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t.readerSettings} onPress={() => setSheet(true)} style={styles.iconButton}>
          <ALargeSmall size={24} color={palette.text} />
        </Pressable>
        {/* A mistake on this page: ChassidusHub's site, on this page (FixLinks.tsx). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.fixReport}
          onPress={() =>
            Alert.alert(label(shownUnit), t.fixHelp, [
              { text: t.fixSuggest, onPress: () => openFixLink('edit', { work: workId, unit: shownUnit.id }) },
              { text: t.fixReport, onPress: () => openFixLink('report', { work: workId, unit: shownUnit.id }) },
              { text: t.cancelLabel, style: 'cancel' },
            ])
          }
          style={styles.iconButton}
        >
          <Flag size={20} color={palette.text} />
        </Pressable>
      </ReadingBar>
      {/* The status bar's strip keeps the page's colour while the bar is away. */}
      <View style={[styles.statusStrip, { height: insets.top, backgroundColor: palette.background }]} />

      <ReaderSettingsSheet visible={sheet} settings={settings} onClose={() => setSheet(false)} />
    </View>
  );
}

/** A chapter's head: where it falls in the sefer, its name, and (for the chapter opened) its edition, to change. */
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
  const { t, language } = useTranslation();
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
      {first && (
        <EditionPicker
          editions={readable.map((e) => ({ source: e.source, label: editionLabel(work.sources[e.source]!, t.editionLanguages, languageCount(work.sources[e.source]!.language)) }))}
          current={edition.source}
          links={links.flatMap((e) => {
            const url = sefariaLink(work, unit, e);
            return url ? [{ source: e.source, label: editionLabel(work.sources[e.source]!, t.editionLanguages, 1), url }] : [];
          })}
          palette={palette}
          onChoose={onEdition}
          onOpenLink={(url) => Linking.openURL(url).catch(() => undefined)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  iconButton: { padding: 8 },
  statusStrip: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  before: { marginBottom: 28 },
  head: { alignItems: 'center', marginBottom: 18 },
  position: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, marginBottom: 4 },
  heading: { fontWeight: '700', textAlign: 'center' },
  ornament: { width: 36, height: 2, borderRadius: 1, marginTop: 10, marginBottom: 4, opacity: 0.8 },
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
