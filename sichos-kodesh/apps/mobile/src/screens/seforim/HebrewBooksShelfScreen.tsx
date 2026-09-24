import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, TextInput } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import type { CatalogScan } from '@sichos-kodesh/catalog';
import { authorShelf, hebrewBooksUrl, names, scanLabel, searchShelf } from '@sichos-kodesh/app-core';
import { useShelf, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { HebrewBooksShelfScreenProps } from '../../navigation/types';
import { EmptyState } from '../../ui/EmptyState';
import { Row, RowDistance, RowTrailing } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { AppText } from '../../ui/Text';
import { TabHelp } from '../../ui/Typography';
import { FONT_FAMILY, useColors } from '../../ui/theme';
import { textAlign } from '../../ui/rtl';

/** Only a long list gets a filter. */
const FILTER_FROM = 12;

/**
 * An author's books on HebrewBooks that no sefer here holds, or the Chabad
 * books by anyone else: series by series, each book opening on its page at
 * hebrewbooks.org. The seforim the catalog knows list their own scans on
 * their own screens.
 */
export function HebrewBooksShelfScreen({ navigation, route }: HebrewBooksShelfScreenProps) {
  const shelf = useShelf();
  const works = useWorks();
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const { authorId, series: seriesIndex } = route.params;
  const [query, setQuery] = useState('');
  const all = useMemo(() => authorShelf(shelf, authorId), [shelf, authorId]);
  const shown = useMemo(() => searchShelf(all, query), [all, query]);
  const author = works.authors.find((a) => a.id === authorId);
  const authorName = author ? names(author.name, language) : t.shelfOthers;
  const one = seriesIndex !== undefined ? all[seriesIndex] : undefined;

  const open = (scan: CatalogScan) => {
    Linking.openURL(hebrewBooksUrl(scan.id)).catch(() => undefined);
  };
  const details = (scan: CatalogScan) => [scan.pages ? t.shelfPages(scan.pages) : null, scan.printed].filter(Boolean).join(' · ');
  const link = <ExternalLink size={16} color={colors.muted} />;

  const scanRow = (scan: CatalogScan, label: string) => (
    <Row key={scan.id} label={label} trailing={<RowTrailing>{link}</RowTrailing>} onPress={() => open(scan)}>
      {details(scan) ? <AppText style={[styles.details, { color: colors.muted }]}>{details(scan)}</AppText> : null}
    </Row>
  );

  if (seriesIndex !== undefined) {
    return (
      <Screen header={<ScreenHeader back={{ name: 'HebrewBooksShelf', params: { authorId } }} title={one?.title ?? t.shelfTitle(authorName)} />}>
        {one ? one.scans.map((scan) => scanRow(scan, scanLabel(scan))) : <EmptyState text={t.seforimSearchNothing} />}
        <TabHelp>{t.shelfCredit}</TabHelp>
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader back={{ name: 'Seforim', params: undefined }} title={t.shelfTitle(authorName)} />}>
      <TabHelp>{t.shelfHelp}</TabHelp>
      {all.length >= FILTER_FROM && (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t.shelfFilter}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t.shelfFilter}
          returnKeyType="search"
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.cardBg, color: colors.fg, textAlign: textAlign(isRtl) }]}
        />
      )}
      {shown.map((series) =>
        series.scans.length === 1 ? (
          scanRow(series.scans[0]!, series.scans[0]!.title)
        ) : (
          <Row
            key={series.title}
            label={series.title}
            trailing={
              <RowTrailing>
                <RowDistance standalone={false}>{t.shelfBooks(series.scans.length)}</RowDistance>
              </RowTrailing>
            }
            onPress={() => navigation.push('HebrewBooksShelf', { authorId, series: all.findIndex((s) => s.title === series.title) })}
          />
        ),
      )}
      {shown.length === 0 && <EmptyState text={t.seforimSearchNothing} />}
      <TabHelp>{t.shelfCredit}</TabHelp>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { paddingVertical: 12, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderRadius: 10, fontSize: 16, fontFamily: FONT_FAMILY },
  details: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
