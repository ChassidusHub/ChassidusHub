import { useTranslation } from '../i18n/useLanguage';
import { BackLink } from '../components/BackLink';

export function AboutScreen() {
  const { t } = useTranslation();

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
    </div>
  );
}
