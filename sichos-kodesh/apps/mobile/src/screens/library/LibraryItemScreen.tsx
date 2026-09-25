import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import type { CatalogRef, LibraryItemBase } from '@sichos-kodesh/catalog';
import { audioChapterName, findItem, formatDuration, itemDescription, itemFacts, itemPdfLabel, itemPdfs, itemPlaylistEntry, itemSubtitle, itemTitle, linkedOccasion, occasionTitle } from '@sichos-kodesh/app-core';
import { useCatalog, useLibrary } from '../../catalog/catalogStore';
import { DownloadPill } from '../../components/DownloadPill';
import { useOnlineMode } from '../../appMode/appMode';
import { PlaylistPlayButton } from '../../components/PlaylistPlayButton';
import { useTranslation } from '../../i18n/useTranslation';
import { libraryItemTargets } from '../../library/libraryDownloads';
import { useTargetsDownload } from '../../library/useLibraryDownload';
import type { LibraryItemScreenProps } from '../../navigation/types';
import { usePlayer } from '../../player/usePlayer';
import { useProgressMap } from '../../player/useProgressMap';
import { CategoryRow } from '../../ui/CategoryRow';
import { EmptyState } from '../../ui/EmptyState';
import { Row, RowDistance, RowTrailing } from '../../ui/Row';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { AppText } from '../../ui/Text';
import { CategoryHeader, Description, Subtitle, TabHelp } from '../../ui/Typography';
import { useColors } from '../../ui/theme';
import { row } from '../../ui/rtl';

/** One item of the library: what it is, the farbrengen it was said at, its recordings and its documents. */
export function LibraryItemScreen({ navigation, route }: LibraryItemScreenProps) {
  const library = useLibrary();
  const catalog = useCatalog();
  const progressMap = useProgressMap();
  const player = usePlayer();
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const { collection, id } = route.params;
  const item = findItem(library, collection, id);
  const occasion = useMemo(() => (item ? linkedOccasion(catalog, item) : undefined), [catalog, item]);
  const entry = useMemo(() => (item ? itemPlaylistEntry(collection, item) : null), [collection, item]);
  const targets = useMemo(() => (item ? libraryItemTargets(collection, item) : []), [collection, item]);
  const download = useTargetsDownload(targets);
  const onlineMode = useOnlineMode();

  if (!item) {
    return (
      <Screen header={<ScreenHeader back={{ name: 'LibraryCollection', params: { collection } }} title={t.collectionNames[collection]} />}>
        <EmptyState text={t.libraryNotFound} />
      </Screen>
    );
  }

  const record = item as LibraryItemBase & Record<string, unknown>;
  const title = itemTitle(collection, item, language);
  const subtitle = itemSubtitle(collection, item, language);
  // The whole name a shortened title stands for (a maamar's facts already say where it was said in full).
  const description = collection === 'maamorim' ? undefined : itemDescription(collection, item, language);
  const facts = itemFacts(collection, item, { saidAt: t.librarySaidAt, printedIn: t.libraryPrintedIn, hemshech: t.libraryHemshech, kuntres: t.libraryKuntres, hasTranscript: t.libraryHasTranscript }, language);
  const pdfLabel = (ref: CatalogRef) => itemPdfLabel(ref, t.pdfRoleNames, t.libraryDocuments, language);
  const pdfs = itemPdfs(item);
  const disputed = collection === 'likkuteiSichos' && record.supplement === true;

  return (
    <Screen header={<ScreenHeader back={{ name: 'LibraryCollection', params: { collection } }} title={t.collectionNames[collection]} />}>
      <AppText style={styles.title}>{title}</AppText>
      {description && <Description>{description}</Description>}
      {subtitle ? <Subtitle>{subtitle}</Subtitle> : null}
      {facts.map((fact) => (
        <AppText key={fact} style={[styles.fact, { color: colors.muted }]}>
          {fact}
        </AppText>
      ))}
      {disputed && <TabHelp>{t.libraryDisputedNote}</TabHelp>}

      <View style={[styles.actions, { flexDirection: row(isRtl) }]}>
        {onlineMode && <DownloadPill state={download.state} progress={download.progress} onStart={download.start} />}
      </View>

      {occasion && (
        <View style={styles.block}>
          <CategoryRow label={t.libraryOpenFarbrengen} count={occasionTitle(occasion, language)} onPress={() => navigation.navigate('Farbrengen', { kind: 'browse', hebrewYear: occasion.hebrewYear, occasionId: occasion.occasionId })} />
        </View>
      )}

      {entry && (
        <>
          <View style={[styles.sectionHeader, { flexDirection: row(isRtl) }]}>
            <CategoryHeader>{t.recordingsCount(entry.audio.length)}</CategoryHeader>
            <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="compact" />
          </View>
          {entry.audio.map((audio, index) => (
            <Row
              key={`${audio.workerFilename}-${index}`}
              label={audioChapterName(audio, language) ?? t.track(index + 1)}
              selected={player.playlist?.occasionId === entry.occasionId && player.currentIndex === index}
              trailing={
                <RowTrailing>
                  <RowDistance standalone={false}>{audio.durationMs > 0 ? formatDuration(audio.durationMs) : ''}</RowDistance>
                </RowTrailing>
              }
              onPress={() =>
                player.play({ title: occasionTitle(entry, language), audio: entry.audio, hebrewYear: entry.hebrewYear, occasionId: entry.occasionId, hebrewDate: entry.hebrewDate }, index)
              }
            />
          ))}
        </>
      )}

      {pdfs.length > 0 && (
        <>
          <CategoryHeader>{t.libraryDocuments}</CategoryHeader>
          {pdfs.map((ref) => (
            <Row
              key={`${ref.sourceId}-${ref.role ?? ''}`}
              label={pdfLabel(ref)}
              marquee
              trailing={
                <RowTrailing>
                  <FileText size={18} color={colors.muted} />
                </RowTrailing>
              }
              onPress={() =>
                navigation.navigate('PdfViewer', {
                  hebrewYear: item.hebrewYear ?? 0,
                  occasionId: 0,
                  driveFileId: ref.sourceId,
                  resourceKey: ref.resourceKey ?? null,
                  label: pdfLabel(ref),
                  library: { collection, id: item.id },
                })
              }
            />
          ))}
        </>
      )}

      {!entry && pdfs.length === 0 && <EmptyState text={t.libraryNoFiles} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', lineHeight: 30, marginBottom: 6 },
  fact: { fontSize: 15, lineHeight: 21, marginBottom: 4 },
  block: { marginTop: 12 },
  actions: { flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 4 },
  sectionHeader: { alignItems: 'center', justifyContent: 'space-between' },
});
