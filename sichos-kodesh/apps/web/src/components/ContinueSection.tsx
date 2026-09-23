import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { useCatalog } from '../catalog/catalogStore';
import { OccasionRowIcon } from './OccasionRowIcon';
import {
  isChapterFinished,
  isOccasionFinished,
  listRecentOccasions,
  occasionProgressFraction,
} from '../player/progressStore';
import type { OccasionProgress } from '../player/progressStore';
import { useProgressMap } from '../player/useProgressMap';
import { usePlayer } from '../player/usePlayer';
import { useTranslation } from '../i18n/useLanguage';
import { hebrewFullDateLabel } from '../utils/formatHebrewDate';

const MAX_ITEMS = 5;

/**
 * Where a Continue tap should actually land: whichever of the occasion's
 * two kinds of content (a chapter's recording, or a PDF's reading
 * position) was last active (see progressStore's `lastActivity`) - a
 * finished chapter has nothing left to resume, so that's treated the same
 * as no audio activity at all and falls back to the plain occasion page.
 */
function continueDestination(entry: CatalogEntry, progress: OccasionProgress): { path: string; resumeChapterIndex: number | null } {
  const basePath = `/browse/${entry.hebrewYear}/${entry.occasionId}`;
  if (progress.lastActivity?.kind === 'pdf' && progress.pdf) {
    return { path: `${basePath}/pdf/${encodeURIComponent(progress.pdf.driveFileId)}`, resumeChapterIndex: null };
  }
  if (progress.lastActivity?.kind === 'audio') {
    const { chapterIndex } = progress.lastActivity;
    const chapter = entry.audio[chapterIndex];
    if (chapter && !isChapterFinished(progress, chapterIndex, chapter)) {
      return { path: basePath, resumeChapterIndex: chapterIndex };
    }
  }
  return { path: basePath, resumeChapterIndex: null };
}

/**
 * Spotify-style "pick up where you left off": the most recently visited
 * occasions, each showing how much of its recording has actually been
 * heard (see player/progressStore.ts) - not just whether it was opened.
 * Tapping a row resumes whatever was actually left off - a chapter still
 * mid-way (starts playing right from this row, via the global player, at
 * the exact position reached) or a PDF still being read (opens straight
 * into it, scrolled back to where it was - see PdfViewerScreen) - rather
 * than always dropping back on the occasion's own page and making the
 * user find their place again.
 */
export function ContinueSection() {
  const catalog = useCatalog();
  const { t, language } = useTranslation();
  const progressMap = useProgressMap();
  const player = usePlayer();

  const items = listRecentOccasions(MAX_ITEMS)
    .map((progress) => {
      const entry = catalog[progress.hebrewYear]?.find((e) => e.occasionId === progress.occasionId);
      return entry ? { progress, entry } : null;
    })
    .filter((item): item is { progress: OccasionProgress; entry: CatalogEntry } => item !== null);

  if (items.length === 0) return null;

  return (
    <div className="continue-section">
      <p className="category-header">{t.continueSectionTitle}</p>
      <ul className="year-list">
        {items.map(({ progress, entry }) => {
          const fraction = occasionProgressFraction(progress, entry);
          const finished = isOccasionFinished(progress, entry);
          const { path, resumeChapterIndex } = continueDestination(entry, progress);
          return (
            <li key={`${entry.hebrewYear}-${entry.occasionId}`}>
              <Link
                className="year-row continue-row"
                to={path}
                onClick={() => {
                  if (resumeChapterIndex === null) return;
                  const position = progress.chapters[resumeChapterIndex]?.position ?? 0;
                  player.play(
                    { title: entry.occasionLabel, audio: entry.audio, hebrewYear: entry.hebrewYear, occasionId: entry.occasionId, hebrewDate: entry.hebrewDate },
                    resumeChapterIndex,
                    position,
                  );
                }}
              >
                <span className="year-row-title-line">
                  <span className="year-row-year">{entry.occasionLabel}</span>
                  <OccasionRowIcon entry={entry} progressMap={progressMap} />
                </span>
                {/* This list spans every year, not one source year the way
                    an occasion's own page does, so the date (with its
                    year) is what actually tells apart two rows that
                    happen to share the same recurring occasion label. */}
                <span className="continue-row-date">{hebrewFullDateLabel(entry.hebrewDate, entry.hebrewYear, language)}</span>
                {fraction > 0 && !finished && (
                  <span className="continue-progress-track" aria-hidden>
                    <span className="continue-progress-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
