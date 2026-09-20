import React from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { WEB_APP_BASE_URL } from '../config';
import { useTranslation } from '../i18n/useTranslation';
import type { AboutScreenProps } from '../navigation/types';
import { APP_VERSION } from '../version';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SectionLabel } from '../ui/SectionLabel';
import { spacing } from '../ui/theme';

/** Same two credit links as apps/web/src/screens/AboutScreen.tsx. */
const MAFTEIACH_URL = 'https://mafteiach.app';
const ASHREINU_URL = 'https://ashreinu.app';

export function AboutScreen({ navigation }: AboutScreenProps) {
  const { t, isRtl } = useTranslation();

  return (
    <Screen>
      <ScreenHeader title={t.aboutTitle} onBack={() => navigation.goBack()} backLabel={t.back} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="bodyMedium" style={isRtl && styles.textRight}>
          {t.aboutIndexedBy}
          <AppText variant="bodyMedium" style={styles.bold}>
            mafteiach.app
          </AppText>
          {t.aboutIndexedBySuffix}
        </AppText>
        <AppText variant="bodyMedium" style={isRtl && styles.textRight}>
          {t.aboutAudioBy}
          <AppText variant="bodyMedium" style={styles.bold}>
            JEM
          </AppText>
          {t.aboutAudioBySuffix}
        </AppText>

        <SectionLabel label={t.aboutPoweredBy} />
        <View style={styles.cardWrap}>
          <Card style={styles.cardReset}>
            <ListRow
              label={t.aboutMafteiachBadgeName}
              sublabel={t.aboutMafteiachBadgeEyebrow}
              right={<AppText color="muted">›</AppText>}
              onPress={() => { Linking.openURL(MAFTEIACH_URL).catch(() => undefined); }}
            />
            <RowSeparator />
            <ListRow
              label={t.aboutAshreinuBadgeName}
              sublabel={t.aboutAshreinuBadgeEyebrow}
              right={<AppText color="muted">›</AppText>}
              onPress={() => { Linking.openURL(ASHREINU_URL).catch(() => undefined); }}
            />
          </Card>
        </View>

        <View style={styles.cardWrap}>
          <Card style={styles.cardReset}>
            <ListRow
              label={t.privacyLink}
              right={<AppText color="muted">›</AppText>}
              onPress={() => { Linking.openURL(`${WEB_APP_BASE_URL}/privacy`).catch(() => undefined); }}
            />
          </Card>
        </View>

        <SectionLabel label={t.aboutVersion(APP_VERSION)} />
        <AppText variant="bodySmall" color="muted" style={[styles.whatsNewTitle, isRtl && styles.textRight]}>
          {t.aboutWhatsNew}
        </AppText>
        <AppText variant="bodyMedium" style={isRtl && styles.textRight}>
          {t.aboutInitialRelease}
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  textRight: { textAlign: 'right' },
  bold: { fontWeight: '700' },
  cardWrap: { marginBottom: spacing.sm },
  cardReset: { paddingVertical: 0, paddingHorizontal: 0 },
  whatsNewTitle: { marginTop: -spacing.xs },
});
