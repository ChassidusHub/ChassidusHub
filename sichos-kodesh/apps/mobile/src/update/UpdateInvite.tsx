import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import type { AppReleaseFile, LatestAppRelease } from '@sichos-kodesh/app-core';
import { useTranslation } from '../i18n/useTranslation';
import { Button } from '../ui/Button';
import { AppText } from '../ui/Text';
import { useColors } from '../ui/theme';
import { row, textAlign } from '../ui/rtl';
import { formatBytes } from '../utils/formatBytes';
import { APP_VERSION } from '../version';

interface Props {
  visible: boolean;
  release: LatestAppRelease | null;
  file: AppReleaseFile | null;
  onUpdate: () => void;
  onLater: () => void;
}

/** Shown notes: the first few lines of the version's changelog entry, in the app's language. */
const NOTES_SHOWN = 3;

/**
 * "A new version of the app": which one, what is new in it, and Update -
 * which downloads this phone's APK in the browser - or Later
 * (useAppUpdatePrompt). Same card as the notification invite.
 */
export function UpdateInvite({ visible, release, file, onUpdate, onLater }: Props) {
  const { t, language, isRtl } = useTranslation();
  const colors = useColors();
  const align = { textAlign: textAlign(isRtl) } as const;
  const notes = release ? (language === 'he' && release.notes.he.length > 0 ? release.notes.he : release.notes.en).slice(0, NOTES_SHOWN) : [];

  return (
    <Modal visible={visible && !!release && !!file} transparent animationType="fade" onRequestClose={onLater} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.bgElevated, borderColor: colors.border }]} accessibilityViewIsModal>
          <View style={[styles.well, { backgroundColor: colors.cardBg }]}>
            <Sparkles size={26} color={colors.accent} />
          </View>
          <AppText style={[styles.title, { color: colors.fg }]}>{t.updateInviteTitle}</AppText>
          {release && <AppText style={[styles.lead, align, { color: colors.muted }]}>{t.updateInviteLead(release.version, APP_VERSION)}</AppText>}
          {notes.length > 0 && (
            <View style={styles.notes}>
              <AppText style={[styles.notesTitle, align, { color: colors.fg }]}>{t.updateInviteWhatsNew}</AppText>
              {notes.map((line) => (
                <View key={line} style={[styles.note, { flexDirection: row(isRtl) }]}>
                  <AppText style={[styles.bullet, { color: colors.accent }]}>•</AppText>
                  <AppText style={[styles.noteText, align, { color: colors.muted }]} numberOfLines={3}>
                    {line}
                  </AppText>
                </View>
              ))}
            </View>
          )}
          {file && <Button label={t.updateInviteUpdate(formatBytes(file.bytes))} onPress={onUpdate} />}
          <Pressable accessibilityRole="button" onPress={onLater} style={styles.later} hitSlop={6}>
            <AppText style={[styles.laterText, { color: colors.muted }]}>{t.updateInviteLater}</AppText>
          </Pressable>
          <AppText style={[styles.footnote, { color: colors.muted }]}>{t.updateInviteFootnote}</AppText>
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
  notes: { gap: 6, marginBottom: 18 },
  notesTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  note: { alignItems: 'flex-start', gap: 8 },
  bullet: { fontSize: 15, lineHeight: 20 },
  noteText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20 },
  later: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  laterText: { fontSize: 15, fontWeight: '600' },
  footnote: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
