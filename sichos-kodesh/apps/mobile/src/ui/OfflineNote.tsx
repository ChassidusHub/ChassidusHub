import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from './Text';
import { useColors } from './theme';
import { row } from './rtl';

/** Web: `.offline-note` - a plain, grey heads-up (deliberately not the danger color) describing the current offline state. */
export function OfflineNote({ text }: { text: string }) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  return (
    <View style={[styles.note, { backgroundColor: colors.cardHover, flexDirection: row(isRtl) }]}>
      <View style={styles.icon}>
        <WifiOff size={16} color={colors.muted} />
      </View>
      <AppText style={[styles.text, { color: colors.muted }]}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { alignItems: 'flex-start', gap: 8, marginVertical: 16, padding: 12, borderRadius: 8 },
  icon: { marginTop: 1 },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});
