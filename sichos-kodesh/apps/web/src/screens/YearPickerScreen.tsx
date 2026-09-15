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

      {/* Browsing/search read from the bundled catalog with no network
          needed, and already-cached content still opens offline - only
          content that was never downloaded needs a connection. */}
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
