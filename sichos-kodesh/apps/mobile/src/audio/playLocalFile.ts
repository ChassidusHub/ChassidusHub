import Sound from 'react-native-sound';

export interface LoadedSound {
  play: () => void;
  pause: () => void;
  stop: () => void;
  release: () => void;
}

/** Loads a fully-downloaded local audio file for basic play/pause/stop - no network access, no seek bar yet (a fast follow, not core to proving the pipeline). */
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
      });
    });
  });
}
