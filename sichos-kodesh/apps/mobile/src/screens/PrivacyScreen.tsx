import React from 'react';
import { useTranslation } from '../i18n/useTranslation';
import type { PrivacyScreenProps } from '../navigation/types';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { CategoryHeader, Subtitle } from '../ui/Typography';

/** Web: `/privacy`. */
export function PrivacyScreen(_: PrivacyScreenProps) {
  const { t } = useTranslation();

  return (
    <Screen header={<ScreenHeader back={{ name: 'About', params: undefined }} title={t.privacyTitle} />}>
      <Subtitle>{t.privacyLastUpdated}</Subtitle>

      <CategoryHeader>{t.privacyNoAccountsTitle}</CategoryHeader>
      <Subtitle>{t.privacyNoAccountsBody}</Subtitle>

      <CategoryHeader>{t.privacyOnDeviceTitle}</CategoryHeader>
      <Subtitle>{t.privacyOnDeviceBody}</Subtitle>

      <CategoryHeader>{t.privacyAnalyticsTitle}</CategoryHeader>
      <Subtitle>{t.privacyAnalyticsBody}</Subtitle>

      <CategoryHeader>{t.privacyContentTitle}</CategoryHeader>
      <Subtitle>{t.privacyContentBody}</Subtitle>
    </Screen>
  );
}
