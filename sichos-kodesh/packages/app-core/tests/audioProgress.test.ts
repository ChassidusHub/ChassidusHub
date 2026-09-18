import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import {
  isAudioChapterFinished,
  recordOccasionAudioProgress,
  resolveResumeAudioChapter,
} from '../src/progress/audioProgress.js';

function makeEntry(audio: CatalogEntry['audio']): Pick<CatalogEntry, 'audio'> {
  return { audio };
}

describe('recordOccasionAudioProgress', () => {
  it('keeps the furthest reached chapter position', () => {
    const first = recordOccasionAudioProgress(undefined, {
      hebrewYear: 5711,
      occasionId: 1,
      occasionLabel: 'Occasion',
      audioId: 'a.mp3',
      position: 120,
      duration: 600,
      markAsActive: true,
      now: 1000,
    });
    const second = recordOccasionAudioProgress(first, {
      hebrewYear: 5711,
      occasionId: 1,
      occasionLabel: 'Occasion',
      audioId: 'a.mp3',
      position: 60,
      duration: 600,
      markAsActive: true,
      now: 1001,
    });

    expect(second.chapterProgressByAudioId['a.mp3']?.position).toBe(120);
    expect(second.lastPlayedAudioId).toBe('a.mp3');
    expect(second.lastVisitedAt).toBe(1000);
  });
});

describe('resolveResumeAudioChapter', () => {
  const entry = makeEntry([
    { workerFilename: 'a.mp3', durationMs: 100000 },
    { workerFilename: 'b.mp3', durationMs: 100000 },
  ]);

  it('resumes from the saved active chapter when unfinished', () => {
    const progress = {
      hebrewYear: 5711,
      occasionId: 1,
      occasionLabel: 'Occasion',
      lastVisitedAt: 1000,
      lastPlayedAudioId: 'b.mp3',
      chapterProgressByAudioId: {
        'b.mp3': { position: 20, duration: 100 },
      },
    };

    expect(resolveResumeAudioChapter(progress, entry)).toEqual({
      chapterIndex: 1,
      position: 20,
    });
  });

  it('falls back to first unfinished chapter when active chapter is finished', () => {
    const progress = {
      hebrewYear: 5711,
      occasionId: 1,
      occasionLabel: 'Occasion',
      lastVisitedAt: 1000,
      lastPlayedAudioId: 'a.mp3',
      chapterProgressByAudioId: {
        'a.mp3': { position: 95, duration: 100 },
        'b.mp3': { position: 40, duration: 100 },
      },
    };

    expect(resolveResumeAudioChapter(progress, entry)).toEqual({
      chapterIndex: 1,
      position: 40,
    });
  });
});

describe('isAudioChapterFinished', () => {
  it('uses the finished threshold', () => {
    const progress = {
      hebrewYear: 5711,
      occasionId: 1,
      occasionLabel: 'Occasion',
      lastVisitedAt: 1000,
      chapterProgressByAudioId: {
        'a.mp3': { position: 90, duration: 100 },
      },
    };

    expect(
      isAudioChapterFinished(progress, 'a.mp3', { durationMs: 100000 }),
    ).toBe(true);
  });
});
