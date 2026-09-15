import { Headphones, KeyRound } from 'lucide-react';
import { useTranslation } from '../i18n/useLanguage';
import { BackLink } from '../components/BackLink';
import { APP_VERSION, CHANGELOG } from '../changelog';

export function AboutScreen() {
  const { t, language } = useTranslation();
  const latest = CHANGELOG[0];

  return (
    <div className="screen">
      <BackLink to="/settings" />
      <h1>{t.aboutTitle}</h1>
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
    </div>
  );
}
