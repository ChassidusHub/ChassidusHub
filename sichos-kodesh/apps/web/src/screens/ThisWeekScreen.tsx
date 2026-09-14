import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Music } from 'lucide-react';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { BackLink } from '../components/BackLink';

interface Props {
  sourceYear: number;
}

/** The list-only screen for "Follow along" - tapping a row navigates to /follow/:sourceYear/:occasionId (see routes/useResolvedEntry.ts's useFollowEntry). */
export function ThisWeekScreen({ sourceYear }: Props) {
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog), [sourceYear]);

  return (
    <div className="screen">
      <BackLink to="/">change year</BackLink>
      <h1>This week</h1>
      <p className="subtitle">From Hebrew year {sourceYear}</p>

      {occasions.length === 0 && (
        <p className="gap-message">Nothing indexed for this week in {sourceYear} or nearby kvius-matched years.</p>
      )}

      <ul className="year-list">
        {occasions.map((occasion) => (
          <li key={occasion.entry.occasionId}>
            <Link className="year-row" to={`/follow/${sourceYear}/${occasion.entry.occasionId}`}>
              <span className="year-row-main">
                {occasion.entry.audio.length > 0 && <Music size={14} className="year-row-audio-icon" aria-label="Has a recording" />}
                <span className="year-row-year">{occasion.entry.occasionLabel}</span>
              </span>
              <span className="year-row-distance">{occasion.gregorianDate}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
