import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Sparkles, X } from 'lucide-react-native';
import { gematriya } from '@hebcal/core';
import { MAFTEIACH_MONTH_OPTIONS, PDF_SECTION_ORDER, browsableYears, currentParsha } from '@sichos-kodesh/catalog';
import type { CatalogEntry, LibraryCollectionId, LibraryItemBase } from '@sichos-kodesh/catalog';
import {
  LIBRARY_ORDER,
  SEARCH_SCOPES,
  collectionYears,
  hasItemFilters,
  itemSubtitle,
  itemTitle,
  names,
  occasionFilter,
  occasionGroupName,
  occasionParshaSlugs,
  occasionTitle,
  searchLibraryItems,
  searchOccasions,
} from '@sichos-kodesh/app-core';
import type { ContentType, ItemFilters, SearchScope } from '@sichos-kodesh/app-core';
import { IL } from '../config';
import { getWorkContents, useCatalog, useLibrary, useWorks } from '../catalog/catalogStore';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useTranslation } from '../i18n/useTranslation';
import type { SearchScreenProps, SearchWhere } from '../navigation/types';
import { getPacksNative } from '../offline/packsNative';
import { useProgressMap } from '../player/useProgressMap';
import { useRecentSearches } from '../settings/recentSearches';
import { heldSearchIndexes, searchNames, searchTexts, type NameHit, type TextHit } from '../seforim/seforimSearch';
import { hebrewFullDateLabel, hebrewYearLabel, parshaLabel } from '../utils/formatHebrewDate';
import { BottomSheet } from '../ui/BottomSheet';
import { Row, RowTrailing } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { CategoryHeader, GapMessage, Subtitle, TabHelp } from '../ui/Typography';
import { FONT_FAMILY, useColors } from '../ui/theme';
import { alignStart, row, textAlign, typedIsRtl } from '../ui/rtl';

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
/** One part's results render as plain rows; past this many, the list asks for a narrower search instead of growing. */
const RESULT_LIMIT = 200;
/** Searching more than one part, each shows this many, under a heading that narrows to all of them. */
const PREVIEW = 4;
/** Waits for the typing to settle before searching the seforim's text. */
const TEXT_SEARCH_DELAY_MS = 350;

/** Where to look: everything, one part, or the library - every part but the farbrengens (the Library tab's own search box). */
const WHERE: readonly SearchWhere[] = ['all', 'farbrengens', 'library', ...SEARCH_SCOPES.filter((part) => part !== 'all' && part !== 'farbrengens')];

type SheetName = 'where' | 'year' | 'month' | 'parsha' | 'moed' | 'types';

interface ChipProps {
  label: string;
  active: boolean;
  onOpen: () => void;
  onClear: () => void;
}

/** One filter (web: `.search-chip`): its value when set, a tap opens its short list, and × takes it off. */
function FilterChip({ label, active, onOpen, onClear }: ChipProps) {
  const colors = useColors();
  const { t, isRtl } = useTranslation();
  return (
    <View style={[styles.chip, { flexDirection: row(isRtl), borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : colors.cardBg }]}>
      <Pressable onPress={onOpen} accessibilityRole="button" hitSlop={4} style={[styles.chipOpen, { flexDirection: row(isRtl) }]}>
        <AppText numberOfLines={1} style={[styles.chipLabel, { color: active ? colors.accent : colors.fg }]}>
          {label}
        </AppText>
        {!active && <ChevronDown size={14} color={colors.muted} />}
      </Pressable>
      {active && (
        <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={`${t.clearFiltersLabel}: ${label}`} hitSlop={6} style={styles.chipClear}>
          <X size={14} color={colors.accent} />
        </Pressable>
      )}
    </View>
  );
}

interface Option<T> {
  value: T;
  label: string;
}

/** A filter's choices, in the sheet it opens (web: `.sheet-options`): "any" first, the chosen one checked. */
function OptionList<T extends string | number>({ options, value, anyLabel, onPick }: { options: Array<Option<T>>; value: T | null; anyLabel?: string; onPick: (value: T | null) => void }) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  const optionRow = (key: string, label: string, on: boolean, pick: () => void, first: boolean) => (
    <Pressable
      key={key}
      onPress={pick}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.option, { flexDirection: row(isRtl) }, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.cardHover }]}
    >
      <AppText style={[styles.optionLabel, on && styles.optionLabelOn, { color: on ? colors.accent : colors.fg, textAlign: textAlign(isRtl) }]}>{label}</AppText>
      {on && <Check size={18} color={colors.accent} />}
    </Pressable>
  );
  return (
    <View style={[styles.options, { backgroundColor: colors.cardBg }]}>
      {anyLabel !== undefined && optionRow('any', anyLabel, value == null, () => onPick(null), true)}
      {options.map((option, i) => optionRow(String(option.value), option.label, option.value === value, () => onPick(option.value), anyLabel === undefined && i === 0))}
    </View>
  );
}

/**
 * One search for everything (web: `/search`; docs: the UI/UX redo plan,
 * "חיפוש"): one box, and under it the filters as chips - where to look,
 * the year, the month and day, mafteiach's parsha and moed, and what a
 * farbrengen has - each opening a short list in a sheet. Before anything is
 * typed: the searches made lately, and this week's parsha. The results
 * come grouped by kind with their counts; a group's heading narrows the
 * search to it. The query matches names in both languages, the whole names
 * the titles shorten, where and when each was said - and, on the phone, the
 * text of every sefer saved on it.
 */
export function SearchScreen({ navigation, route }: SearchScreenProps) {
  const catalog = useCatalog();
  const library = useLibrary();
  const works = useWorks();
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const progressMap = useProgressMap();
  const { recent, remember, clear: clearRecent } = useRecentSearches();
  const [scope, setScope] = useState<SearchWhere>(route.params?.scope ?? 'all');
  const [query, setQuery] = useState(route.params?.query ?? '');
  const deferredQuery = useDeferredValue(query);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [hebrewYear, setHebrewYear] = useState<number | null>(null);
  const [hdateMonth, setHdateMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [parshaSlug, setParshaSlug] = useState<string | null>(null);
  const [moedSlug, setMoedSlug] = useState<string | null>(null);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [packs, setPacks] = useState<number | null>(null);
  const [textHits, setTextHits] = useState<TextHit[] | null>(null);
  const [textSearching, setTextSearching] = useState(false);
  const Chevron = isRtl ? ChevronLeft : ChevronRight;

  const itemFilters: ItemFilters = { hebrewYear, hdateMonth, day, parshaSlug, moedSlug };
  const filtered = hasItemFilters(itemFilters) || types.length > 0;
  const typed = deferredQuery.trim().length >= 2;
  const inScope = (part: SearchScope) => scope === 'all' || scope === part || (scope === 'library' && part !== 'farbrengens');
  const farbrengensOpen = scope === 'all' || scope === 'farbrengens';
  // The seforim have no date, parsha or moed: a filter leaves them out.
  const seforimOpen = inScope('seforim') && !filtered;

  const occasionIds = useMemo(
    () => occasionFilter([library.parshiyos.find((g) => g.slug === parshaSlug), library.moadim.find((g) => g.slug === moedSlug)]),
    [library, parshaSlug, moedSlug],
  );
  const farbrengens = useMemo((): CatalogEntry[] => {
    if (!inScope('farbrengens') || (!deferredQuery.trim() && !filtered)) return [];
    const groups = searchOccasions(catalog, { query: deferredQuery, hebrewYear, hdateMonth, day, parsha: null, specialDay: null, types, occasionIds });
    return groups.flatMap((group) => group.entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, scope, deferredQuery, hebrewYear, hdateMonth, day, types, occasionIds]);
  const collections = useMemo((): Array<{ collection: LibraryCollectionId; items: LibraryItemBase[] }> => {
    // The content types say what a farbrengen has; they have nothing to say about the library.
    if (types.length > 0) return [];
    return LIBRARY_ORDER.filter((collection) => inScope(collection)).map((collection) => ({
      collection,
      items: searchLibraryItems(library, collection, deferredQuery, { hebrewYear, hdateMonth, day, parshaSlug, moedSlug }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, scope, deferredQuery, hebrewYear, hdateMonth, day, parshaSlug, moedSlug, types]);
  const nameHits = useMemo((): NameHit[] => (seforimOpen && typed ? searchNames(works, getWorkContents, deferredQuery) : []), [works, seforimOpen, typed, deferredQuery]);

  // This week's parsha, as a filter to try before typing.
  const weekParsha = useMemo(() => {
    const { parsha } = currentParsha(IL);
    const slug = occasionParshaSlugs(library, parsha)[0];
    return slug && parsha ? { slug, name: parshaLabel(parsha, language) } : null;
  }, [library, language]);

  useEffect(() => {
    heldSearchIndexes()
      .then((indexes) => setPacks(indexes.size))
      .catch(() => setPacks(0));
  }, []);

  useEffect(() => {
    const native = getPacksNative();
    if (!native || !packs || !seforimOpen || !typed) {
      setTextHits(null);
      return;
    }
    let alive = true;
    setTextSearching(true);
    const timer = setTimeout(() => {
      searchTexts(native, works, getWorkContents, deferredQuery)
        .then((hits) => alive && setTextHits(hits))
        .catch(() => alive && setTextHits([]))
        .finally(() => alive && setTextSearching(false));
    }, TEXT_SEARCH_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [deferredQuery, packs, works, seforimOpen, typed]);

  function toggleType(type: ContentType): void {
    setTypes((prev) => (prev.includes(type) ? prev.filter((t2) => t2 !== type) : [...prev, type]));
  }

  function clearFilters(): void {
    setHebrewYear(null);
    setHdateMonth(null);
    setDay(null);
    setParshaSlug(null);
    setMoedSlug(null);
    setTypes([]);
  }

  function chooseScope(next: SearchWhere): void {
    setScope(next);
    // A year one part has may not be in the next; the content types are the farbrengens' own.
    if (next !== 'all' && next !== 'library' && next !== 'farbrengens' && next !== 'seforim' && hebrewYear != null && !collectionYears(library, next).includes(hebrewYear)) setHebrewYear(null);
    if (next !== 'all' && next !== 'farbrengens') setTypes([]);
  }

  const scopeName = (part: SearchWhere): string =>
    part === 'all'
      ? t.searchScopeAll
      : part === 'farbrengens'
        ? t.searchScopeFarbrengens
        : part === 'library'
          ? t.searchScopeLibrary
          : part === 'seforim'
            ? t.searchScopeSeforim
            : t.collectionNames[part];
  const years = useMemo(
    () => (scope === 'all' || scope === 'library' || scope === 'farbrengens' || scope === 'seforim' ? browsableYears(catalog) : collectionYears(library, scope)),
    [catalog, library, scope],
  );
  const typeOptions: Array<Option<ContentType>> = [
    { value: 'audio', label: t.audioTypeLabel },
    { value: 'hanacha', label: t.hanachaTypeLabel },
    ...PDF_SECTION_ORDER.map((section) => ({ value: section, label: t.sectionLabels[section] })),
  ];
  const monthName = (hdate: number) => {
    const month = MAFTEIACH_MONTH_OPTIONS.find((m) => m.hdateMonth === hdate);
    return month ? (language === 'he' ? month.nameHebrew : month.name) : '';
  };
  const dayName = (d: number) => (language === 'he' ? gematriya(d) : String(d));
  const parshaGroup = library.parshiyos.find((g) => g.slug === parshaSlug);
  const moedGroup = library.moadim.find((g) => g.slug === moedSlug);
  const anyFilter = filtered || scope !== 'all';
  const active = deferredQuery.trim() !== '' || filtered;
  const seforimCount = nameHits.length + (textHits?.length ?? 0);
  const total = farbrengens.length + collections.reduce((n, c) => n + c.items.length, 0) + seforimCount;
  const grouped = scope === 'all' || scope === 'library';
  const limit = grouped ? PREVIEW : RESULT_LIMIT;
  const opened = () => remember(query);

  const sectionHeader = (part: SearchScope, count: number, first: boolean) =>
    grouped ? (
      <Pressable
        onPress={() => chooseScope(part)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.groupHead, { flexDirection: row(isRtl) }, first && styles.groupHeadFirst, pressed && styles.pressed]}
      >
        <AppText style={[styles.groupName, { color: colors.fg }]}>{scopeName(part)}</AppText>
        <AppText style={[styles.groupCount, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{count}</AppText>
        <Chevron size={16} color={colors.muted} />
      </Pressable>
    ) : (
      <CategoryHeader first={first}>{`${scopeName(part)} · ${count}`}</CategoryHeader>
    );
  const showAll = (part: SearchScope, count: number) =>
    grouped && count > PREVIEW ? (
      <Pressable onPress={() => chooseScope(part)} hitSlop={8} accessibilityRole="button" style={[styles.showAllButton, { alignSelf: alignStart(isRtl) }]}>
        <AppText style={[styles.showAll, { color: colors.accent }]}>{t.searchShowAll(count)}</AppText>
      </Pressable>
    ) : null;
  const seforimLabel = (hit: { work: { title: { he: string; en: string } }; unit?: { label: string; labelEn?: string } }) =>
    hit.unit ? `${names(hit.work.title, language)} · ${language === 'en' ? (hit.unit.labelEn ?? hit.unit.label) : hit.unit.label}` : names(hit.work.title, language);
  let firstSection = true;
  const isFirst = () => {
    const was = firstSection;
    firstSection = false;
    return was;
  };
  const sheetTitle: Record<SheetName, string> = {
    where: t.searchKindChip,
    year: t.yearFilterLabel,
    month: t.monthFilterLabel,
    parsha: t.parshaFilterLabel,
    moed: t.moedFilterLabel,
    types: t.searchContentsChip,
  };
  const pickAndClose =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setSheet(null);
    };
  const startRow = (key: string, Icon: typeof Clock, label: string, onPress: () => void, first: boolean) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.startRow, { flexDirection: row(isRtl) }, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.cardHover }]}
    >
      <Icon size={18} color={colors.accent} />
      <AppText style={[styles.startLabel, { color: colors.fg, textAlign: textAlign(isRtl) }]}>{label}</AppText>
    </Pressable>
  );

  return (
    <Screen header={<ScreenHeader title={t.searchTitle} />}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => remember(query)}
        placeholder={scope === 'library' ? t.searchLibraryEverythingPlaceholder : t.searchEverythingPlaceholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t.searchEverythingPlaceholder}
        returnKeyType="search"
        autoFocus={!route.params?.scope}
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.cardBg, color: colors.fg, textAlign: textAlign(typedIsRtl(query, isRtl)) }]}
      />

      {/* The filters as chips: each opens its short list, × takes it off. */}
      <View style={[styles.chips, { flexDirection: row(isRtl) }]} accessibilityLabel={t.searchFiltersLabel}>
        <FilterChip label={scope === 'all' ? t.searchKindChip : scopeName(scope)} active={scope !== 'all'} onOpen={() => setSheet('where')} onClear={() => chooseScope('all')} />
        <FilterChip label={hebrewYear != null ? hebrewYearLabel(hebrewYear, language) : t.yearFilterLabel} active={hebrewYear != null} onOpen={() => setSheet('year')} onClear={() => setHebrewYear(null)} />
        <FilterChip
          label={hdateMonth != null ? [day != null ? dayName(day) : null, monthName(hdateMonth)].filter(Boolean).join(' ') : day != null ? `${t.dayFilterLabel} ${dayName(day)}` : t.monthFilterLabel}
          active={hdateMonth != null || day != null}
          onOpen={() => setSheet('month')}
          onClear={() => {
            setHdateMonth(null);
            setDay(null);
          }}
        />
        <FilterChip label={parshaGroup ? occasionGroupName(parshaGroup, language) : t.parshaFilterLabel} active={!!parshaGroup} onOpen={() => setSheet('parsha')} onClear={() => setParshaSlug(null)} />
        <FilterChip label={moedGroup ? occasionGroupName(moedGroup, language) : t.moedFilterLabel} active={!!moedGroup} onOpen={() => setSheet('moed')} onClear={() => setMoedSlug(null)} />
        {farbrengensOpen && (
          <FilterChip label={types.length > 0 ? t.searchContentsCount(types.length) : t.searchContentsChip} active={types.length > 0} onOpen={() => setSheet('types')} onClear={() => setTypes([])} />
        )}
        {anyFilter && (
          <Pressable
            onPress={() => {
              clearFilters();
              chooseScope('all');
            }}
            hitSlop={6}
            accessibilityRole="button"
            style={styles.clearLink}
          >
            <AppText style={[styles.clearLinkText, { color: colors.muted }]}>{t.clearFiltersLabel}</AppText>
          </Pressable>
        )}
      </View>

      <BottomSheet visible={sheet !== null} title={sheet ? sheetTitle[sheet] : ''} onClose={() => setSheet(null)}>
        {sheet === 'where' && <OptionList options={WHERE.map((part) => ({ value: part, label: scopeName(part) }))} value={scope} onPick={pickAndClose((value: SearchWhere | null) => chooseScope(value ?? 'all'))} />}
        {sheet === 'year' && <OptionList options={years.map((year) => ({ value: year, label: hebrewYearLabel(year, language) }))} value={hebrewYear} anyLabel={t.anyFilterOption} onPick={pickAndClose(setHebrewYear)} />}
        {sheet === 'month' && (
          <>
            <OptionList options={MAFTEIACH_MONTH_OPTIONS.map((month) => ({ value: month.hdateMonth, label: monthName(month.hdateMonth) }))} value={hdateMonth} anyLabel={t.anyFilterOption} onPick={setHdateMonth} />
            <AppText style={[styles.sheetSubtitle, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{t.dayFilterLabel}</AppText>
            <View style={[styles.days, { flexDirection: row(isRtl) }]}>
              {DAYS.map((d) => {
                const on = day === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDay(on ? null : d)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.day, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : colors.cardBg }]}
                  >
                    <AppText style={[styles.dayLabel, { color: on ? colors.accentFg : colors.fg }]}>{dayName(d)}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        {sheet === 'parsha' && (
          <OptionList options={library.parshiyos.map((group) => ({ value: group.slug, label: occasionGroupName(group, language) }))} value={parshaSlug} anyLabel={t.anyFilterOption} onPick={pickAndClose(setParshaSlug)} />
        )}
        {sheet === 'moed' && <OptionList options={library.moadim.map((group) => ({ value: group.slug, label: occasionGroupName(group, language) }))} value={moedSlug} anyLabel={t.anyFilterOption} onPick={pickAndClose(setMoedSlug)} />}
        {sheet === 'types' && (
          <>
            <TabHelp>{t.searchTypesFarbrengensOnly}</TabHelp>
            <View style={[styles.options, { backgroundColor: colors.cardBg }]}>
              {typeOptions.map((option, i) => {
                const on = types.includes(option.value);
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => toggleType(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [styles.option, { flexDirection: row(isRtl) }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.cardHover }]}
                  >
                    <AppText style={[styles.optionLabel, on && styles.optionLabelOn, { color: on ? colors.accent : colors.fg, textAlign: textAlign(isRtl) }]}>{option.label}</AppText>
                    {on && <Check size={18} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </BottomSheet>

      {/* Before anything is typed: the searches made lately, and this week's parsha to try. */}
      {!active && (
        <>
          {recent.length > 0 && (
            <View style={styles.start}>
              <View style={[styles.startHead, { flexDirection: row(isRtl) }]}>
                <CategoryHeader first>{t.searchRecent}</CategoryHeader>
                <Pressable onPress={clearRecent} hitSlop={8} accessibilityRole="button">
                  <AppText style={[styles.clearLinkText, { color: colors.muted }]}>{t.searchClearRecent}</AppText>
                </Pressable>
              </View>
              <View style={[styles.startList, { backgroundColor: colors.cardBg }]}>{recent.map((item, i) => startRow(item, Clock, item, () => setQuery(item), i === 0))}</View>
            </View>
          )}
          {weekParsha && (
            <View style={styles.start}>
              <CategoryHeader first={recent.length === 0}>{t.searchSuggestions}</CategoryHeader>
              <View style={[styles.startList, { backgroundColor: colors.cardBg }]}>{startRow('parsha', Sparkles, t.searchWeekParsha(weekParsha.name), () => setParshaSlug(weekParsha.slug), true)}</View>
            </View>
          )}
          <TabHelp>{inScope('seforim') && scope !== 'all' && packs === 0 ? t.seforimSearchNoPacks : scope === 'library' ? t.searchLibraryEverythingHelp : t.searchEverythingHelp}</TabHelp>
        </>
      )}

      {active && <Subtitle style={styles.resultsCount}>{t.searchResultsCount(total)}</Subtitle>}
      {active && total === 0 && !textSearching && <GapMessage>{t.searchNothingAnywhere}</GapMessage>}

      {farbrengens.length > 0 && (
        <View style={styles.group}>
          {sectionHeader('farbrengens', farbrengens.length, isFirst())}
          {farbrengens.slice(0, limit).map((entry) => (
            <Row
              key={`${entry.hebrewYear}-${entry.occasionId}`}
              label={occasionTitle(entry, language)}
              trailing={
                <RowTrailing>
                  <OccasionRowIcon entry={entry} progressMap={progressMap} />
                </RowTrailing>
              }
              onPress={() => {
                opened();
                navigation.navigate('Farbrengen', { kind: 'search', hebrewYear: entry.hebrewYear, occasionId: entry.occasionId });
              }}
            >
              <AppText numberOfLines={1} style={[styles.subtitle, { color: colors.muted, textAlign: textAlign(isRtl) }]}>
                {hebrewFullDateLabel(entry.hebrewDate, entry.hebrewYear, language)}
              </AppText>
            </Row>
          ))}
          {showAll('farbrengens', farbrengens.length)}
          {!grouped && farbrengens.length > limit && <GapMessage>{t.searchShowingFirst(limit, farbrengens.length)}</GapMessage>}
        </View>
      )}

      {collections.map(({ collection, items }) =>
        items.length === 0 ? null : (
          <View key={collection} style={styles.group}>
            {sectionHeader(collection, items.length, isFirst())}
            {items.slice(0, limit).map((item) => {
              const subtitle = itemSubtitle(collection, item, language);
              return (
                <Row
                  key={item.id}
                  label={itemTitle(collection, item, language)}
                  marquee
                  onPress={() => {
                    opened();
                    navigation.navigate('LibraryItem', { collection, id: item.id });
                  }}
                >
                  {subtitle ? (
                    <AppText numberOfLines={2} style={[styles.subtitle, { color: colors.muted, textAlign: textAlign(isRtl) }]}>
                      {subtitle}
                    </AppText>
                  ) : null}
                </Row>
              );
            })}
            {showAll(collection, items.length)}
            {!grouped && items.length > limit && <GapMessage>{t.searchShowingFirst(limit, items.length)}</GapMessage>}
          </View>
        ),
      )}

      {seforimCount > 0 || (seforimOpen && typed && textSearching) ? (
        <View style={styles.group}>
          {sectionHeader('seforim', seforimCount, isFirst())}
          {(textSearching || (textHits?.length ?? 0) > 0) && <AppText style={[styles.typeLabel, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{t.seforimSearchText}</AppText>}
          {textSearching && textHits === null && <Spinner size={18} color={colors.accent} />}
          {textHits?.slice(0, limit).map((hit) => (
            <Row
              key={`${hit.work.id}/${hit.unit.id}@${hit.source}`}
              label={seforimLabel(hit)}
              onPress={() => {
                opened();
                navigation.navigate('Reader', { workId: hit.work.id, unitId: hit.unit.id, source: hit.source });
              }}
            >
              {hit.snippet && (
                <AppText numberOfLines={3} style={[styles.snippet, { color: colors.muted, textAlign: textAlign(isRtl) }]}>
                  {hit.snippet}
                </AppText>
              )}
            </Row>
          ))}
          {nameHits.length > 0 && <AppText style={[styles.typeLabel, styles.namesLabel, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{t.seforimSearchNames}</AppText>}
          {nameHits.slice(0, limit).map((hit) => (
            <Row
              key={hit.unit ? `${hit.work.id}/${hit.unit.id}` : hit.work.id}
              label={seforimLabel(hit)}
              onPress={() => {
                opened();
                if (hit.unit) navigation.navigate('Reader', { workId: hit.work.id, unitId: hit.unit.id });
                else navigation.navigate('Work', { workId: hit.work.id });
              }}
            />
          ))}
          {showAll('seforim', seforimCount)}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.search-input` - padding 12px 14px, 1px border, radius 10, 16px. */
  input: { paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderRadius: 10, fontSize: 16, fontFamily: FONT_FAMILY },
  /** Web: `.search-chips` / `.search-chip`. */
  chips: { flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 16 },
  chip: { alignItems: 'center', borderWidth: 1, borderRadius: 999 },
  chipOpen: { alignItems: 'center', gap: 4, minHeight: 34, paddingVertical: 6, paddingHorizontal: 12 },
  chipLabel: { fontSize: 14, fontWeight: '600', maxWidth: 200 },
  chipClear: { paddingVertical: 6, paddingHorizontal: 8 },
  clearLink: { paddingHorizontal: 4 },
  clearLinkText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  /** Web: `.sheet-options` / `.sheet-option`. */
  options: { borderRadius: 12, overflow: 'hidden' },
  option: { alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 46, paddingVertical: 10, paddingHorizontal: 14 },
  optionLabel: { flex: 1, fontSize: 15 },
  optionLabelOn: { fontWeight: '700' },
  sheetSubtitle: { fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  /** Web: `.sheet-days` - six to a row. */
  days: { flexWrap: 'wrap', gap: 6 },
  day: { width: '14.6%', minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10 },
  dayLabel: { fontSize: 14, fontVariant: ['tabular-nums'] },
  /** Web: `.search-start`. */
  start: { marginBottom: 18 },
  startHead: { alignItems: 'baseline', justifyContent: 'space-between' },
  startList: { borderRadius: 12, overflow: 'hidden' },
  startRow: { alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 12, paddingHorizontal: 16 },
  startLabel: { flex: 1, fontSize: 15 },
  resultsCount: { marginBottom: 4 },
  /** Web: `.search-group` / `.search-group-head`. */
  group: { marginBottom: 18 },
  groupHead: { alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 6, paddingVertical: 6 },
  groupHeadFirst: { marginTop: 4 },
  groupName: { fontSize: 16, fontWeight: '700' },
  groupCount: { flex: 1, fontSize: 14, fontVariant: ['tabular-nums'] },
  showAllButton: { marginTop: 6 },
  showAll: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  typeLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.72, marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 19 },
  snippet: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  namesLabel: { marginTop: 12 },
});
