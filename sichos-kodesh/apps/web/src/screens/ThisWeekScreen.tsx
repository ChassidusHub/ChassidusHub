import { useMemo, useState } from 'react';
import { resolveThisWeek } from '@sichos-kodesh/catalog';
import type { CatalogPdf, WeekOccasion } from '@sichos-kodesh/catalog';
import catalog from '../catalog/data';
import { OccasionDetail } from '../components/OccasionDetail';
import { PdfViewerScreen } from './PdfViewerScreen';

interface Props {
  sourceYear: number;
  onBack: () => void;
}

export function ThisWeekScreen({ sourceYear, onBack }: Props) {
  const occasions = useMemo(() => resolveThisWeek(sourceYear, catalog), [sourceYear]);
  const [selected, setSelected] = useState<WeekOccasion | null>(null);
  const [viewingPdf, setViewingPdf] = useState<CatalogPdf | null>(null);

  if (selected && viewingPdf) {
    return <PdfViewerScreen key={viewingPdf.driveFileId} entry={selected.entry} pdf={viewingPdf} onBack={() => setViewingPdf(null)} />;
  }

  if (selected) {
    return (
      <div className="screen">
        <button className="back-link" onClick={() => setSelected(null)}>
          {'< back to this week'}
        </button>
        <h1>{selected.entry.occasionLabel}</h1>
        <p className="subtitle">{selected.gregorianDate}</p>
        <OccasionDetail key={selected.entry.occasionId} entry={selected.entry} onOpenPdf={setViewingPdf} />
      </div>
    );
  }

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

      <ul className="year-list">
        {occasions.map((occasion) => (
          <li key={occasion.entry.occasionId}>
            <button className="year-row" onClick={() => setSelected(occasion)}>
              <span className="year-row-year">{occasion.entry.occasionLabel}</span>
              <span className="year-row-distance">{occasion.gregorianDate}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
