import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';
import { gematriya } from '@hebcal/core';
import { MAFTEIACH_MONTH_OPTIONS, PDF_SECTION_ORDER, browsableYears } from '@sichos-kodesh/catalog';
import type { CatalogEntry, LibraryCollectionId, LibraryItemBase } from '@sichos-kodesh/catalog';
import {
  LIBRARY_ORDER,
  NO_ITEM_FILTERS,
  SEARCH_SCOPES,
  collectionYears,
  hasItemFilters,
  itemSubtitle,
  itemTitle,
  names,
  occasionFilter,
  occasionGroupName,
  occasionTitle,
  searchLibraryItems,
  searchOccasions,
} from '@sichos-kodesh/app-core';
import type { ContentType, ItemFilters, SearchScope } from '@sichos-kodesh/app-core';
import { getWorkContents, useCatalog, useLibrary, useWorks } from '../catalog/catalogStore';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useTranslation } from '../i18n/useTranslation';
import type { SearchScreenProps } from '../navigation/types';
import { getPacksNative } from '../offline/packsNative';
import { useProgressMap } from '../player/useProgressMap';
import { heldSearchIndexes, searchNames, searchTexts, type NameHit, type TextHit } from '../seforim/seforimSearch';
import { hebrewFullDateLabel, hebrewYearLabel } from '../utils/formatHebrewDate';
import { Row, RowTrailing } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Select } from '../ui/Select';
import { Spinner } from '../ui/Spinner';
import { AppText } from '../ui/Text';
import { CategoryHeader, GapMessage, Subtitle, TabHelp } from '../ui/Typography';
import { FONT_FAMILY, useColors } from '../ui/theme';
import { row, textAlign } from '../ui/rtl';

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
/** One scope's results render as plain rows; past this many, the list asks for a narrower search instead of growing. */
const RESULT_LIMIT = 200;
/** In "everything", each part shows this many, and a link to all of them. */
const PREVIEW = 4;
/** Waits for the typing to settle before searching the seforim's text. */
const TEXT_SEARCH_DELAY_MS = 350;

/**
 * One search for everything (web: `/search`): the farbrengens, each
 * collection of the library and the seforim, at once or one of them. The
 * query matches names in both languages, the whole names the titles
 * shorten, where and when each was said - and, on the phone, the text of
 * every sefer saved on it. The filters (year, month, day, mafteiach's parsha
 * and moed) hold for all of them; the content types only for the
 * farbrengens. "Everything" shows the first few of each part, and a link to
 * all of one.
 */
export function SearchScreen({ navigation, route }: SearchScreenProps) {
  const catalog = useCatalog();
  const library = useLibrary();
  const works = useWorks();
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const progressMap = useProgressMap();
  const [scope, setScope] = useState<SearchScope>(route.params?.scope ?? 'all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hebrewYear, setHebrewYear] = useState<number | null>(null);
  const [hdateMonth, setHdateMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [parshaSlug, setParshaSlug] = useState<string | null>(null);
  const [moedSlug, setMoedSlug] = useState<string | null>(null);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [packs, setPacks] = useState<number | null>(null);
  const [textHits, setTextHits] = useState<TextHit[] | null>(null);
  const [textSearching, setTextSearching] = useState(false);

  const itemFilters: ItemFilters = { hebrewYear, hdateMonth, day, parshaSlug, moedSlug };
  const filtered = hasItemFilters(itemFilters) || types.length > 0;
  const typed = deferredQuery.trim().length >= 2;
  const inScope = (part: SearchScope) => scope === 'all' || scope === part;
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

  function chooseScope(next: SearchScope): void {
    setScope(next);
    // A year one part has may not be in the next; the content types are the farbrengens' own.
    if (next !== 'all' && next !== 'farbrengens' && next !== 'seforim' && hebrewYear != null && !collectionYears(library, next).includes(hebrewYear)) setHebrewYear(null);
    if (next !== 'all' && next !== 'farbrengens') setTypes([]);
  }

  const scopeName = (part: SearchScope): string =>
    part === 'all' ? t.searchScopeAll : part === 'farbrengens' ? t.searchScopeFarbrengens : part === 'seforim' ? t.searchScopeSeforim : t.collectionNames[part];
  const years = useMemo(
    () => (scope === 'all' || scope === 'farbrengens' || scope === 'seforim' ? browsableYears(catalog) : collectionYears(library, scope)),
    [catalog, library, scope],
  );
  const parshaOptions = useMemo(() => library.parshiyos.map((group) => ({ value: group.slug, label: occasionGroupName(group, language) })), [library, language]);
  const moedOptions = useMemo(() => library.moadim.map((group) => ({ value: group.slug, label: occasionGroupName(group, language) })), [library, language]);
  const typeOptions: Array<{ value: ContentType; label: string }> = [
    { value: 'audio', label: t.audioTypeLabel },
    { value: 'hanacha', label: t.hanachaTypeLabel },
    ...PDF_SECTION_ORDER.map((section) => ({ value: section, label: t.sectionLabels[section] })),
  ];
  const filterCount = [hebrewYear, hdateMonth, day, parshaSlug, moedSlug].filter((value) => value != null).length + types.length;
  const active = deferredQuery.trim() !== '' || filtered;
  const seforimCount = nameHits.length + (textHits?.length ?? 0);
  const total = farbrengens.length + collections.reduce((n, c) => n + c.items.length, 0) + seforimCount;
  const everything = scope === 'all';
  const limit = everything ? PREVIEW : RESULT_LIMIT;

  const sectionHeader = (part: SearchScope, count: number, first: boolean) => (
    <View style={[styles.sectionHead, { flexDirection: row(isRtl) }]}>
      <CategoryHeader first={first} style={styles.sectionTitle}>{`${scopeName(part)} · ${count}`}</CategoryHeader>
      {everything && count > PREVIEW && (
        <Pressable onPress={() => chooseScope(part)} hitSlop={8} accessibilityRole="button">
          <AppText style={[styles.showAll, { color: colors.accent }]}>{t.searchShowAll(count)}</AppText>
        </Pressable>
      )}
    </View>
  );
  const seforimLabel = (hit: { work: { title: { he: string; en: string } }; unit?: { label: string; labelEn?: string } }) =>
    hit.unit ? `${names(hit.work.title, language)} · ${language === 'en' ? (hit.unit.labelEn ?? hit.unit.label) : hit.unit.label}` : names(hit.work.title, language);
  let firstSection = true;
  const isFirst = () => {
    const was = firstSection;
    firstSection = false;
    return was;
  };

  return (
    <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title={t.searchTitle} />}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t.searchEverythingPlaceholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t.searchEverythingPlaceholder}
        returnKeyType="search"
        autoFocus={!route.params?.scope}
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.cardBg, color: colors.fg, textAlign: textAlign(isRtl) }]}
      />

      {/* Where to look: everything, or one part. */}
      <View style={[styles.pills, { flexDirection: row(isRtl) }]}>
        {SEARCH_SCOPES.map((part) => {
          const selected = scope === part;
          return (
            <Pressable
              key={part}
              onPress={() => chooseScope(part)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.pill, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : colors.cardBg }]}
            >
              <AppText style={[styles.pillLabel, { color: selected ? colors.accentFg : colors.fg }]}>{scopeName(part)}</AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.filterBar, { flexDirection: row(isRtl) }]}>
        <Pressable
          onPress={() => setFiltersOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          style={[styles.filterToggle, { flexDirection: row(isRtl), borderColor: filterCount > 0 ? colors.accent : colors.border }]}
        >
          <SlidersHorizontal size={16} color={filterCount > 0 ? colors.accent : colors.muted} />
          <AppText style={[styles.filterToggleLabel, { color: filterCount > 0 ? colors.accent : colors.fg }]}>{filterCount > 0 ? t.searchFiltersCount(filterCount) : t.searchFiltersLabel}</AppText>
        </Pressable>
        {filterCount > 0 && (
          <Pressable onPress={clearFilters} hitSlop={6} accessibilityRole="button">
            <AppText style={[styles.clearLinkText, { color: colors.muted }]}>{t.clearFiltersLabel}</AppText>
          </Pressable>
        )}
      </View>

      {filtersOpen && (
        <View style={[styles.filterPanel, { backgroundColor: colors.cardBg }]}>
          <View style={[styles.filters, { flexDirection: row(isRtl) }]}>
            <Select label={t.yearFilterLabel} value={hebrewYear} anyLabel={t.anyFilterOption} options={years.map((year) => ({ value: year, label: hebrewYearLabel(year, language) }))} onChange={setHebrewYear} />
            <Select
              label={t.monthFilterLabel}
              value={hdateMonth}
              anyLabel={t.anyFilterOption}
              options={MAFTEIACH_MONTH_OPTIONS.map((month) => ({ value: month.hdateMonth, label: language === 'he' ? month.nameHebrew : month.name }))}
              onChange={setHdateMonth}
            />
            <Select label={t.dayFilterLabel} value={day} anyLabel={t.anyFilterOption} options={DAYS.map((d) => ({ value: d, label: language === 'he' ? gematriya(d) : String(d) }))} onChange={setDay} />
            <Select label={t.parshaFilterLabel} value={parshaSlug} anyLabel={t.anyFilterOption} options={parshaOptions} onChange={setParshaSlug} />
            <Select label={t.moedFilterLabel} value={moedSlug} anyLabel={t.anyFilterOption} options={moedOptions} onChange={setMoedSlug} />
          </View>
          {(scope === 'all' || scope === 'farbrengens') && (
            <>
              <AppText style={[styles.typeLabel, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{t.searchTypesFarbrengensOnly}</AppText>
              <View style={[styles.pills, { flexDirection: row(isRtl) }]}>
                {typeOptions.map((option) => {
                  const selected = types.includes(option.value);
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => toggleType(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={[styles.pill, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : colors.bg }]}
                    >
                      <AppText style={[styles.pillLabel, { color: selected ? colors.accentFg : colors.fg }]}>{option.label}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>
      )}

      {!active && <TabHelp>{scope === 'seforim' && packs === 0 ? t.seforimSearchNoPacks : t.searchEverythingHelp}</TabHelp>}

      {active && <Subtitle style={styles.resultsCount}>{t.searchResultsCount(total)}</Subtitle>}
      {active && total === 0 && !textSearching && <GapMessage>{t.searchNothingAnywhere}</GapMessage>}

      {farbrengens.length > 0 && (
        <View>
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
              onPress={() => navigation.navigate('Farbrengen', { kind: 'search', hebrewYear: entry.hebrewYear, occasionId: entry.occasionId })}
            >
              <AppText numberOfLines={1} style={[styles.subtitle, { color: colors.muted, textAlign: textAlign(isRtl) }]}>
                {hebrewFullDateLabel(entry.hebrewDate, entry.hebrewYear, language)}
              </AppText>
            </Row>
          ))}
          {!everything && farbrengens.length > limit && <GapMessage>{t.searchShowingFirst(limit, farbrengens.length)}</GapMessage>}
        </View>
      )}

      {collections.map(({ collection, items }) =>
        items.length === 0 ? null : (
          <View key={collection}>
            {sectionHeader(collection, items.length, isFirst())}
            {items.slice(0, limit).map((item) => {
              const subtitle = itemSubtitle(collection, item, language);
              return (
                <Row key={item.id} label={itemTitle(collection, item, language)} marquee onPress={() => navigation.navigate('LibraryItem', { collection, id: item.id })}>
                  {subtitle ? (
                    <AppText numberOfLines={2} style={[styles.subtitle, { color: colors.muted, textAlign: textAlign(isRtl) }]}>
                      {subtitle}
                    </AppText>
                  ) : null}
                </Row>
              );
            })}
            {!everything && items.length > limit && <GapMessage>{t.searchShowingFirst(limit, items.length)}</GapMessage>}
          </View>
        ),
      )}

      {seforimCount > 0 || (seforimOpen && typed && textSearching) ? (
        <View>
          {sectionHeader('seforim', seforimCount, isFirst())}
          {(textSearching || (textHits?.length ?? 0) > 0) && <AppText style={[styles.typeLabel, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{t.seforimSearchText}</AppText>}
          {textSearching && textHits === null && <Spinner size={18} color={colors.accent} />}
          {textHits?.slice(0, limit).map((hit) => (
            <Row key={`${hit.work.id}/${hit.unit.id}@${hit.source}`} label={seforimLabel(hit)} onPress={() => navigation.navigate('Reader', { workId: hit.work.id, unitId: hit.unit.id, source: hit.source })}>
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
              onPress={() => (hit.unit ? navigation.navigate('Reader', { workId: hit.work.id, unitId: hit.unit.id }) : navigation.navigate('Work', { workId: hit.work.id }))}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.search-input` - padding 12px 14px, margin-bottom 12, 1px border, radius 10, 16px. */
  input: { paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderRadius: 10, fontSize: 16, fontFamily: FONT_FAMILY },
  /** Web: `.search-filters` - wrap, gap 10. */
  filters: { flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  typeLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.72, marginBottom: 8 },
  /** Web: `.search-pills` - wrap, gap 6, margin-bottom 12. */
  pills: { flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 },
  pillLabel: { fontSize: 14, fontWeight: '600' },
  filterBar: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  filterToggle: { alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 },
  filterToggleLabel: { fontSize: 14, fontWeight: '600' },
  filterPanel: { borderRadius: 14, padding: 12, paddingBottom: 0, marginBottom: 16 },
  clearLinkText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  resultsCount: { marginBottom: 4 },
  sectionHead: { alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { flexShrink: 1 },
  showAll: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 19 },
  snippet: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  namesLabel: { marginTop: 12 },
});
