import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { occasionTitle } from '@chassidushub-reader/app-core';
import { useCatalog } from '../catalog/catalogStore';
import type { RootStackParamList } from '../navigation/types';
import { playlistForEntry } from '../player/playerContext';
import { isChapterFinished, isOccasionFinished, listRecentOccasions, occasionProgressFraction } from '../player/progressStore';
import type { OccasionProgress } from '../player/progressStore';
import { useProgressMap } from '../player/useProgressMap';
import { usePlayer } from '../player/usePlayer';
import { useTranslation } from '../i18n/useTranslation';
import { hebrewFullDateLabel } from '../utils/formatHebrewDate';
import { AppText } from '../ui/Text';
import { Row } from '../ui/Row';
import { CategoryHeader } from '../ui/Typography';
import { useColors } from '../ui/theme';
import { OccasionRowIcon } from './OccasionRowIcon';

const MAX_ITEMS = 5;

type Destination = { kind: 'occasion'; resumeChapterIndex: number | null } | { kind: 'pdf'; driveFileId: string };

/** Where a Continue tap should land: whichever of the occasion's two kinds of content (a chapter's recording, or a PDF's reading position) was last active - a finished chapter has nothing left to resume, so it falls back to the plain occasion page. */
function continueDestination(entry: CatalogEntry, progress: OccasionProgress): Destination {
  if (progress.lastActivity?.kind === 'pdf' && progress.pdf && entry.pdfs.some((pdf) => pdf.driveFileId === progress.pdf?.driveFileId)) {
    return { kind: 'pdf', driveFileId: progress.pdf.driveFileId };
  }
  if (progress.lastActivity?.kind === 'audio') {
    const { chapterIndex } = progress.lastActivity;
    const chapter = entry.audio[chapterIndex];
    if (chapter && !isChapterFinished(progress, chapterIndex, chapter)) {
      return { kind: 'occasion', resumeChapterIndex: chapterIndex };
    }
  }
  return { kind: 'occasion', resumeChapterIndex: null };
}

/**
 * Spotify-style "pick up where you left off": the most recently visited
 * occasions, each showing how much of its recording has actually been
 * heard. Tapping a row resumes whatever was actually left off - a chapter
 * still mid-way (starts playing right from this row, via the global
 * player) or a PDF still being read (opens straight into it, at the saved page).
 */
export function ContinueSection() {
  const catalog = useCatalog();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, language } = useTranslation();
  const colors = useColors();
  const progressMap = useProgressMap();
  const player = usePlayer();

  const items = listRecentOccasions(MAX_ITEMS)
    .map((progress) => {
      const entry = catalog[progress.hebrewYear]?.find((e) => e.occasionId === progress.occasionId);
      return entry ? { progress, entry } : null;
    })
    .filter((item): item is { progress: OccasionProgress; entry: CatalogEntry } => item !== null);

  if (items.length === 0) return null;

  return (
    <View>
      <CategoryHeader>{t.continueSectionTitle}</CategoryHeader>
      {items.map(({ progress, entry }) => {
        const fraction = occasionProgressFraction(progress, entry);
        const finished = isOccasionFinished(progress, entry);
        const destination = continueDestination(entry, progress);
        return (
          <Row
            key={`${entry.hebrewYear}-${entry.occasionId}`}
            label={occasionTitle(entry, language)}
            trailing={<OccasionRowIcon entry={entry} progressMap={progressMap} />}
            onPress={() => {
              if (destination.kind === 'pdf') {
                const pdf = entry.pdfs.find((item) => item.driveFileId === destination.driveFileId)!;
                navigation.navigate('PdfViewer', {
                  hebrewYear: entry.hebrewYear,
                  occasionId: entry.occasionId,
                  driveFileId: pdf.driveFileId,
                  resourceKey: pdf.resourceKey ?? null,
                  label: pdf.label,
                });
                return;
              }
              if (destination.resumeChapterIndex !== null) {
                const position = progress.chapters[destination.resumeChapterIndex]?.position ?? 0;
                player.play(playlistForEntry(entry), destination.resumeChapterIndex, position);
              }
              navigation.navigate('Farbrengen', { kind: 'browse', hebrewYear: entry.hebrewYear, occasionId: entry.occasionId });
            }}
          >
            {/* This list spans every year, so the date (with its year) is what tells apart two rows that share the same recurring occasion label. */}
            <AppText style={[styles.date, { color: colors.muted }]}>{hebrewFullDateLabel(entry.hebrewDate, entry.hebrewYear, language)}</AppText>
            {fraction > 0 && !finished && (
              <View style={[styles.track, { backgroundColor: colors.border }]}>
                <View style={[styles.fill, { backgroundColor: colors.accent, width: `${Math.round(fraction * 100)}%` }]} />
              </View>
            )}
          </Row>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Web: `.continue-row-date` - muted 13px/500. */
  date: { fontSize: 13, fontWeight: '500' },
  /** Web: `.continue-progress-track` - full width, 3px, pill. */
  track: { width: '100%', height: 3, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
});
