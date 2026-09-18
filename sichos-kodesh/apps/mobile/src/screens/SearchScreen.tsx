import React, { useDeferredValue, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { searchOccasions } from '@sichos-kodesh/app-core';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { useTranslation } from '../i18n/useTranslation';
import type { SearchScreenProps } from '../navigation/types';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SectionLabel } from '../ui/SectionLabel';
import { colors, spacing } from '../ui/theme';

function resultSummary(entry: CatalogEntry, t: ReturnType<typeof useTranslation>['t']): string {
  const parts: string[] = [];
  if (entry.audio.length > 0) parts.push(t.recordingsCount(entry.audio.length));
  if (entry.pdfs.length > 0) parts.push(t.pdfCount(entry.pdfs.length));
  return parts.join(' • ');
}

export function SearchScreen({ navigation }: SearchScreenProps) {
  const { t, isRtl } = useTranslation();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => searchOccasions(catalog, { query: deferredQuery, hebrewYear: null, hdateMonth: null, day: null, parsha: null, specialDay: null, types: [] }), [deferredQuery]);
  const totalResults = useMemo(() => results.reduce((count, group) => count + group.entries.length, 0), [results]);
  const trimmedQuery = query.trim();

  return (
    <Screen>
      <ScreenHeader title={t.searchTitle} onBack={() => navigation.goBack()} backLabel={t.back} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <AppText variant="bodySmall" color="muted" style={[styles.help, isRtl && styles.textRight]}>
          {t.searchHelp}
        </AppText>

        <Card style={styles.inputCard}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t.searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, isRtl && styles.inputRtl]}
          />
        </Card>

        {trimmedQuery ? (
          <AppButton
            label={t.clearFiltersLabel}
            variant="ghost"
            style={[styles.clearButton, isRtl && styles.clearButtonRtl]}
            onPress={() => setQuery('')}
          />
        ) : null}

        {trimmedQuery ? (
          <>
            <SectionLabel label={t.searchResultsCount(totalResults)} />
            {results.length === 0 ? (
              <EmptyState title={t.noSearchResults} />
            ) : (
              results.map(({ hebrewYear, entries }) => (
                <View key={hebrewYear} style={styles.group}>
                    <SectionLabel label={t.hebrewYearTitle(hebrewYear)} />
                  <Card style={styles.groupCard}>
                    {entries.map((entry, index) => (
                      <React.Fragment key={`${entry.hebrewYear}-${entry.occasionId}`}>
                        {index > 0 ? <RowSeparator /> : null}
                        <ListRow
                          label={entry.occasionLabel}
                          sublabel={resultSummary(entry, t)}
                          right={<AppText color="muted">›</AppText>}
                          onPress={() => navigation.navigate('YearBrowser', { hebrewYear: entry.hebrewYear, initialOccasionId: entry.occasionId })}
                        />
                      </React.Fragment>
                    ))}
                  </Card>
                </View>
              ))
            )}
          </>
        ) : (
          <EmptyState title={t.searchTitle} body={t.searchPromptBody} />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  help: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, lineHeight: 20 },
  textRight: { textAlign: 'right' },
  inputCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  input: {
    color: colors.textDefault,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  inputRtl: { textAlign: 'right' },
  clearButton: { alignSelf: 'flex-start', marginLeft: spacing.lg, marginTop: spacing.sm },
  clearButtonRtl: { alignSelf: 'flex-end', marginLeft: 0, marginRight: spacing.lg },
  group: { marginTop: spacing.sm },
  groupCard: { backgroundColor: colors.backgroundElevated, paddingVertical: 0, paddingHorizontal: 0 },
});
