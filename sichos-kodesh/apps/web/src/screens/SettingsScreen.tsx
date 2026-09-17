import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../settings/useTheme';
import type { Theme } from '../settings/useTheme';
import { useAutoplayOnHanacha } from '../settings/useAutoplayOnHanacha';
import { useInvertPdfInDarkMode } from '../settings/useInvertPdfInDarkMode';
import { useLanguage, useTranslation } from '../i18n/useLanguage';
import type { Language } from '../i18n/translations';
import { OverflowMarquee } from '../components/OverflowMarquee';
import { ScreenHeader } from '../components/ScreenHeader';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [theme, setTheme] = useTheme();
  const [autoplay, setAutoplay] = useAutoplayOnHanacha();
  const [invertPdf, setInvertPdf] = useInvertPdfInDarkMode();

  const themeOptions: Array<{ value: Theme; label: string }> = [
    { value: 'dark', label: t.themeDark },
    { value: 'light', label: t.themeLight },
    { value: 'system', label: t.themeSystem },
  ];
  const languageOptions: Array<{ value: Language; label: string }> = [
    { value: 'en', label: t.languageEnglish },
    { value: 'he', label: t.languageHebrew },
  ];

  return (
    <div className="screen">
      <ScreenHeader to="/" title={t.settingsTitle} />

      <p className="category-header">{t.appearanceSection}</p>
      <ul className="year-list">
        {themeOptions.map((option) => (
          <li key={option.value} className="settings-option-item">
            <button
              className={theme === option.value ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
              onClick={() => setTheme(option.value)}
            >
              <OverflowMarquee className="year-row-year settings-option-label" text={option.label} />
              <span className="settings-option-end-slot">{theme === option.value && <Check size={18} className="year-row-distance" />}</span>
            </button>
          </li>
        ))}
      </ul>

      <ul className="year-list">
        <li className="settings-option-item">
          <button
            className={invertPdf ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
            onClick={() => setInvertPdf(!invertPdf)}
          >
            <OverflowMarquee className="year-row-year settings-option-label" text={t.invertPdfDarkModeLabel} />
            <span className="settings-option-end-slot">{invertPdf && <Check size={18} className="year-row-distance" />}</span>
          </button>
        </li>
      </ul>

      <p className="category-header">{t.languageSection}</p>
      <ul className="year-list">
        {languageOptions.map((option) => (
          <li key={option.value} className="settings-option-item">
            <button
              className={language === option.value ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
              onClick={() => setLanguage(option.value)}
            >
              <OverflowMarquee className="year-row-year settings-option-label" text={option.label} />
              <span className="settings-option-end-slot">{language === option.value && <Check size={18} className="year-row-distance" />}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="category-header">{t.playbackSection}</p>
      <ul className="year-list">
        <li className="settings-option-item">
          <button
            className={autoplay ? 'year-row settings-option-row year-row-selected' : 'year-row settings-option-row'}
            onClick={() => setAutoplay(!autoplay)}
          >
            <OverflowMarquee className="year-row-year settings-option-label" text={t.autoplayHanachaLabel} />
            <span className="settings-option-end-slot">{autoplay && <Check size={18} className="year-row-distance" />}</span>
          </button>
        </li>
      </ul>
      <p className="tab-help">{t.autoplayHanachaHelp}</p>

      <div className="settings-link-list">
        <Link className="category-row settings-link-row" to="/downloaded">
          <span className="category-row-name">{t.viewDownloadedLabel}</span>
        </Link>

        <Link className="category-row settings-link-row" to="/settings/downloads">
          <span className="category-row-name">{t.downloadsLink}</span>
        </Link>

        <Link className="category-row settings-link-row" to="/about">
          <span className="category-row-name">{t.aboutLink}</span>
        </Link>
      </div>
    </div>
  );
}
