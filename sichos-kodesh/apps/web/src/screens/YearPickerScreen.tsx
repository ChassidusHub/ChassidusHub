import { useState } from 'react';
import { Link } from 'react-router-dom';
import { browsableYears } from '@sichos-kodesh/catalog';
import { findMatchingYears, kviusCode } from '@sichos-kodesh/kvius-engine';
import catalog from '../catalog/data';

interface Props {
  targetYear: number;
}

export function YearPickerScreen({ targetYear }: Props) {
  const [tab, setTab] = useState<'kvius' | 'browse'>('kvius');

  // No range options: defaults to [MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR],
  // the real span of packages/mafteiach-index's crawled catalog - every
  // candidate offered here is a year that could actually have a recording,
  // not just a kvius-matched one with nothing behind it.
  const matches = findMatchingYears(targetYear);
  const allYears = browsableYears(catalog);

  return (
    <div className="screen">
      <div className="header-row">
        <h1>Sichos Kodesh</h1>
        <Link className="settings-link" to="/settings" aria-label="Settings">
          ⚙
        </Link>
      </div>
      <p className="subtitle">
        Hebrew year {targetYear} (kvius {kviusCode(targetYear)})
      </p>

      <div className="tabs">
        <button className={tab === 'kvius' ? 'tab tab-active' : 'tab'} onClick={() => setTab('kvius')}>
          Follow along
        </button>
        <button className={tab === 'browse' ? 'tab tab-active' : 'tab'} onClick={() => setTab('browse')}>
          Browse any year
        </button>
      </div>

      {tab === 'kvius' ? (
        <>
          <p className="tab-help">Kvius-matched years - the week/date structure lines up with {targetYear}, so "this week" resolves automatically.</p>
          <ul className="year-list">
            {matches.map((item) => (
              <li key={item.hebrewYear}>
                <Link className="year-row" to={`/follow/${item.hebrewYear}`}>
                  <span className="year-row-year">{item.hebrewYear}</span>
                  <span className="year-row-distance">{item.distance} years ago</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="tab-help">Every year with something indexed - explore freely, no kvius match required.</p>
          <ul className="year-list">
            {allYears.map((year) => (
              <li key={year}>
                <Link className="year-row" to={`/browse/${year}`}>
                  <span className="year-row-year">{year}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
