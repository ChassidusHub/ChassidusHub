import React, { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { gematriya } from '@hebcal/core';
import { MAFTEIACH_MONTH_OPTIONS, PDF_SECTION_ORDER, browsableYears } from '@sichos-kodesh/catalog';
import { chagOptions, hasActiveFilters, isChagCategory, parshaOptions, searchOccasions, specialDayOptions } from '@sichos-kodesh/app-core';
import type { ContentType, SearchFilters } from '@sichos-kodesh/app-core';
import catalog from '../catalog/data';
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

/** Free-text search plus filters (year, month, day, parsha, chag, special day, content type) over the whole bundled catalog (web: `/search`). */
export function SearchScreen({ navigation }: SearchScreenProps) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const progressMap = useProgressMap();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [hebrewYear, setHebrewYear] = useState<number | null>(null);
  const [hdateMonth, setHdateMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [parsha, setParsha] = useState<string | null>(null);
  const [specialDay, setSpecialDay] = useState<string | null>(null);
  const [types, setTypes] = useState<ContentType[]>([]);

  const filters: SearchFilters = { query: deferredQuery, hebrewYear, hdateMonth, day, parsha, specialDay, types };
  const results = useMemo(
    () => searchOccasions(catalog, { query: deferredQuery, hebrewYear, hdateMonth, day, parsha, specialDay, types }),
    [deferredQuery, hebrewYear, hdateMonth, day, parsha, specialDay, types],
  );
  const years = useMemo(() => browsableYears(catalog), []);
  const parshas = useMemo(() => parshaOptions(language), [language]);
  const chagim = useMemo(() => chagOptions(language), [language]);
  const specialDays = useMemo(() => specialDayOptions(language), [language]);

  function toggleType(type: ContentType): void {
    setTypes((prev) => (prev.includes(type) ? prev.filter((t2) => t2 !== type) : [...prev, type]));
  }

  function clearFilters(): void {
    setQuery('');
    setHebrewYear(null);
    setHdateMonth(null);
    setDay(null);
    setParsha(null);
    setSpecialDay(null);
    setTypes([]);
  }

  const typeOptions: Array<{ value: ContentType; label: string }> = [
    { value: 'audio', label: t.audioTypeLabel },
    { value: 'hanacha', label: t.hanachaTypeLabel },
    ...PDF_SECTION_ORDER.map((section) => ({ value: section, label: t.sectionLabels[section] })),
  ];
  const active = hasActiveFilters(filters);

  return (
    <Screen header={<ScreenHeader back={{ name: 'Home', params: undefined }} title={t.searchTitle} />}>
      <TabHelp>{t.searchHelp}</TabHelp>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t.searchPlaceholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t.searchPlaceholder}
        returnKeyType="search"
        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.cardBg, color: colors.fg, textAlign: textAlign(isRtl) }]}
      />

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
        <Select label={t.parshaFilterLabel} value={parsha && !isChagCategory(parsha) ? parsha : null} anyLabel={t.anyFilterOption} options={parshas} onChange={setParsha} />
        <Select label={t.chagOptgroupLabel} value={parsha && isChagCategory(parsha) ? parsha : null} anyLabel={t.anyFilterOption} options={chagim} onChange={setParsha} />
        <Select label={t.specialDayFilterLabel} value={specialDay} anyLabel={t.anyFilterOption} options={specialDays} onChange={setSpecialDay} />
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

      {active && (
        <Pressable onPress={clearFilters} hitSlop={6} accessibilityRole="button" style={styles.clearLink}>
          <AppText style={[styles.clearLinkText, { color: colors.muted }]}>{t.clearFiltersLabel}</AppText>
        </Pressable>
      )}

      {active && (
        <>
          <Subtitle style={styles.resultsCount}>{t.searchResultsCount(results.reduce((n, g) => n + g.entries.length, 0))}</Subtitle>
          {results.length === 0 && <GapMessage>{t.noSearchResults}</GapMessage>}
          {results.map(({ hebrewYear: year, entries }) => (
            <View key={year}>
              <CategoryHeader>{hebrewYearLabel(year, language)}</CategoryHeader>
              {entries.map((entry) => (
                <Row
                  key={entry.occasionId}
                  label={entry.occasionLabel}
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
});
