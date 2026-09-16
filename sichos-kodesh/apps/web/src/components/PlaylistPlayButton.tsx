import type { MouseEvent } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { usePlayer } from '../player/usePlayer';
import { getOccasionProgress, resumeAudioChapter } from '../player/progressStore';
import type { ProgressStore } from '../player/progressStore';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  entry: CatalogEntry;
  progressMap: ProgressStore;
  /** 'compact' - small icon-only button, e.g. FarbrengenScreen's recordings row. 'large' - Spotify-style big green circular button atop RecordingsScreen's own playlist. */
  variant: 'compact' | 'large';
}

/**
 * A playlist-level play/pause action - Spotify's own convention of a play
 * button on a playlist row/header that starts (or resumes) the whole
 * thing without navigating into it first. Toggles this occasion's own
 * playback when it's already the active one; otherwise starts it from
 * wherever the listener left off (`resumeAudioChapter`), same as tapping
 * a Continue-section row does. Renders nothing for an occasion with no
 * recordings at all - there's nothing to play.
 */
export function PlaylistPlayButton({ entry, progressMap, variant }: Props) {
  const { t } = useTranslation();
  const player = usePlayer();
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);
  const isThisPlaylistActive = player.playlist?.title === entry.occasionLabel;
  const isPlaying = isThisPlaylistActive && player.playing;
  const isLoading = isThisPlaylistActive && player.loading;

  if (entry.audio.length === 0) return null;

  function handleClick(e: MouseEvent): void {
    // FarbrengenScreen's variant sits inside a `<Link>` to the recordings
    // list (see category-row) - stopping propagation here is what keeps
    // tapping play from also navigating there.
    e.preventDefault();
    e.stopPropagation();
    if (isThisPlaylistActive) {
      player.togglePlay();
      return;
    }
    const { chapterIndex, position } = resumeAudioChapter(progress, entry);
    player.play(
      { title: entry.occasionLabel, audio: entry.audio, hebrewYear: entry.hebrewYear, occasionId: entry.occasionId, hebrewDate: entry.hebrewDate },
      chapterIndex,
      position,
    );
  }

  const size = variant === 'large' ? 24 : 16;
  let icon = <Play size={size} fill="currentColor" strokeWidth={0} />;
  if (isLoading) icon = <Loader2 size={size} className="playlist-play-button-spinner" aria-hidden />;
  // strokeWidth={0}: lucide draws a 2px stroke outline even on a filled icon by default, which over-thickens Pause's two already-solid bars.
  else if (isPlaying) icon = <Pause size={size} fill="currentColor" strokeWidth={0} />;

  return (
    <button
      type="button"
      className={variant === 'large' ? 'playlist-play-button playlist-play-button-large' : 'playlist-play-button'}
      aria-label={isLoading ? t.loading : isPlaying ? t.pause : t.play}
      onClick={handleClick}
    >
      {icon}
    </button>
  );
}
