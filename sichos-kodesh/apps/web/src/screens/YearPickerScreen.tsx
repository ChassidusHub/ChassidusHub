import { findMatchingYears, kviusCode } from '@sichos-kodesh/kvius-engine';

interface Props {
  targetYear: number;
  onSelectYear: (hebrewYear: number) => void;
}

const MATCH_RANGE_YEARS = 120;

export function YearPickerScreen({ targetYear, onSelectYear }: Props) {
  const matches = findMatchingYears(targetYear, { fromYear: targetYear - MATCH_RANGE_YEARS, toYear: targetYear });

  return (
    <div className="screen">
      <h1>Follow along with...</h1>
      <p className="subtitle">
        Hebrew year {targetYear} (kvius {kviusCode(targetYear)})
      </p>
      <ul className="year-list">
        {matches.map((item) => (
          <li key={item.hebrewYear}>
            <button className="year-row" onClick={() => onSelectYear(item.hebrewYear)}>
              <span className="year-row-year">{item.hebrewYear}</span>
              <span className="year-row-distance">{item.distance} years ago</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
