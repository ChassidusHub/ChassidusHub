import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { browsableYears, currentParsha } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import catalog from '../catalog/data';
import { IL } from '../config';

interface Props {
  targetYear: number;
}

function formatToday(today: Date): string {
  return today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * The home screen: today's date and parsha up front, then one prominent
 * action - "This week's farbrengens" - straight into the nearest
 * kvius-matched year's current week (see kvius-engine's findMatchingYears,
 * "sorted nearest-first"), not a list of candidate years to choose from
 * first. Picking a *different* matched year (or browsing history freely)
 * is still there, just secondary - most visits are "what happened this
 * week," not "let me pick a year."
 */
export function YearPickerScreen({ targetYear }: Props) {
  const [tab, setTab] = useState<'kvius' | 'browse'>('kvius');

  // No range options: defaults to [MIN_HISTORICAL_YEAR, MAX_HISTORICAL_YEAR],
  // the real span of packages/mafteiach-index's crawled catalog - every
  // candidate offered here is a year that could actually have a recording,
  // not just a kvius-matched one with nothing behind it.
  const matches = findMatchingYears(targetYear);
  const allYears = browsableYears(catalog);
  const { parsha } = currentParsha(IL);
  const bestMatch = matches[0];

  return (
    <div className="screen">
      <div className="header-row">
        <h1>Sichos Kodesh</h1>
        <Link className="settings-link" to="/settings" aria-label="Settings">
          <Settings size={22} strokeWidth={2} />
        </Link>
      </div>
      <p className="subtitle">
        {formatToday(new Date())}
        {parsha ? ` · Parshas ${parsha.join('-')}` : ''}
      </p>

      {bestMatch && (
        <Link className="button hero-button" to={`/follow/${bestMatch.hebrewYear}`}>
          This week's farbrengens
        </Link>
      )}

      <div className="tabs">
        <button className={tab === 'kvius' ? 'tab tab-active' : 'tab'} onClick={() => setTab('kvius')}>
          Other kvius years
        </button>
        <button className={tab === 'browse' ? 'tab tab-active' : 'tab'} onClick={() => setTab('browse')}>
          Browse any year
        </button>
      </div>

      {tab === 'kvius' ? (
        <>
          <p className="tab-help">
            Kvius-matched years - the week/date structure lines up with {targetYear}, so "this week" resolves automatically. The nearest one is
            the shortcut above; pick a different one here if you want it instead.
          </p>
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
