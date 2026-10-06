import { useTranslation } from '../i18n/useLanguage';
import { ScreenHeader } from '../components/ScreenHeader';

export function PrivacyScreen() {
  const { t } = useTranslation();

  return (
    <div className="screen">
      <ScreenHeader to="/about" title={t.privacyTitle} />
      <p className="subtitle">{t.privacyLastUpdated}</p>

      <p className="category-header">{t.privacyNoAccountsTitle}</p>
      <p className="subtitle">{t.privacyNoAccountsBody}</p>

      <p className="category-header">{t.privacyOnDeviceTitle}</p>
      <p className="subtitle">{t.privacyOnDeviceBody}</p>

      <p className="category-header">{t.privacyAnalyticsTitle}</p>
      <p className="subtitle">{t.privacyAnalyticsBody}</p>

      <p className="category-header">{t.privacyContentTitle}</p>
      <p className="subtitle">{t.privacyContentBody}</p>
    </div>
  );
}
