import React, { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { gematriya } from '@hebcal/core';
import { MAFTEIACH_MONTH_OPTIONS, PDF_SECTION_ORDER, browsableYears } from '@sichos-kodesh/catalog';
import type { LibraryCollectionId } from '@sichos-kodesh/catalog';
import { collectionYears, hasActiveFilters, itemSubtitle, LIBRARY_ORDER, occasionFilter, occasionGroupName, occasionTitle, searchLibrary, searchOccasions } from '@sichos-kodesh/app-core';
import type { ContentType, SearchFilters } from '@sichos-kodesh/app-core';
import { useCatalog, useLibrary } from '../catalog/catalogStore';
import { OccasionRowIcon } from '../components/OccasionRowIcon';
import { useTranslation } from '../i18n/useTranslation';
import type { SearchScreenProps } from '../navigation/types';
import { useProgressMap } from '../player/useProgressMap';
import { hebrewYearLabel } from '../utils/formatHebrewDate';
import { Row, RowTrailing } from '../ui/Row';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Select } from '../ui/Select';
import { AppText } from '../ui/Text';
import { CategoryHeader, GapMessage, Subtitle, TabHelp } from '../ui/Typography';
import { FONT_FAMILY, useColors } from '../ui/theme';
import { row, textAlign } from '../ui/rtl';

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
/** A collection's results render as plain rows; past this many, the list asks for a narrower search instead of growing. */
const LIBRARY_RESULT_LIMIT = 200;

/**
 * Free-text search plus filters (year, month, day, parsha, moed, content
 * type) over the whole bundled catalog (web: `/search`). The parsha and moed
 * lists are mafteiach's own (the library's parshiyos and moadim), so a
 * choice finds exactly the farbrengens mafteiach files there. "Search in"
 * switches to one library collection, searched by name and by where and
 * when each item was said.
 */
export function SearchScreen({ navigation }: SearchScreenProps) {
  const catalog = useCatalog();
  const library = useLibrary();
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const progressMap = useProgressMap();
  const [collection, setCollection] = useState<LibraryCollectionId | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [hebrewYear, setHebrewYear] = useState<number | null>(null);
  const [hdateMonth, setHdateMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [parshaSlug, setParshaSlug] = useState<string | null>(null);
  const [moedSlug, setMoedSlug] = useState<string | null>(null);
  const [types, setTypes] = useState<ContentType[]>([]);

  const occasionIds = useMemo(
    () => occasionFilter([library.parshiyos.find((g) => g.slug === parshaSlug), library.moadim.find((g) => g.slug === moedSlug)]),
    [library, parshaSlug, moedSlug],
  );
  const filters: SearchFilters = { query: deferredQuery, hebrewYear, hdateMonth, day, parsha: null, specialDay: null, types, occasionIds };
  const results = useMemo(
    () => (collection ? [] : searchOccasions(catalog, { query: deferredQuery, hebrewYear, hdateMonth, day, parsha: null, specialDay: null, types, occasionIds })),
    [catalog, collection, deferredQuery, hebrewYear, hdateMonth, day, types, occasionIds],
  );
  const items = useMemo(() => (collection ? searchLibrary(library, collection, deferredQuery, hebrewYear) : []), [library, collection, deferredQuery, hebrewYear]);
  const years = useMemo(() => (collection ? collectionYears(library, collection) : browsableYears(catalog)), [catalog, library, collection]);
  const parshaOptions = useMemo(() => library.parshiyos.map((group) => ({ value: group.slug, label: occasionGroupName(group, language) })), [library, language]);
  const moedOptions = useMemo(() => library.moadim.map((group) => ({ value: group.slug, label: occasionGroupName(group, language) })), [library, language]);

  function toggleType(type: ContentType): void {
    setTypes((prev) => (prev.includes(type) ? prev.filter((t2) => t2 !== type) : [...prev, type]));
  }

  function clearFilters(): void {
    setQuery('');
    setHebrewYear(null);
    setHdateMonth(null);
    setDay(null);
    setParshaSlug(null);
    setMoedSlug(null);
    setTypes([]);
  }

  function chooseCollection(next: LibraryCollectionId | null): void {
    setCollection(next);
    // A year one collection has may not exist in the next one.
    setHebrewYear(null);
  }

  const typeOptions: Array<{ value: ContentType; label: string }> = [
    { value: 'audio', label: t.audioTypeLabel },
    { value: 'hanacha', label: t.hanachaTypeLabel },
    ...PDF_SECTION_ORDER.map((section) => ({ value: section, label: t.sectionLabels[section] })),
  ];
  const active = collection ? query.trim() !== '' || hebrewYear != null : hasActiveFilters(filters);
  const yearSelect = (
    <Select label={t.yearFilterLabel} value={hebrewYear} anyLabel={t.anyFilterOption} options={years.map((year) => ({ value: year, label: hebrewYearLabel(year, language) }))} onChange={setHebrewYear} />
  );

  return (
    <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title={t.searchTitle} />}>
      <TabHelp>{collection ? t.searchLibraryHelp : t.searchHelp}</TabHelp>

      <View style={[styles.filters, { flexDirection: row(isRtl) }]}>
        <Select
          label={t.searchInLabel}
          value={collection}
          anyLabel={t.searchInFarbrengens}
          options={LIBRARY_ORDER.map((id) => ({ value: id, label: t.collectionNames[id] }))}
          onChange={chooseCollection}
        />
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={collection ? t.searchLibraryPlaceholder : t.searchPlaceholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={collection ? t.searchLibraryPlaceholder : t.searchPlaceholder}
        returnKeyType="search"
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.cardBg, color: colors.fg, textAlign: textAlign(isRtl) }]}
      />

      {collection ? (
        <View style={[styles.filters, { flexDirection: row(isRtl) }]}>{yearSelect}</View>
      ) : (
        <>
          <View style={[styles.filters, { flexDirection: row(isRtl) }]}>
            {yearSelect}
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

          <AppText style={[styles.typeLabel, { color: colors.muted }]}>{t.typeFilterLabel}</AppText>
          <View style={[styles.pills, { flexDirection: row(isRtl) }]}>
            {typeOptions.map((option) => {
              const selected = types.includes(option.value);
              return (
                <Pressable
                  key={option.value}
                  onPress={() => toggleType(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.pill, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : colors.cardBg }]}
                >
                  <AppText style={[styles.pillLabel, { color: selected ? colors.accentFg : colors.fg }]}>{option.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {active && (
        <Pressable onPress={clearFilters} hitSlop={6} accessibilityRole="button" style={styles.clearLink}>
          <AppText style={[styles.clearLinkText, { color: colors.muted }]}>{t.clearFiltersLabel}</AppText>
        </Pressable>
      )}

      {active && collection && (
        <>
          <Subtitle style={styles.resultsCount}>{t.searchResultsCount(items.length)}</Subtitle>
          {items.length === 0 && <GapMessage>{t.noLibraryResults}</GapMessage>}
          {items.slice(0, LIBRARY_RESULT_LIMIT).map((item) => {
            const subtitle = itemSubtitle(collection, item, language);
            return (
              <Row key={item.id} label={item.label} marquee onPress={() => navigation.navigate('LibraryItem', { collection, id: item.id })}>
                {subtitle ? (
                  <AppText numberOfLines={2} style={[styles.subtitle, { color: colors.muted }]}>
                    {subtitle}
                  </AppText>
                ) : null}
              </Row>
            );
          })}
          {items.length > LIBRARY_RESULT_LIMIT && <GapMessage>{t.searchShowingFirst(LIBRARY_RESULT_LIMIT, items.length)}</GapMessage>}
        </>
      )}

      {active && !collection && (
        <>
          <Subtitle style={styles.resultsCount}>{t.searchResultsCount(results.reduce((n, g) => n + g.entries.length, 0))}</Subtitle>
          {results.length === 0 && <GapMessage>{t.noSearchResults}</GapMessage>}
          {results.map(({ hebrewYear: year, entries }) => (
            <View key={year}>
              <CategoryHeader>{hebrewYearLabel(year, language)}</CategoryHeader>
              {entries.map((entry) => (
                <Row
                  key={entry.occasionId}
                  label={occasionTitle(entry, language)}
                  trailing={
                    <RowTrailing>
                      <OccasionRowIcon entry={entry} progressMap={progressMap} />
                    </RowTrailing>
                  }
                  onPress={() => navigation.navigate('Farbrengen', { kind: 'search', hebrewYear: year, occasionId: entry.occasionId })}
                />
              ))}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** Web: `.search-input` - padding 12px 14px, margin-bottom 16, 1px border, radius 10, 16px. */
  input: { paddingVertical: 12, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderRadius: 10, fontSize: 16, fontFamily: FONT_FAMILY },
  /** Web: `.search-filters` - wrap, gap 10, margin-bottom 16. */
  filters: { flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  typeLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.72, marginBottom: 8 },
  /** Web: `.search-type-pills` - wrap, gap 8, margin-bottom 16. */
  pills: { flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderRadius: 999 },
  pillLabel: { fontSize: 14, fontWeight: '600' },
  clearLink: { alignSelf: 'flex-start', marginBottom: 16 },
  clearLinkText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  resultsCount: { marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 19 },
});
