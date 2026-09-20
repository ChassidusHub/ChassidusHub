import React from 'react';
import { Share } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { WEB_APP_BASE_URL } from '../config';
import { useTranslation } from '../i18n/useTranslation';
import { AppButton } from '../ui/AppButton';

interface Props {
  title: string;
  hebrewYear: number;
  occasionId: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shares a link to this occasion's page on the web PWA
 * (WEB_APP_BASE_URL + /browse/:hebrewYear/:occasionId - the one canonical,
 * kind-independent URL every occasion has there, same one SearchScreen and
 * DownloadedScreen link through on web regardless of how you found it).
 * Mirrors apps/web's ShareButton.tsx, using RN's built-in Share API instead
 * of the Web Share API.
 */
export function ShareButton({ title, hebrewYear, occasionId, style }: Props) {
  const { t } = useTranslation();
  const url = `${WEB_APP_BASE_URL}/browse/${hebrewYear}/${occasionId}`;

  function handleShare(): void {
    Share.share({ message: `${title}\n${url}`, url, title }).catch(() => undefined);
  }

  return <AppButton label={t.shareLabel} variant="ghost" style={style} onPress={handleShare} />;
}
