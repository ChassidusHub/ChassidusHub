import { Link } from 'react-router-dom';
import { Search, Settings, WifiOff } from 'lucide-react';
import { currentParsha, todayHebrewDateLabel } from '@sichos-kodesh/catalog';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { IL } from '../config';
import { ContinueSection } from '../components/ContinueSection';
import { parshaLabel } from '../utils/formatHebrewDate';
import { useOnlineStatus } from '../network/useOnlineStatus';
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
  const online = useOnlineStatus();
  const bestMatch = findMatchingYears(targetYear)[0];
  const { parsha } = currentParsha(IL);
  const hebrewDate = todayHebrewDateLabel();

  return (
    <div className="screen">
      <div className="header-row">
        <h1>{t.appTitle}</h1>
        <div className="header-row-actions">
          <Link className="settings-link" to="/search" aria-label={t.searchLink}>
            <Search size={22} strokeWidth={2} />
          </Link>
          <Link className="settings-link" to="/settings" aria-label={t.settingsLabel}>
            <Settings size={22} strokeWidth={2} />
          </Link>
        </div>
      </div>
      <p className="subtitle">
        {hebrewDate}
        {parsha ? ` · ${parshaLabel(parsha, language)}` : ''}
      </p>

      {/* Browsing/search both read straight from the bundled catalog data
          (no network needed at all) and content already in the media
          cache still opens fine offline - only content that was never
          downloaded actually needs a connection. This note (and its
          shortcut to what's actually available right now) only makes
          sense to show once there's no connection to begin with. */}
      {!online && (
        <p className="offline-note">
          <WifiOff size={16} aria-hidden />
          <span>{t.offlineNote}</span>
        </p>
      )}
      {!online && (
        <Link className="category-row" to="/downloaded">
          <span className="category-row-name">{t.viewDownloadedLabel}</span>
        </Link>
      )}

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

      <ContinueSection />
    </div>
  );
}
