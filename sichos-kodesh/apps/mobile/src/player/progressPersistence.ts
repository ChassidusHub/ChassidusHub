import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { OccasionAudioProgress } from '@sichos-kodesh/app-core';

const STORAGE_KEY = 'sichos-kodesh:mobile-player-progress:v1';
const VERSION = 1;

export interface LastQueueSnapshot {
  hebrewYear: number;
  occasionId: number;
  currentAudioId: string | null;
  position: number;
  savedAt: number;
}

export interface PlayerProgressStore {
  version: number;
  occasions: Record<string, OccasionAudioProgress>;
  lastQueue: LastQueueSnapshot | null;
}

function fallbackStore(): PlayerProgressStore {
  return {
    version: VERSION,
    occasions: {},
    lastQueue: null,
  };
}

export function occasionProgressKey(
  hebrewYear: number,
  occasionId: number,
): string {
  return `${hebrewYear}:${occasionId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function asNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function sanitizeOccasionProgress(
  value: unknown,
): OccasionAudioProgress | null {
  if (!isRecord(value)) return null;
  const hebrewYear = asNonNegativeNumber(value.hebrewYear);
  const occasionId = asNonNegativeNumber(value.occasionId);
  const occasionLabel =
    typeof value.occasionLabel === 'string' ? value.occasionLabel : '';
  const lastVisitedAt = asNonNegativeNumber(value.lastVisitedAt);
  const chapterProgressByAudioId: OccasionAudioProgress['chapterProgressByAudioId'] =
    {};
  if (isRecord(value.chapterProgressByAudioId)) {
    for (const [audioId, chapterProgress] of Object.entries(
      value.chapterProgressByAudioId,
    )) {
      if (!isRecord(chapterProgress)) continue;
      chapterProgressByAudioId[audioId] = {
        position: asNonNegativeNumber(chapterProgress.position),
        duration: asNonNegativeNumber(chapterProgress.duration),
      };
    }
  }
  const lastPlayedAudioId =
    typeof value.lastPlayedAudioId === 'string'
      ? value.lastPlayedAudioId
      : undefined;
  if (!hebrewYear || !occasionId) return null;
  return {
    hebrewYear,
    occasionId,
    occasionLabel,
    lastVisitedAt,
    lastPlayedAudioId,
    chapterProgressByAudioId,
  };
}

function sanitizeLastQueueSnapshot(value: unknown): LastQueueSnapshot | null {
  if (!isRecord(value)) return null;
  const hebrewYear = asNonNegativeNumber(value.hebrewYear);
  const occasionId = asNonNegativeNumber(value.occasionId);
  if (!hebrewYear || !occasionId) return null;
  return {
    hebrewYear,
    occasionId,
    currentAudioId: asNullableString(value.currentAudioId),
    position: asNonNegativeNumber(value.position),
    savedAt: asNonNegativeNumber(value.savedAt),
  };
}

function sanitizeStore(value: unknown): PlayerProgressStore {
  if (!isRecord(value)) return fallbackStore();
  const occasions: PlayerProgressStore['occasions'] = {};
  if (isRecord(value.occasions)) {
    for (const [key, progress] of Object.entries(value.occasions)) {
      const next = sanitizeOccasionProgress(progress);
      if (next) occasions[key] = next;
    }
  }
  return {
    version: VERSION,
    occasions,
    lastQueue: sanitizeLastQueueSnapshot(value.lastQueue),
  };
}

export async function readPlayerProgressStore(): Promise<PlayerProgressStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return fallbackStore();
    return sanitizeStore(JSON.parse(raw));
  } catch {
    return fallbackStore();
  }
}

export async function writePlayerProgressStore(
  store: PlayerProgressStore,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: VERSION,
        occasions: store.occasions,
        lastQueue: store.lastQueue,
      }),
    );
  } catch {
    // Best-effort persistence only.
  }
}

export function getOccasionProgress(
  store: PlayerProgressStore,
  entry: Pick<CatalogEntry, 'hebrewYear' | 'occasionId'>,
): OccasionAudioProgress | undefined {
  return store.occasions[occasionProgressKey(entry.hebrewYear, entry.occasionId)];
}
