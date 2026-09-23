import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Wifi, WifiOff } from 'lucide-react-native';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useTranslation } from '../i18n/useTranslation';
import { navigateTo } from '../navigation/navigationRef';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row } from '../ui/rtl';

/** How long the green "back online" confirmation stays up before clearing itself. */
const BACK_ONLINE_VISIBLE_MS = 5000;

/** Whether the banner currently occupies space - App.tsx needs this to hand the status-bar inset to the banner instead of the screen below it. */
export function useConnectivityBannerVisible(): boolean {
  const online = useOnlineStatus();
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOnlineRef = useRef(online);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = online;
    if (online && !wasOnline) {
      setJustReconnected(true);
      const timer = setTimeout(() => setJustReconnected(false), BACK_ONLINE_VISIBLE_MS);
      return () => clearTimeout(timer);
    }
  }, [online]);

  return !online || justReconnected;
}

interface Props {
  visible: boolean;
  /** The status-bar inset the banner absorbs while it's shown (see App.tsx). */
  topInset: number;
}

/** A slim strip at the very top of the app reflecting overall connectivity - visible from any screen. Grey while offline (a plain heads-up, not an error), green for a moment on reconnecting. */
export function ConnectivityBanner({ visible, topInset }: Props) {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const online = useOnlineStatus();

  if (!visible) return null;

  if (!online) {
    return (
      <Pressable
        onPress={() => navigateTo('Downloaded', undefined)}
        accessibilityRole="button"
        style={[styles.banner, { backgroundColor: colors.cardHover, paddingTop: 10 + topInset, flexDirection: row(isRtl) }]}
      >
        <WifiOff size={16} color={colors.muted} />
        <AppText style={[styles.text, { color: colors.muted }]}>{t.connectivityOffline}</AppText>
      </Pressable>
    );
  }

  return (
    <View style={[styles.banner, { backgroundColor: colors.accent, paddingTop: 10 + topInset, flexDirection: row(isRtl) }]}>
      <Wifi size={16} color={colors.accentFg} />
      <AppText style={[styles.text, { color: colors.accentFg }]}>{t.connectivityBackOnline}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Web: `.connectivity-banner` - centered row, gap 8, padding 10px 16px, 13px/600. */
  banner: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 10, paddingHorizontal: 16 },
  text: { fontSize: 13, fontWeight: '600' },
});
