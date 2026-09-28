import TrackPlayer, { Event } from 'react-native-track-player';

/**
 * Remote-control event handler registered with TrackPlayer.registerPlaybackService.
 * Handles lock-screen/notification media control buttons.
 */
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, (event) => TrackPlayer.seekBy(-event.interval));
  TrackPlayer.addEventListener(Event.RemoteJumpForward, (event) => TrackPlayer.seekBy(event.interval));
  TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
    if (event.paused) {
      TrackPlayer.pause();
      return;
    }
    if (!event.permanent) {
      TrackPlayer.play();
    }
  });
}
