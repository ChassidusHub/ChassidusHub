import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Pause, Play } from 'lucide-react-native';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { playlistForEntry } from '../player/playerContext';
import { usePlayer } from '../player/usePlayer';
import { getOccasionProgress, resumeAudioChapter } from '../player/progressStore';
import type { ProgressStore } from '../player/progressStore';
import { useTranslation } from '../i18n/useTranslation';
import { Spinner } from '../ui/Spinner';
import { useColors } from '../ui/theme';

interface Props {
  entry: CatalogEntry;
  progressMap: ProgressStore;
  /** 'compact' - small icon-only button on FarbrengenScreen's recordings row. 'large' - Spotify-style big green circle atop RecordingsScreen's own playlist. */
  variant: 'compact' | 'large';
}

/** A playlist-level play/pause action: toggles this occasion's own playback when it's already the active one, otherwise starts it from wherever the listener left off. Renders nothing for an occasion with no recordings. */
export function PlaylistPlayButton({ entry, progressMap, variant }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const player = usePlayer();
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);
  const isThisPlaylistActive = player.playlist?.hebrewYear === entry.hebrewYear && player.playlist?.occasionId === entry.occasionId;
  const isPlaying = isThisPlaylistActive && player.playing;
  const isLoading = isThisPlaylistActive && player.loading;

  if (entry.audio.length === 0) return null;

  function handlePress(): void {
    if (isThisPlaylistActive) {
      player.togglePlay();
      return;
    }
    const { chapterIndex, position } = resumeAudioChapter(progress, entry);
    player.play(playlistForEntry(entry), chapterIndex, position);
  }

  const size = variant === 'large' ? 20 : 16;
  let icon = <Play size={size} color={colors.bg} fill={colors.bg} strokeWidth={0} style={styles.playNudge} />;
  if (isLoading) icon = <Spinner size={size} color={colors.bg} />;
  else if (isPlaying) icon = <Pause size={size} color={colors.bg} fill={colors.bg} strokeWidth={0} />;

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={isLoading ? t.loading : isPlaying ? t.pause : t.play}
      style={({ pressed }) => [styles.button, variant === 'large' && styles.large, { backgroundColor: colors.accent }, pressed && styles.pressed]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** Web: `.playlist-play-button` - 32px filled green circle; `.playlist-play-button-large` - 44px. */
  button: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  large: { width: 44, height: 44, borderRadius: 22 },
  pressed: { opacity: 0.92 },
  /** A play triangle's visual weight sits left of its geometric center - nudged right to read as centered. */
  playNudge: { marginLeft: 2 },
});
