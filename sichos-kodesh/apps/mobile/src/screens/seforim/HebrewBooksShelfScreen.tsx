import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, TextInput } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import type { CatalogScan } from '@sichos-kodesh/catalog';
import { authorShelf, hebrewBooksUrl, names, scanLabel, searchShelf, sharedLabels } from '@sichos-kodesh/app-core';
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
 * their own screens. Headed by the author's name alone (the help line says
 * HebrewBooks), so the title fits instead of trailing off after a letter;
 * each book is one line, its name and its pages (ScanRow).
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

  if (seriesIndex !== undefined) {
    const shared = sharedLabels((one?.scans ?? []).map(scanLabel));
    return (
      <Screen header={<ScreenHeader back={{ name: 'HebrewBooksShelf', params: { authorId } }} title={one?.title ?? authorName} />}>
        {one ? one.scans.map((scan) => <ScanRow key={scan.id} scan={scan} label={scanLabel(scan)} printed={shared.has(scanLabel(scan))} />) : <EmptyState text={t.seforimSearchNothing} />}
        <TabHelp>{t.shelfCredit}</TabHelp>
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader back={{ name: 'Seforim', params: { shelf: 'links' } }} title={authorName} />}>
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
          <ScanRow key={series.title} scan={series.scans[0]!} label={series.scans[0]!.title} />
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

/**
 * One book, opening on its page at hebrewbooks.org: its name, and its pages
 * beside the link. Where it was printed only with `printed`, for the rows
 * whose name alone doesn't tell them apart (sharedLabels).
 */
export function ScanRow({ scan, label, printed = false }: { scan: CatalogScan; label: string; printed?: boolean }) {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <Row
      label={label}
      trailing={
        <RowTrailing>
          {scan.pages ? <RowDistance standalone={false}>{t.shelfPages(scan.pages)}</RowDistance> : null}
          <ExternalLink size={16} color={colors.muted} />
        </RowTrailing>
      }
      onPress={() => Linking.openURL(hebrewBooksUrl(scan.id)).catch(() => undefined)}
    >
      {printed && scan.printed ? (
        <AppText numberOfLines={1} style={[styles.details, { color: colors.muted }]}>
          {scan.printed}
        </AppText>
      ) : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  input: { paddingVertical: 12, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderRadius: 10, fontSize: 16, fontFamily: FONT_FAMILY },
  details: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
