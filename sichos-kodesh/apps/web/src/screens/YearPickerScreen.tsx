import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { currentParsha, todayHebrewDateLabel } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { IL } from '../config';
import { parshaLabel } from '../utils/formatHebrewDate';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  targetYear: number;
}

/**
 * The home screen: today's real Hebrew date and parsha up front, then one
 * prominent action into the kvius-matched years list (KviusYearsScreen) -
 * picking one there goes straight into that year's current week, same as
 * before. "Browse any year" is a plain secondary link now, not a second
 * tab competing for attention on first load.
 */
export function YearPickerScreen({ targetYear }: Props) {
  const { t, language } = useTranslation();
  const bestMatch = findMatchingYears(targetYear)[0];
  const { parsha } = currentParsha(IL);
  const hebrewDate = todayHebrewDateLabel();

  return (
    <div className="screen">
      <div className="header-row">
        <h1>{t.appTitle}</h1>
        <Link className="settings-link" to="/settings" aria-label={t.settingsLabel}>
          <Settings size={22} strokeWidth={2} />
        </Link>
      </div>
      <p className="subtitle">
        {hebrewDate}
        {parsha ? ` · ${parshaLabel(parsha, language)}` : ''}
      </p>

      {bestMatch && (
        <Link className="button hero-button" to="/kvius">
          {t.weekKviusFarbrengens}
        </Link>
      )}

      <Link className="category-row" to="/this-week-all-years">
        <span className="category-row-name">{t.allFarbrengensThisWeek}</span>
      </Link>

      <Link className="category-row" to="/years">
        <span className="category-row-name">{t.browseAnyYear}</span>
      </Link>
    </div>
  );
}
