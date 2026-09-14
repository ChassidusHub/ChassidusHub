import { useTranslation } from '../i18n/useLanguage';
import { BackLink } from '../components/BackLink';

/**
 * Credits the two real, independent sources this whole app is built on
 * top of (see packages/mafteiach-index and packages/jem-index's own
 * READMEs) - every occasion, date, and PDF citation comes from
 * mafteiach.app's crawled index, and every recording is JEM's own,
 * fetched from their CloudFront-hosted archive (proxied through
 * services/media-proxy so this app's own domain is what a user ever
 * actually sees, not a source site's URL).
 */
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
