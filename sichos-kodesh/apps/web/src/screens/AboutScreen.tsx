import { useEffect, useRef, useState } from 'react';
import { Headphones, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from '../i18n/useLanguage';
import { ScreenHeader } from '../components/ScreenHeader';
import { APP_VERSION, CHANGELOG } from '../changelog';
import { applyUpdate, checkForUpdate } from '../pwa/appUpdate';
import { useAppUpdate } from '../pwa/useAppUpdate';

/** How long "you're up to date" stays visible after a manual check finds nothing new - a one-time confirmation, not an ongoing status (same pattern as ConnectivityBanner's "back online" message). */
const UP_TO_DATE_VISIBLE_MS = 4000;

export function AboutScreen() {
  const { t, language } = useTranslation();
  const latest = CHANGELOG[0];
  const { needsRefresh, checking } = useAppUpdate();
  const [justConfirmedUpToDate, setJustConfirmedUpToDate] = useState(false);
  const wasCheckingRef = useRef(checking);

  useEffect(() => {
    const wasChecking = wasCheckingRef.current;
    wasCheckingRef.current = checking;
    if (wasChecking && !checking && !needsRefresh) {
      setJustConfirmedUpToDate(true);
      const timer = setTimeout(() => setJustConfirmedUpToDate(false), UP_TO_DATE_VISIBLE_MS);
      return () => clearTimeout(timer);
    }
  }, [checking, needsRefresh]);

  return (
    <div className="screen">
      <ScreenHeader to="/settings" title={t.aboutTitle} />
      <p className="subtitle">
        {t.aboutIndexedBy}
        <strong>mafteiach.app</strong>
        {t.aboutIndexedBySuffix}
      </p>
      <p className="subtitle">
        {t.aboutAudioBy}
        <strong>JEM</strong>
        {t.aboutAudioBySuffix}
      </p>

      <p className="category-header">{t.aboutPoweredBy}</p>
      <div className="about-badges">
        <a className="about-badge" href="https://mafteiach.app" target="_blank" rel="noopener noreferrer">
          <span className="about-badge-icon">
            <KeyRound size={20} />
          </span>
          <span className="about-badge-text">
            <span className="about-badge-eyebrow">{t.aboutMafteiachBadgeEyebrow}</span>
            <span className="about-badge-name">{t.aboutMafteiachBadgeName}</span>
          </span>
        </a>
        <a className="about-badge" href="https://ashreinu.app" target="_blank" rel="noopener noreferrer">
          <span className="about-badge-icon">
            <Headphones size={20} />
          </span>
          <span className="about-badge-text">
            <span className="about-badge-eyebrow">{t.aboutAshreinuBadgeEyebrow}</span>
            <span className="about-badge-name">{t.aboutAshreinuBadgeName}</span>
          </span>
        </a>
      </div>

      <p className="category-header">{t.aboutVersion(APP_VERSION)}</p>
      <p className="about-whats-new-title">{t.aboutWhatsNew}</p>
      <ul className="about-changelog">
        {(language === 'he' ? latest!.he : latest!.en).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <p className="category-header">{t.aboutUpdateSection}</p>
      <ul className="year-list">
        {needsRefresh ? (
          <li>
            <button className="year-row" onClick={applyUpdate}>
              <span className="year-row-year">{t.aboutUpdateAvailable}</span>
              <span className="year-row-distance">{t.aboutRestartToUpdate}</span>
            </button>
          </li>
        ) : (
          <li>
            <button className="year-row" onClick={() => void checkForUpdate()} disabled={checking}>
              <span className="year-row-year">{checking ? t.aboutChecking : justConfirmedUpToDate ? t.aboutUpToDate : t.aboutCheckForUpdate}</span>
              {checking ? <Loader2 className="year-row-distance about-update-spinner" size={18} aria-hidden /> : <RefreshCw className="year-row-distance" size={18} aria-hidden />}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
