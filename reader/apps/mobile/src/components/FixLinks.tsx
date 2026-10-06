import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Flag, PenLine } from 'lucide-react-native';
import { fixLinkUrl, type FixAction, type FixTarget } from '@chassidushub-reader/app-core';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row, textAlign } from '../ui/rtl';
import { APP_VERSION } from '../version';

/** Opens ChassidusHub's site for `action` on `target` (app-core's fixLinks.ts); the app's version goes along. */
export function openFixLink(action: FixAction, target: FixTarget): void {
  Linking.openURL(fixLinkUrl(action, target, { version: APP_VERSION, platform: 'android' })).catch(() => undefined);
}

/**
 * "Suggest a fix" and "Report a problem" at the foot of a farbrengen or a
 * sefer: the catalog is ChassidusHub's, so both open its site on this item,
 * where people sign in and suggest. Quiet on purpose, under everything the
 * page is for.
 */
export function FixLinks({ target }: { target: FixTarget }) {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const link = (action: FixAction, Icon: typeof Flag, label: string) => (
    <Pressable
      key={action}
      accessibilityRole="link"
      onPress={() => openFixLink(action, target)}
      hitSlop={6}
      style={({ pressed }) => [styles.link, { flexDirection: row(isRtl), borderColor: colors.border, backgroundColor: pressed ? colors.cardBg : colors.bg }]}
    >
      <Icon size={16} color={colors.muted} />
      <AppText style={[styles.label, { color: colors.fg }]}>{label}</AppText>
    </Pressable>
  );
  return (
    <View style={styles.wrap}>
      <View style={[styles.links, { flexDirection: row(isRtl) }]}>
        {link('edit', PenLine, t.fixSuggest)}
        {link('report', Flag, t.fixReport)}
      </View>
      <AppText style={[styles.help, { color: colors.muted, textAlign: textAlign(isRtl) }]}>{t.fixHelp}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24, gap: 8 },
  links: { flexWrap: 'wrap', gap: 10 },
  link: { alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 14, fontWeight: '600' },
  help: { fontSize: 13, lineHeight: 18 },
});
