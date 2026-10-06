import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { useAutoplayOnHanacha } from '../settings/useAutoplayOnHanacha';
import { playlistForEntry } from './playerContext';
import { usePlayer } from './usePlayer';

/**
 * What opening a farbrengen's hanacha does to the player: starts its
 * recording, unless this occasion's own recording is already the active one
 * (playing or paused) - then it is left exactly as it is. If a different
 * recording is playing, `autoplayOnHanacha` decides whether to replace it
 * (see useAutoplayOnHanacha). The farbrengen page and the week's cards call it.
 */
export function useReadHanacha(): (entry: CatalogEntry) => void {
  const player = usePlayer();
  const [autoplayOnHanacha] = useAutoplayOnHanacha();
  return (entry) => {
    if (entry.audio.length === 0) return;
    if (player.playlist?.title === entry.occasionLabel) return;
    if (player.playing && player.playlist !== null && !autoplayOnHanacha) return;
    player.play(playlistForEntry(entry), 0);
  };
}
