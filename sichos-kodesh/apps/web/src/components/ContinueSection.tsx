import { Link } from 'react-router-dom';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OccasionRowIcon } from './OccasionRowIcon';
import { isOccasionFinished, listRecentOccasions, occasionProgressFraction } from '../player/progressStore';
import type { OccasionProgress } from '../player/progressStore';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';

const MAX_ITEMS = 5;

/**
 * Spotify-style "pick up where you left off": the most recently visited
 * occasions, each showing how much of its recording has actually been
 * heard (see player/progressStore.ts) - not just whether it was opened.
 * Always links via /browse/:hebrewYear/:occasionId, the one route that
 * resolves any occasion directly by (year, id) with no kvius-matching or
 * this-week requirement, regardless of which flow (follow, browse,
 * this-week-all-years) the visit actually came from.
 */
export function ContinueSection() {
  const { t } = useTranslation();
  const progressMap = useProgressMap();

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
          return (
            <li key={`${entry.hebrewYear}-${entry.occasionId}`}>
              <Link className="year-row continue-row" to={`/browse/${entry.hebrewYear}/${entry.occasionId}`}>
                <span className="year-row-main">
                  <OccasionRowIcon entry={entry} progressMap={progressMap} />
                  <span className="year-row-year">{entry.occasionLabel}</span>
                </span>
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
