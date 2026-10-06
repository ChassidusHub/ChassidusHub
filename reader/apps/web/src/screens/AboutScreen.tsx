import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, Headphones, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { READER_FONTS } from '@chassidushub-reader/app-core';
import { CATALOG_CHANGELOG } from '@chassidushub-reader/catalog';
import { useTranslation } from '../i18n/useLanguage';
import { ScreenHeader } from '../components/ScreenHeader';
import { APP_VERSION, CHANGELOG } from '../changelog';
import { useCatalogInfo } from '../catalog/catalogStore';
import { useCatalogUpdateStatus } from '../catalog/catalogUpdater';
import type { CatalogUpdateStatus } from '../catalog/catalogUpdater';
import { applyUpdate, checkForUpdate } from '../pwa/appUpdate';
import { useAppUpdate } from '../pwa/useAppUpdate';
import { fixHref } from '../components/FixLinks';

type Translation = ReturnType<typeof useTranslation>['t'];

/** What the automatic catalog check last found - the web has no button for it (see catalogUpdater.ts), only this line. */
function catalogStatusLine(t: Translation, status: CatalogUpdateStatus): string {
  switch (status.phase) {
    case 'checking':
      return t.catalogChecking;
    case 'downloading':
      return t.catalogDownloading(status.version);
    case 'updated':
      return t.catalogUpdated(status.version);
    case 'up-to-date':
      return t.catalogUpToDate;
    case 'error':
      return t.catalogUpdateFailed;
    default:
      return t.catalogAutoCheckNote;
  }
}

/** How long "you're up to date" stays visible after a manual check finds nothing new - a one-time confirmation, not an ongoing status (same pattern as ConnectivityBanner's "back online" message). */
const UP_TO_DATE_VISIBLE_MS = 4000;

export function AboutScreen() {
  const { t, language } = useTranslation();
  const latest = CHANGELOG[0];
  const { needsRefresh, checking } = useAppUpdate();
  const catalogInfo = useCatalogInfo();
  const catalogStatus = useCatalogUpdateStatus();
  // The bundled changelog only knows releases up to the one this build shipped with - a newer release fetched later shows its version, with the notes the bundled list has for it if any.
  const catalogNotes = CATALOG_CHANGELOG.find((entry) => entry.version === catalogInfo.version);
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
      <p className="subtitle">
        {t.aboutTextsBy}
        <strong>Sefaria</strong>
        {t.aboutTextsBySuffix}
      </p>
      <p className="subtitle">{t.aboutIgros}</p>
      <p className="subtitle">{t.aboutHebrewBooks}</p>

      <p className="category-header">{t.fixReport}</p>
      <a className="action-pill" href={fixHref('report', { app: true })} target="_blank" rel="noopener noreferrer">
        <Flag size={16} aria-hidden />
        <span>{t.fixReportApp}</span>
      </a>
      <p className="fix-links-help">{t.fixHelp}</p>

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

      <p className="category-header">{t.aboutFonts}</p>
      <p className="tab-help">{t.aboutFontsHelp}</p>
      <ul className="year-list">
        {READER_FONTS.filter((font) => font.family !== null).map((font) => (
          <li key={font.id}>
            <a className="year-row library-item-row" href={font.url} target="_blank" rel="noopener noreferrer">
              <span className="library-item-text">
                <span className="about-font-name" style={{ fontFamily: `'${font.family}', serif` }}>
                  {font.name[language]}
                </span>
                <span className="library-item-subtitle">{`${font.origin} · ${font.licence}`}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="tab-help">
        <a href="/fonts/reader/licences/README.txt" target="_blank" rel="noopener noreferrer">
          {t.aboutFontLicences}
        </a>
      </p>

      <div className="settings-link-list">
        <Link className="category-row settings-link-row" to="/privacy">
          <span className="category-row-name">{t.privacyLink}</span>
        </Link>
      </div>

      <p className="category-header">{t.aboutVersion(APP_VERSION)}</p>
      <p className="about-whats-new-title">{t.aboutWhatsNew}</p>
      <ul className="about-changelog">
        {(language === 'he' ? latest!.he : latest!.en).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <p className="category-header">{t.catalogVersion(catalogInfo.version)}</p>
      <p className="tab-help">{catalogInfo.source === 'bundled' ? t.catalogSourceBundled : t.catalogSourceUpdated}</p>
      {catalogNotes && (
        <>
          <p className="about-whats-new-title">{t.catalogWhatsNew}</p>
          <ul className="about-changelog">
            {(language === 'he' ? catalogNotes.he : catalogNotes.en).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      <p className="tab-help">{catalogStatusLine(t, catalogStatus)}</p>

      <p className="category-header">{t.aboutUpdateSection}</p>
      <ul className="year-list">
        {needsRefresh ? (
          <li className="settings-option-item">
            <button className="year-row settings-option-row" onClick={applyUpdate}>
              <span className="year-row-year">{t.aboutUpdateAvailable}</span>
              <span className="year-row-distance">{t.aboutRestartToUpdate}</span>
            </button>
          </li>
        ) : (
          <li className="settings-option-item">
            <button className="year-row settings-option-row" onClick={() => void checkForUpdate()} disabled={checking}>
              <span className="year-row-year">{checking ? t.aboutChecking : justConfirmedUpToDate ? t.aboutUpToDate : t.aboutCheckForUpdate}</span>
              {checking ? <Loader2 className="year-row-distance about-update-spinner" size={18} aria-hidden /> : <RefreshCw className="year-row-distance" size={18} aria-hidden />}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
