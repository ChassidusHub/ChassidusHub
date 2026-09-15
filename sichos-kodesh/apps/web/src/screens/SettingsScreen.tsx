import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../settings/useTheme';
import type { Theme } from '../settings/useTheme';
import { useAutoplayOnHanacha } from '../settings/useAutoplayOnHanacha';
import { useLanguage, useTranslation } from '../i18n/useLanguage';
import type { Language } from '../i18n/translations';
import { BackLink } from '../components/BackLink';

export function SettingsScreen() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [theme, setTheme] = useTheme();
  const [autoplay, setAutoplay] = useAutoplayOnHanacha();

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
      <BackLink to="/" />
      <h1>{t.settingsTitle}</h1>

      <p className="category-header">{t.appearanceSection}</p>
      <ul className="year-list">
        {themeOptions.map((option) => (
          <li key={option.value}>
            <button className={theme === option.value ? 'year-row year-row-selected' : 'year-row'} onClick={() => setTheme(option.value)}>
              <span className="year-row-year">{option.label}</span>
              {theme === option.value && <Check size={18} className="year-row-distance" />}
            </button>
          </li>
        ))}
      </ul>

      <p className="category-header">{t.languageSection}</p>
      <ul className="year-list">
        {languageOptions.map((option) => (
          <li key={option.value}>
            <button className={language === option.value ? 'year-row year-row-selected' : 'year-row'} onClick={() => setLanguage(option.value)}>
              <span className="year-row-year">{option.label}</span>
              {language === option.value && <Check size={18} className="year-row-distance" />}
            </button>
          </li>
        ))}
      </ul>

      <p className="category-header">{t.playbackSection}</p>
      <ul className="year-list">
        <li>
          <button className={autoplay ? 'year-row year-row-selected' : 'year-row'} onClick={() => setAutoplay(!autoplay)}>
            <span className="year-row-year">{t.autoplayHanachaLabel}</span>
            {autoplay && <Check size={18} className="year-row-distance" />}
          </button>
        </li>
      </ul>

      <Link className="category-row" to="/settings/downloads">
        <span className="category-row-name">{t.downloadsLink}</span>
      </Link>

      <Link className="category-row" to="/about">
        <span className="category-row-name">{t.aboutLink}</span>
      </Link>
    </div>
  );
}
