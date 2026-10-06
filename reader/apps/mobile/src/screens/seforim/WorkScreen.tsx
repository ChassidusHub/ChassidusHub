import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import type { CatalogScan, CatalogUnit, CatalogWorkSource, LibraryCollectionId } from '@chassidushub-reader/catalog';
import { LIBRARY_COLLECTION_IDS, catalogUnit } from '@chassidushub-reader/catalog';
import { editionUrl } from '@chassidushub-reader/sefaria-index/reader';
import { getWorkContents, useShelf, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { WorkScreenProps } from '../../navigation/types';
import { HOME_WORK_IDS, contentsAt, names, sharedLabels, unitCount, unitsAreLetters, workKind, workScans } from '@chassidushub-reader/app-core';
import { useReadingState } from '../../seforim/readingState';
import { Button } from '../../ui/Button';
import { CategoryRow } from '../../ui/CategoryRow';
import { EmptyState } from '../../ui/EmptyState';
import { Row, RowDistance, RowTrailing } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { SaveSeferPanel } from './SaveSeferPanel';
import { ScanRow } from './HebrewBooksShelfScreen';
import { FixLinks } from '../../components/FixLinks';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { AppText } from '../../ui/Text';
import { CategoryHeader, Subtitle, TabHelp } from '../../ui/Typography';
import { DISPLAY_FONT, useColors } from '../../ui/theme';

type Translation = ReturnType<typeof useTranslation>['t'];

const LICENCE_NAMES: Readonly<Record<string, string>> = {
  'public-domain': 'Public domain',
  cc0: 'CC0',
  'cc-by': 'CC BY',
  'cc-by-nc': 'CC BY-NC',
};

function sourceLine(t: Translation, source: CatalogWorkSource): string {
  const language = source.language ? t.editionLanguages[source.language] : null;
  const licence = LICENCE_NAMES[source.licence];
  return [language, source.credit ?? source.version, licence].filter(Boolean).join(' · ');
}

const SOURCE_NAMES: Readonly<Record<string, string>> = { sefaria: 'Sefaria', chabadlibrary: 'chabadlibrary.org', hebrewbooks: 'HebrewBooks' };

/** How many scans show before "show all". */
const SCANS_SHOWN = 10;

/**
 * One sefer: who wrote it, its editions and where each may be read, where
 * the reader left off, and its contents - a part at a time, down to the
 * chapters that open in the reader - and its scans on HebrewBooks.
 */
export function WorkScreen({ navigation, route }: WorkScreenProps) {
  const works = useWorks();
  const shelf = useShelf();
  const reading = useReadingState();
  const { t, language } = useTranslation();
  const colors = useColors();
  const [allScans, setAllScans] = useState(false);
  const { workId } = route.params;
  const path = route.params.path ?? [];
  const work = works.works.find((w) => w.id === workId);
  const contents = useMemo(() => (work?.units ? getWorkContents(workId) : null), [work, workId]);
  const unitsById = useMemo(() => new Map((contents?.units ?? []).map((unit) => [unit.id, unit])), [contents]);
  const scanSeries = useMemo(() => workScans(shelf, workId), [shelf, workId]);

  // Up a part, else to its Rebbe's seforim - or the shelf, for the Rebbe's own seforim that stand on it.
  const rebbe = work && !HOME_WORK_IDS.includes(work.id) ? (work.authors.find((id) => works.authors.some((author) => author.id === id)) ?? null) : undefined;
  const back =
    path.length > 0
      ? ({ name: 'Work', params: { workId, path: path.slice(0, -1) } } as const)
      : rebbe !== undefined
        ? ({ name: 'Rebbe', params: { authorId: rebbe } } as const)
        : ({ name: 'Library', params: undefined } as const);
  if (!work) {
    return (
      <Screen header={<ScreenHeader back={{ name: 'Library', params: undefined }} title={t.seforimTitle} />}>
        <EmptyState text={t.workNotFound} />
      </Screen>
    );
  }

  const kind = workKind(work);
  const part = contents ? contentsAt(contents, path) : null;
  const trail = part?.trail ?? [];
  const title = trail.length > 0 ? names(trail[trail.length - 1]!.title, language) : names(work.title, language);
  const authorNames = work.authors.map((id) => works.authors.find((a) => a.id === id)).filter((a) => !!a).map((a) => names(a!.name, language));
  const place = reading.places[workId];
  const placeUnit = place && contents ? catalogUnit(contents, place.unitId) : undefined;
  // Inside a part, a chapter's label without the part's own names in front.
  const prefix = trail.map((node) => `${names(node.title, language)}, `).join('');
  const unitLabel = (label: string) => (prefix && label.startsWith(prefix) ? label.slice(prefix.length) : label);
  const collection = work.collection && (LIBRARY_COLLECTION_IDS as readonly string[]).includes(work.collection) ? (work.collection as LibraryCollectionId) : null;
  const linkSources = work.sources.filter((s) => editionUrl({ source: s.source as 'sefaria', sourceId: s.sourceId, language: s.language, version: s.version }));
  // HebrewBooks' copy is its scans, listed below on their own.
  const shownSources = work.sources.filter((s) => s.source !== 'hebrewbooks');

  // A sefer that reads here opens on its chapters; its editions come after them.
  const editions =
    shownSources.length > 0 && kind !== 'collection' ? (
      <>
        <CategoryHeader>{t.workSources}</CategoryHeader>
        {shownSources.map((source, index) => {
          const url = linkSources.includes(source) ? editionUrl({ source: source.source as 'sefaria', sourceId: source.sourceId, language: source.language, version: source.version }) : null;
          return (
            <Row
              key={`${index}-${source.source}-${source.version ?? ''}`}
              label={SOURCE_NAMES[source.source] ?? source.source}
              muted={!url}
              trailing={url ? <RowTrailing><ExternalLink size={16} color={colors.muted} /></RowTrailing> : undefined}
              onPress={url ? () => Linking.openURL(url).catch(() => undefined) : undefined}
            >
              <AppText style={[styles.sourceLine, { color: colors.muted }]}>{sourceLine(t, source)}</AppText>
            </Row>
          );
        })}
      </>
    ) : null;

  // Its scans on HebrewBooks, each opening on its page there.
  const scans = scanSeries.flatMap((series) => series.scans.map((scan) => ({ scan, label: scanTitle(scan, series.title, scanSeries.length > 1) })));
  const sharedScanLabels = sharedLabels(scans.map(({ label }) => label));
  const scanRows =
    scans.length > 0 ? (
      <>
        <CategoryHeader>{t.workScans}</CategoryHeader>
        {(allScans ? scans : scans.slice(0, SCANS_SHOWN)).map(({ scan, label }) => (
          <ScanRow key={scan.id} scan={scan} label={label} printed={sharedScanLabels.has(label)} />
        ))}
        {!allScans && scans.length > SCANS_SHOWN && <Row label={t.workScansAll(scans.length)} onPress={() => setAllScans(true)} />}
      </>
    ) : null;

  return (
    <Screen header={<ScreenHeader back={back} title={title} />}>
      {path.length === 0 && (
        <>
          <AppText style={styles.title}>{names(work.title, language)}</AppText>
          {authorNames.length > 0 && <Subtitle>{authorNames.join(', ')}</Subtitle>}
          {kind === 'read' && contents && <SaveSeferPanel work={work} contents={contents} />}
          {kind === 'links' && <TabHelp>{scans.length > 0 && linkSources.length === 0 ? t.workNoTextScans : t.workNoText}</TabHelp>}
          {collection && (
            <View style={styles.block}>
              <Button label={t.workOpenCollection} onPress={() => navigation.navigate('LibraryCollection', { collection })} />
            </View>
          )}
          {place && placeUnit && (
            <View style={styles.block}>
              <CategoryRow
                label={t.seforimContinue}
                count={language === 'en' ? (placeUnit.labelEn ?? placeUnit.label) : placeUnit.label}
                onPress={() => navigation.navigate('Reader', { workId, unitId: place.unitId, source: place.source })}
              />
            </View>
          )}
          {kind !== 'read' && editions}
          {kind !== 'read' && scanRows}
        </>
      )}

      {part && (
        <>
          {path.length === 0 && part.entries.length > 0 && <CategoryHeader>{names(work.title, language)}</CategoryHeader>}
          {part.entries.map((entry, index) =>
            'unitId' in entry ? (
              <Row
                key={entry.unitId}
                label={unitLabel(unitDisplay(unitsById.get(entry.unitId), entry.unitId, language))}
                selected={place?.unitId === entry.unitId}
                onPress={() => navigation.navigate('Reader', { workId, unitId: entry.unitId })}
              />
            ) : (
              <Row
                key={`part-${index}`}
                label={names(entry.title, language)}
                trailing={
                  <RowTrailing>
                    <RowDistance standalone={false}>{t.workPartOf(unitCount(entry), unitsAreLetters(work))}</RowDistance>
                  </RowTrailing>
                }
                onPress={() => navigation.push('Work', { workId, path: [...path, index] })}
              />
            ),
          )}
        </>
      )}

      {kind === 'read' && path.length === 0 && editions}
      {kind === 'read' && path.length === 0 && scanRows}

      {path.length === 0 && <FixLinks target={{ work: workId }} />}
    </Screen>
  );
}

/** A scan's name on a sefer's screen: its volume, with the series when the sefer has several. */
function scanTitle(scan: CatalogScan, series: string, severalSeries: boolean): string {
  if (!scan.volume) return scan.title;
  return severalSeries ? `${series} · ${scan.volume}` : scan.volume;
}

function unitDisplay(unit: CatalogUnit | undefined, unitId: string, language: 'he' | 'en'): string {
  if (!unit) return unitId;
  return language === 'en' ? (unit.labelEn ?? unit.label) : unit.label;
}

const styles = StyleSheet.create({
  title: { fontFamily: DISPLAY_FONT, fontSize: 24, fontWeight: '700', lineHeight: 32, marginBottom: 4 },
  block: { marginTop: 10 },
  sourceLine: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
