import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Bell, CalendarDays, CloudDownload } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from '../i18n/useTranslation';
import { Button } from '../ui/Button';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row, textAlign } from '../ui/rtl';

interface Props {
  visible: boolean;
  /** Online, downloads finishing is one of the things told; offline, nothing downloads. */
  online: boolean;
  onAllow: () => void;
  onLater: () => void;
}

/**
 * The app's own word before the phone's question about notifications
 * (useNotificationInvite): what it would tell and when, then Allow - which
 * brings up the phone's question - or Not now.
 */
export function NotificationInvite({ visible, online, onAllow, onLater }: Props) {
  const { t, isRtl } = useTranslation();
  const colors = useColors();
  const align = { textAlign: textAlign(isRtl) } as const;

  const item = (Icon: LucideIcon, label: string, help: string) => (
    <View key={label} style={[styles.item, { flexDirection: row(isRtl) }]}>
      <Icon size={20} color={colors.accent} style={styles.itemIcon} />
      <View style={styles.itemText}>
        <AppText style={[styles.itemLabel, align, { color: colors.fg }]}>{label}</AppText>
        <AppText style={[styles.itemHelp, align, { color: colors.muted }]}>{help}</AppText>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.bgElevated, borderColor: colors.border }]} accessibilityViewIsModal>
          <View style={[styles.well, { backgroundColor: colors.cardBg }]}>
            <Bell size={26} color={colors.accent} />
          </View>
          <AppText style={[styles.title, { color: colors.fg }]}>{t.notifyInviteTitle}</AppText>
          <AppText style={[styles.lead, align, { color: colors.muted }]}>{t.notifyInviteLead}</AppText>
          <View style={styles.items}>
            {item(CalendarDays, t.notifyNewWeekLabel, t.notifyNewWeekHelp)}
            {online && item(CloudDownload, t.notifyDownloadsReadyLabel, t.notifyInviteDownloadsHelp)}
          </View>
          <Button label={t.notifyInviteAllow} onPress={onAllow} style={styles.allow} />
          <Pressable accessibilityRole="button" onPress={onLater} style={styles.later} hitSlop={6}>
            <AppText style={[styles.laterText, { color: colors.muted }]}>{t.notifyInviteLater}</AppText>
          </Pressable>
          <AppText style={[styles.footnote, { color: colors.muted }]}>{t.notifyInviteFootnote}</AppText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 14, alignItems: 'stretch' },
  well: { alignSelf: 'center', width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 14 },
  items: { gap: 14, marginBottom: 20 },
  item: { alignItems: 'flex-start', gap: 12 },
  itemIcon: { marginTop: 2 },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  itemLabel: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  itemHelp: { fontSize: 14, lineHeight: 20 },
  allow: { marginBottom: 0 },
  later: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  laterText: { fontSize: 15, fontWeight: '600' },
  footnote: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
