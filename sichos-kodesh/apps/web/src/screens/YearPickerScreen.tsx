import { findMatchingYears, kviusCode } from '@sichos-kodesh/kvius-engine';

interface Props {
  targetYear: number;
  onSelectYear: (hebrewYear: number) => void;
}

export function YearPickerScreen({ targetYear, onSelectYear }: Props) {
  // No range options: defaults to [MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR],
  // the real span of packages/mafteiach-index's crawled catalog - every
  // candidate offered here is a year that could actually have a recording,
  // not just a kvius-matched one with nothing behind it.
  const matches = findMatchingYears(targetYear);

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
