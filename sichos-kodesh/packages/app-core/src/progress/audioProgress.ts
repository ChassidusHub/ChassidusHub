import type { CatalogEntry } from '@sichos-kodesh/catalog';

export const FINISHED_FRACTION = 0.9;

export interface AudioChapterProgress {
  position: number;
  duration: number;
}

export interface OccasionAudioProgress {
  hebrewYear: number;
  occasionId: number;
  occasionLabel: string;
  lastVisitedAt: number;
  lastPlayedAudioId?: string;
  chapterProgressByAudioId: Record<string, AudioChapterProgress>;
}

export interface RecordAudioProgressInput {
  hebrewYear: number;
  occasionId: number;
  occasionLabel: string;
  audioId: string;
  position: number;
  duration: number;
  now?: number;
  markAsActive?: boolean;
}

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function readChapterProgress(
  progress: OccasionAudioProgress | undefined,
  audioId: string,
): AudioChapterProgress | undefined {
  return progress?.chapterProgressByAudioId[audioId];
}

export function recordOccasionAudioProgress(
  existing: OccasionAudioProgress | undefined,
  input: RecordAudioProgressInput,
): OccasionAudioProgress {
  const now = input.now ?? Date.now();
  const position = nonNegativeFinite(input.position);
  const duration = nonNegativeFinite(input.duration);
  const priorPosition = existing?.chapterProgressByAudioId[input.audioId]?.position ?? 0;
  const next: OccasionAudioProgress = {
    hebrewYear: input.hebrewYear,
    occasionId: input.occasionId,
    occasionLabel: input.occasionLabel,
    lastVisitedAt: existing?.lastVisitedAt ?? now,
    chapterProgressByAudioId: {
      ...existing?.chapterProgressByAudioId,
      [input.audioId]: {
        position: Math.max(priorPosition, position),
        duration,
      },
    },
  };
  if (input.markAsActive) {
    next.lastPlayedAudioId = input.audioId;
  } else if (existing?.lastPlayedAudioId) {
    next.lastPlayedAudioId = existing.lastPlayedAudioId;
  }
  return next;
}

export function isAudioChapterFinished(
  progress: OccasionAudioProgress | undefined,
  audioId: string,
  chapter: { durationMs: number },
): boolean {
  const recorded = readChapterProgress(progress, audioId);
  if (!recorded) return false;
  const chapterDuration = chapter.durationMs / 1000;
  return chapterDuration > 0 && recorded.position / chapterDuration >= FINISHED_FRACTION;
}

export function resolveResumeAudioChapter(
  progress: OccasionAudioProgress | undefined,
  entry: Pick<CatalogEntry, 'audio'>,
): { chapterIndex: number; position: number } {
  if (!entry.audio.length) return { chapterIndex: 0, position: 0 };

  const activeAudioId = progress?.lastPlayedAudioId;
  if (activeAudioId) {
    const chapterIndex = entry.audio.findIndex(
      (chapter) => chapter.workerFilename === activeAudioId,
    );
    if (
      chapterIndex !== -1 &&
      !isAudioChapterFinished(progress, activeAudioId, entry.audio[chapterIndex]!)
    ) {
      return {
        chapterIndex,
        position: readChapterProgress(progress, activeAudioId)?.position ?? 0,
      };
    }
  }

  const firstUnfinished = entry.audio.findIndex(
    (chapter) => !isAudioChapterFinished(progress, chapter.workerFilename, chapter),
  );
  if (firstUnfinished !== -1) {
    const chapter = entry.audio[firstUnfinished]!;
    return {
      chapterIndex: firstUnfinished,
      position: readChapterProgress(progress, chapter.workerFilename)?.position ?? 0,
    };
  }

  return { chapterIndex: 0, position: 0 };
}
