import React, { useMemo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import type { CatalogUnit, CatalogWorkSource, LibraryCollectionId } from '@sichos-kodesh/catalog';
import { LIBRARY_COLLECTION_IDS, catalogUnit } from '@sichos-kodesh/catalog';
import { editionUrl } from '@sichos-kodesh/sefaria-index/reader';
import { getWorkContents, useWorks } from '../../catalog/catalogStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { WorkScreenProps } from '../../navigation/types';
import { contentsAt, names, unitCount, workKind } from '@sichos-kodesh/app-core';
import { useReadingState } from '../../seforim/readingState';
import { Button } from '../../ui/Button';
import { CategoryRow } from '../../ui/CategoryRow';
import { EmptyState } from '../../ui/EmptyState';
import { Row, RowDistance, RowTrailing } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { SaveSeferPanel } from './SaveSeferPanel';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { AppText } from '../../ui/Text';
import { CategoryHeader, Subtitle, TabHelp } from '../../ui/Typography';
import { useColors } from '../../ui/theme';

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

/**
 * One sefer: who wrote it, its editions and where each may be read, where
 * the reader left off, and its contents - a part at a time, down to the
 * chapters that open in the reader.
 */
export function WorkScreen({ navigation, route }: WorkScreenProps) {
  const works = useWorks();
  const reading = useReadingState();
  const { t, language } = useTranslation();
  const colors = useColors();
  const { workId } = route.params;
  const path = route.params.path ?? [];
  const work = works.works.find((w) => w.id === workId);
  const contents = useMemo(() => (work?.units ? getWorkContents(workId) : null), [work, workId]);
  const unitsById = useMemo(() => new Map((contents?.units ?? []).map((unit) => [unit.id, unit])), [contents]);

  const back = path.length > 0 ? ({ name: 'Work', params: { workId, path: path.slice(0, -1) } } as const) : ({ name: 'Seforim', params: undefined } as const);
  if (!work) {
    return (
      <Screen header={<ScreenHeader back={{ name: 'Seforim', params: undefined }} title={t.seforimTitle} />}>
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

  // A sefer that reads here opens on its chapters; its editions come after them.
  const editions =
    work.sources.length > 0 && kind !== 'collection' ? (
      <>
        <CategoryHeader>{t.workSources}</CategoryHeader>
        {work.sources.map((source, index) => {
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

  return (
    <Screen header={<ScreenHeader back={back} title={title} />}>
      {path.length === 0 && (
        <>
          <AppText style={styles.title}>{names(work.title, language)}</AppText>
          {authorNames.length > 0 && <Subtitle>{authorNames.join(', ')}</Subtitle>}
          {kind === 'read' && contents && <SaveSeferPanel work={work} contents={contents} />}
          {kind === 'links' && <TabHelp>{t.workNoText}</TabHelp>}
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
                    <RowDistance standalone={false}>{t.workPartOf(unitCount(entry))}</RowDistance>
                  </RowTrailing>
                }
                onPress={() => navigation.push('Work', { workId, path: [...path, index] })}
              />
            ),
          )}
        </>
      )}

      {kind === 'read' && path.length === 0 && editions}
    </Screen>
  );
}

function unitDisplay(unit: CatalogUnit | undefined, unitId: string, language: 'he' | 'en'): string {
  if (!unit) return unitId;
  return language === 'en' ? (unit.labelEn ?? unit.label) : unit.label;
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32, marginBottom: 4 },
  block: { marginTop: 10 },
  sourceLine: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
