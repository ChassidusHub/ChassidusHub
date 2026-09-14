import { CheckCircle2, Music } from 'lucide-react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { getOccasionProgress, isOccasionFinished } from '../player/progressStore';
import type { ProgressStore } from '../player/progressStore';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  entry: CatalogEntry;
  progressMap: ProgressStore;
}

/**
 * The leading icon on an occasion row, shared by every occasion list
 * (YearBrowserScreen, ThisWeekScreen, AllYearsThisWeekScreen, the home
 * page's Continue section) so "finished" reads the same way everywhere a
 * farbrengen can show up, not just on the screen it was actually finished
 * from. A finished checkmark takes priority over the plain audio-note icon
 * - once you've heard it, that's the more useful thing to see at a glance.
 */
export function OccasionRowIcon({ entry, progressMap }: Props) {
  const { t } = useTranslation();
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);
  if (isOccasionFinished(progress, entry)) {
    return <CheckCircle2 size={14} className="finished-icon" aria-label={t.finishedLabel} />;
  }
  if (entry.audio.length > 0) {
    return <Music size={14} className="year-row-audio-icon" aria-label={t.hasRecordingLabel} />;
  }
  return null;
}
