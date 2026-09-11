import { useMemo } from 'react';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OccasionDetail } from '../components/OccasionDetail';

interface Props {
  sourceYear: number;
  onBack: () => void;
}

export function ThisWeekScreen({ sourceYear, onBack }: Props) {
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog), [sourceYear]);

  return (
    <div className="screen">
      <button className="back-link" onClick={onBack}>
        {'< change year'}
      </button>
      <h1>This week</h1>
      <p className="subtitle">From Hebrew year {sourceYear}</p>

      {occasions.length === 0 && (
        <p className="gap-message">Nothing indexed for this week in {sourceYear} or nearby kvius-matched years.</p>
      )}

      {occasions.map(({ entry, gregorianDate }) => (
        <div key={entry.occasionId}>
          <h2 className="section-header">
            {entry.occasionLabel} <span className="subtitle">({gregorianDate})</span>
          </h2>
          <OccasionDetail entry={entry} />
        </div>
      ))}
    </div>
  );
}
