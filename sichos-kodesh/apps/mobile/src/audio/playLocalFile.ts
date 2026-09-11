import Sound from 'react-native-sound';

export interface LoadedSound {
  play: () => void;
  pause: () => void;
  stop: () => void;
  release: () => void;
  /** Seconds - known synchronously once loaded, per react-native-sound's API. */
  duration: number;
  getCurrentTime: (callback: (seconds: number) => void) => void;
}

/** Loads a fully-downloaded local audio file for play/pause/stop and elapsed-time polling (for BottomAudioPlayer's progress bar) - no network access. */
export function loadLocalSound(absolutePath: string): Promise<LoadedSound> {
  return new Promise((resolve, reject) => {
    const sound = new Sound(absolutePath, '', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        play: () => sound.play(),
        pause: () => sound.pause(),
        stop: () => sound.stop(),
        release: () => sound.release(),
        duration: sound.getDuration(),
        getCurrentTime: (callback) => sound.getCurrentTime(callback),
      });
    });
  });
}
