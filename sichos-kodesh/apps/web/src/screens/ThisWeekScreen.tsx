import { useMemo } from 'react';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import { IL } from '../config';
import catalog from '../catalog/data';
import { OccasionDetail } from '../components/OccasionDetail';

interface Props {
  targetYear: number;
  sourceYear: number;
  onBack: () => void;
}

export function ThisWeekScreen({ targetYear, sourceYear, onBack }: Props) {
  const occasion = useMemo(() => resolveThisWeek(targetYear, sourceYear, IL, catalog), [targetYear, sourceYear]);

  return (
    <div className="screen">
      <button className="back-link" onClick={onBack}>
        {'< change year'}
      </button>
      <h1>{occasion.label}</h1>
      <p className="subtitle">{occasion.gregorianDate}</p>

      {occasion.resolution.status === 'gap' && (
        <p className="gap-message">Nothing indexed for this occasion in {sourceYear} or nearby kvius-matched years.</p>
      )}

      {occasion.entry && (
        <>
          <p className="section-header">From Hebrew year {occasion.resolution.resolvedYear}</p>
          <OccasionDetail key={occasion.entry.occasionId} entry={occasion.entry} />
        </>
      )}
    </div>
  );
}
