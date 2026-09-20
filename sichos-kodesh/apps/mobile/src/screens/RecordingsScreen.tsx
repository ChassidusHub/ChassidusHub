import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import type { RecordingsScreenProps } from '../navigation/types';
import { usePlayer } from '../player/usePlayer';
import { resolveOccasionRoute } from '../routes/catalogRoutes';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SectionLabel } from '../ui/SectionLabel';
import { spacing, typography } from '../ui/theme';
import catalog from '../catalog/data';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function RecordingsScreen({ navigation, route }: RecordingsScreenProps) {
  const { t, language } = useTranslation();
  const { playOccasion, togglePlay, skipTo, chapters, currentIndex, isPlaying, isLoading, hasError, errorMessage } = usePlayer();
  const resolved = useMemo(
    () => resolveOccasionRoute(catalog, route.params, language),
    [language, route.params],
  );

  if (!resolved) {
    return (
      <Screen>
        <ScreenHeader title={t.occasionNotFound} onBack={() => navigation.goBack()} backLabel={t.back} />
        <EmptyState title={t.occasionNotFound} />
      </Screen>
    );
  }

  const { entry } = resolved;
  const isThisOccasionLoaded =
    chapters.length > 0 &&
    chapters[0]?.occasionId === entry.occasionId &&
    chapters[0]?.hebrewYear === entry.hebrewYear;

  async function playChapter(index: number): Promise<void> {
    if (isThisOccasionLoaded && currentIndex === index) {
      await togglePlay();
      return;
    }
    if (!isThisOccasionLoaded) {
      await playOccasion(entry);
    }
    if (index > 0 || isThisOccasionLoaded) {
      await skipTo(index);
    }
  }

  return (
    <Screen>
      <ScreenHeader
        title={t.recordings}
        onBack={() => navigation.navigate('Farbrengen', route.params)}
        backLabel={t.back}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="bodySmall" color="secondary">
          {entry.occasionLabel}
        </AppText>

        {entry.audio.length === 0 ? (
          <EmptyState title={t.nothingDownloadable} />
        ) : (
          <>
            <Card style={styles.headerCard}>
              <SectionLabel label={t.recordings} />
              <View style={styles.headerRow}>
                <AppText variant="titleSmall">{entry.occasionLabel}</AppText>
                <AppButton
                  label={isThisOccasionLoaded && !isLoading ? (isPlaying ? t.pause : t.play) : isLoading ? t.loading : t.play}
                  onPress={() => {
                    if (isThisOccasionLoaded) {
                      togglePlay().catch(() => undefined);
                      return;
                    }
                    playOccasion(entry).catch(() => undefined);
                  }}
                />
              </View>
            </Card>

            {entry.audio.map((audio, index) => {
              const isActive = isThisOccasionLoaded && currentIndex === index;
              return (
                <Card key={audio.workerFilename} style={styles.chapterCard}>
                  <AppText style={styles.chapterTitle}>
                    {audio.chapterName ?? (entry.audio.length > 1 ? t.track(index + 1) : entry.occasionLabel)}
                  </AppText>
                  <AppText variant="bodySmall" color="secondary">
                    {formatTime(audio.durationMs / 1000)}
                  </AppText>
                  <View style={styles.chapterActions}>
                    <AppButton
                      label={isActive && !isLoading ? (isPlaying ? t.pause : t.play) : isLoading && isActive ? t.loading : t.play}
                      style={styles.chapterButton}
                      onPress={() => {
                        playChapter(index).catch(() => undefined);
                      }}
                    />
                  </View>
                </Card>
              );
            })}
          </>
        )}

        {hasError && isThisOccasionLoaded ? (
          <AppText color="error">{errorMessage ?? t.audioLoadError}</AppText>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  headerCard: { gap: spacing.sm },
  headerRow: { gap: spacing.sm },
  chapterCard: { gap: spacing.sm },
  chapterTitle: typography.bodyMedium,
  chapterActions: { flexDirection: 'row' },
  chapterButton: { flex: 1 },
});
