import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import type { CatalogRef, LibraryItemBase } from '@chassidushub-reader/catalog';
import { findItem, formatDuration, itemDescription, itemPdfLabel, itemPdfs, itemPlaylistEntry, itemSubtitle, itemTitle, linkedOccasion, occasionTitle } from '@chassidushub-reader/app-core';
import { useCatalog, useLibrary } from '../../catalog/catalogStore';
import { ChapterList } from '../../components/ChapterList';
import { DownloadPill } from '../../components/DownloadPill';
import { useOnlineMode } from '../../appMode/appMode';
import { PlaylistPlayButton } from '../../components/PlaylistPlayButton';
import { useTranslation } from '../../i18n/useTranslation';
import { libraryItemTargets } from '../../library/libraryDownloads';
import { useTargetsDownload } from '../../library/useLibraryDownload';
import type { LibraryItemScreenProps } from '../../navigation/types';
import { useProgressMap } from '../../player/useProgressMap';
import { CategoryRow } from '../../ui/CategoryRow';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { AppText } from '../../ui/Text';
import { CategoryHeader, Description, Subtitle, TabHelp } from '../../ui/Typography';
import { DISPLAY_FONT, useColors } from '../../ui/theme';
import { row, textAlign } from '../../ui/rtl';

/**
 * One item of the library - a sicha, a maamar, a yoman, a hadran, a
 * michtav, a recording - on one page laid out like a farbrengen's (web:
 * LibraryItemScreen, `/l/<collection>/<item>`): what it is and where it
 * comes from, the farbrengen it was said at, its texts (each row opening
 * its PDF), then its recordings with Play and the chapters right under it.
 */
export function LibraryItemScreen({ navigation, route }: LibraryItemScreenProps) {
  const library = useLibrary();
  const catalog = useCatalog();
  const progressMap = useProgressMap();
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
  const pdfLabel = (ref: CatalogRef) => itemPdfLabel(ref, t.pdfRoleNames, t.libraryDocuments, language);
  const pdfs = itemPdfs(item);
  const disputed = collection === 'likkuteiSichos' && record.supplement === true;
  const durationMs = entry ? entry.audio.reduce((sum, chapter) => sum + (chapter.durationMs || 0), 0) : 0;

  return (
    <Screen header={<ScreenHeader back={{ name: 'LibraryCollection', params: { collection } }} title={t.collectionNames[collection]} />}>
      <AppText style={styles.title}>{title}</AppText>
      {description && <Description>{description}</Description>}
      {subtitle ? <Subtitle>{subtitle}</Subtitle> : null}
      {disputed && <TabHelp>{t.libraryDisputedNote}</TabHelp>}

      <View style={[styles.actions, { flexDirection: row(isRtl) }]}>
        {onlineMode && <DownloadPill state={download.state} progress={download.progress} onStart={download.start} />}
      </View>

      {occasion && (
        <View style={styles.block}>
          <CategoryRow label={t.libraryOpenFarbrengen} count={occasionTitle(occasion, language)} onPress={() => navigation.navigate('Farbrengen', { kind: 'browse', hebrewYear: occasion.hebrewYear, occasionId: occasion.occasionId })} />
        </View>
      )}

      {pdfs.length > 0 && (
        <View style={styles.section}>
          <CategoryHeader first>{t.texts}</CategoryHeader>
          <View style={[styles.textList, { backgroundColor: colors.cardBg }]}>
            {pdfs.map((ref, i) => (
              <Pressable
                key={`${ref.sourceId}-${ref.role ?? ''}`}
                accessibilityRole="button"
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
                style={({ pressed }) => [styles.textRow, { flexDirection: row(isRtl) }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.cardHover }]}
              >
                <FileText size={18} color={colors.accent} />
                <AppText style={[styles.textLabel, { color: colors.fg, textAlign: textAlign(isRtl) }]}>{pdfLabel(ref)}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {entry && (
        <View style={styles.section}>
          <View style={[styles.playHeader, { backgroundColor: colors.cardBg, flexDirection: row(isRtl) }]}>
            <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="large" />
            <View style={styles.playHeaderCopy}>
              <AppText style={[styles.playTitle, { textAlign: textAlign(isRtl) }]}>{t.recordings}</AppText>
              <AppText style={[styles.playSubtitle, { color: colors.muted, textAlign: textAlign(isRtl) }]}>
                {t.recordingsCount(entry.audio.length)}
                {durationMs > 0 ? ` · ${formatDuration(durationMs)}` : ''}
              </AppText>
            </View>
          </View>
          <ChapterList entry={entry} progressMap={progressMap} downloads={false} />
        </View>
      )}

      {!entry && pdfs.length === 0 && <EmptyState text={t.libraryNoFiles} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: '700', lineHeight: 30, marginBottom: 6 },
  block: { marginTop: 12 },
  actions: { flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 4 },
  /** Web: `.farbrengen-section`. */
  section: { marginTop: 22 },
  /** Web: `.text-list` / `.text-row`. */
  textList: { borderRadius: 12, overflow: 'hidden' },
  textRow: { alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 48 },
  textLabel: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21 },
  /** Web: `.playlist-header` - the recordings' card with the big Play. */
  playHeader: { alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, marginBottom: 8 },
  playHeaderCopy: { flex: 1, minWidth: 0, gap: 4 },
  playTitle: { fontSize: 18, fontWeight: '700' },
  playSubtitle: { fontSize: 14, fontVariant: ['tabular-nums'] },
});
