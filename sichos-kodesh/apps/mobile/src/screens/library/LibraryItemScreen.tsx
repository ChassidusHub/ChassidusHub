import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import type { CatalogEntry, CatalogRef, LibraryCollectionId, LibraryItemBase } from '@sichos-kodesh/catalog';
import { useCatalog, useLibrary } from '../../catalog/catalogStore';
import { DownloadPill } from '../../components/DownloadPill';
import { PlaylistPlayButton } from '../../components/PlaylistPlayButton';
import { useTranslation } from '../../i18n/useTranslation';
import { findItem, formatDuration, itemAudio, itemPdfs, itemSubtitle, linkedOccasion, playlistOccasionId } from '../../library/libraryModel';
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
import { CategoryHeader, Subtitle, TabHelp } from '../../ui/Typography';
import { useColors } from '../../ui/theme';
import { row } from '../../ui/rtl';

type Translation = ReturnType<typeof useTranslation>['t'];

/** The facts worth a line of their own, per collection: citations, hemshech, languages, date lines. Bibliographic facts only. */
function itemFacts(t: Translation, collection: LibraryCollectionId, item: LibraryItemBase): string[] {
  const record = item as LibraryItemBase & Record<string, unknown>;
  const facts: string[] = [];
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  switch (collection) {
    case 'maamorim': {
      const occasion = text(record.occasionLabel);
      if (occasion) facts.push(`${t.librarySaidAt}: ${occasion}`);
      const hemshech = text(record.hemshech);
      if (hemshech) facts.push(t.libraryHemshech(hemshech));
      const kuntres = text(record.kuntres);
      if (kuntres) facts.push(t.libraryKuntres(kuntres));
      const citations = Array.isArray(record.citations) ? (record.citations as string[]).filter(Boolean) : [];
      if (citations.length) facts.push(`${t.libraryPrintedIn}: ${citations.join(' · ')}`);
      break;
    }
    case 'hadranim':
      if (Array.isArray(record.dateLines)) facts.push(...(record.dateLines as string[]));
      break;
    case 'michtavimKlolim': {
      const citations = Array.isArray(record.citations) ? (record.citations as Array<{ prefix: string; label: string }>).filter((c) => c.label) : [];
      for (const citation of citations) facts.push(`${citation.prefix}: ${citation.label}`);
      break;
    }
    case 'likkuteiSichos':
      if (record.hasTranslated === true) facts.push(t.libraryHasTranslation);
      break;
    case 'jemEvents':
      if (record.hasTranscript === true) facts.push(t.libraryHasTranscript);
      break;
    default:
      break;
  }
  return facts;
}

function pdfLabel(t: Translation, ref: CatalogRef): string {
  const role = ref.role ?? '';
  const roleName = t.pdfRoleNames[role] ?? (role.includes(':') ? role.split(':').slice(1).join(':') : role);
  if (ref.label && roleName && !ref.label.includes(roleName)) return `${roleName} · ${ref.label}`;
  return ref.label || roleName || t.libraryDocuments;
}

/** A library item as the player takes a playlist: its own recordings under an id no catalog occasion has. */
function playlistEntry(collection: LibraryCollectionId, item: LibraryItemBase): CatalogEntry | null {
  const audio = itemAudio(item);
  if (audio.length === 0) return null;
  return {
    occasionId: playlistOccasionId(collection, item),
    hebrewYear: item.hebrewYear ?? 0,
    hebrewDate: item.hebrewDate ?? '',
    occasionLabel: item.label,
    audio,
    pdfs: [],
  };
}

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
  const entry = useMemo(() => (item ? playlistEntry(collection, item) : null), [collection, item]);
  const targets = useMemo(() => (item ? libraryItemTargets(collection, item) : []), [collection, item]);
  const download = useTargetsDownload(targets);

  if (!item) {
    return (
      <Screen header={<ScreenHeader back={{ name: 'LibraryCollection', params: { collection } }} title={t.collectionNames[collection]} />}>
        <EmptyState text={t.libraryNotFound} />
      </Screen>
    );
  }

  const record = item as LibraryItemBase & Record<string, unknown>;
  const title = collection === 'maamorim' && typeof record.diburHamaschil === 'string' ? record.diburHamaschil : item.label;
  const subtitle = itemSubtitle(collection, item, language);
  const facts = itemFacts(t, collection, item);
  const pdfs = itemPdfs(item);
  const disputed = collection === 'likkuteiSichos' && record.supplement === true;

  return (
    <Screen header={<ScreenHeader back={{ name: 'LibraryCollection', params: { collection } }} title={t.collectionNames[collection]} />}>
      <AppText style={styles.title}>{title}</AppText>
      {subtitle ? <Subtitle>{subtitle}</Subtitle> : null}
      {facts.map((fact) => (
        <AppText key={fact} style={[styles.fact, { color: colors.muted }]}>
          {fact}
        </AppText>
      ))}
      {disputed && <TabHelp>{t.libraryDisputedNote}</TabHelp>}

      <View style={[styles.actions, { flexDirection: row(isRtl) }]}>
        <DownloadPill state={download.state} progress={download.progress} onStart={download.start} />
      </View>

      {occasion && (
        <View style={styles.block}>
          <CategoryRow label={t.libraryOpenFarbrengen} count={occasion.occasionLabel} onPress={() => navigation.navigate('Farbrengen', { kind: 'browse', hebrewYear: occasion.hebrewYear, occasionId: occasion.occasionId })} />
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
              label={audio.chapterName ?? t.track(index + 1)}
              selected={player.playlist?.occasionId === entry.occasionId && player.currentIndex === index}
              trailing={
                <RowTrailing>
                  <RowDistance standalone={false}>{audio.durationMs > 0 ? formatDuration(audio.durationMs) : ''}</RowDistance>
                </RowTrailing>
              }
              onPress={() =>
                player.play({ title: entry.occasionLabel, audio: entry.audio, hebrewYear: entry.hebrewYear, occasionId: entry.occasionId, hebrewDate: entry.hebrewDate }, index)
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
              label={pdfLabel(t, ref)}
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
                  label: pdfLabel(t, ref),
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
