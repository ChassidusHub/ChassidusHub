import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { PdfEdition } from '@sichos-kodesh/catalog';
import { useTranslation } from '../i18n/useTranslation';
import type { DownloadSettingsScreenProps } from '../navigation/types';
import { useDownload } from '../download/useDownload';
import { getDownloadStorageUsage } from '../download/downloadStorage';
import catalog from '../catalog/data';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { ListRow, RowSeparator } from '../ui/ListRow';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SectionLabel } from '../ui/SectionLabel';
import { colors, spacing } from '../ui/theme';

const ALL_ENTRIES = Object.values(catalog).flat();
const HANACHA_EDITIONS: PdfEdition[] = ['sichosKodesh', 'torasMenachem'];
const OTHER_SECTIONS: Array<'mugah' | 'maamorim' | 'hagahos' | 'hosofos'> = ['mugah', 'maamorim', 'hagahos', 'hosofos'];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadSettingsScreen({ navigation }: DownloadSettingsScreenProps) {
  const { t } = useTranslation();
  const { settings, setSettings, clearDownloads, hydrated } = useDownload();
  const [usage, setUsage] = useState<number | null>(null);

  useEffect(() => {
    getDownloadStorageUsage(ALL_ENTRIES).then(setUsage).catch(() => setUsage(null));
  }, [hydrated, settings]);

  const editionOptions = useMemo(
    () => HANACHA_EDITIONS.map((edition) => ({ edition, label: edition === 'sichosKodesh' ? t.sichosKodeshEditionLabel : t.torasMenachemEditionLabel })),
    [t],
  );

  function toggleEdition(edition: PdfEdition): void {
    const included = settings.contentTypes.hanachaEditions.includes(edition);
    setSettings({
      ...settings,
      contentTypes: {
        ...settings.contentTypes,
        hanachaEditions: included ? settings.contentTypes.hanachaEditions.filter((value) => value !== edition) : [...settings.contentTypes.hanachaEditions, edition],
      },
    });
  }

  return (
    <Screen>
      <ScreenHeader title={t.downloadSettingsTitle} onBack={() => navigation.goBack()} backLabel={t.back} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel label={t.autoDownloadSection} />
        <AppText variant="bodySmall" color="muted" style={styles.help}>
          {t.downloadForegroundOnlyHelp}
        </AppText>
        <View style={styles.sectionWrap}>
          <Card style={styles.flatCard}>
            <ListRow
              label={t.autoDownloadEnabledLabel}
              sublabel={t.downloadMvpAutoHelp}
              right={settings.autoDownloadEnabled ? <AppText color="accent">✓</AppText> : null}
              onPress={() => setSettings({ ...settings, autoDownloadEnabled: !settings.autoDownloadEnabled })}
            />
            <RowSeparator />
            <ListRow
              label={t.wifiOnlyLabel}
              sublabel={t.wifiOnlyPendingNativeHelp}
              right={<AppText color="muted">{settings.wifiOnly ? '✓' : '—'}</AppText>}
            />
          </Card>
        </View>

        <SectionLabel label={t.contentTypesSection} />
        <AppText variant="bodySmall" color="muted" style={styles.help}>
          {t.manualDownloadAllContentHelp}
        </AppText>
        <View style={styles.sectionWrap}>
          <Card style={styles.flatCard}>
            <ListRow
              label={t.manualDownloadAllContentLabel}
              right={settings.manualDownloadAllContent ? <AppText color="accent">✓</AppText> : null}
              onPress={() => setSettings({ ...settings, manualDownloadAllContent: !settings.manualDownloadAllContent })}
            />
            <RowSeparator />
            <ListRow
              label={t.audioTypeLabel}
              right={settings.contentTypes.audio ? <AppText color="accent">✓</AppText> : null}
              onPress={() => setSettings({ ...settings, contentTypes: { ...settings.contentTypes, audio: !settings.contentTypes.audio } })}
            />
            {editionOptions.map((option) => (
              <React.Fragment key={option.edition}>
                <RowSeparator />
                <ListRow
                  label={option.label}
                  right={settings.contentTypes.hanachaEditions.includes(option.edition) ? <AppText color="accent">✓</AppText> : null}
                  onPress={() => toggleEdition(option.edition)}
                />
              </React.Fragment>
            ))}
            {OTHER_SECTIONS.map((section) => (
              <React.Fragment key={section}>
                <RowSeparator />
                <ListRow
                  label={t.sectionLabels[section]}
                  right={settings.contentTypes[section] ? <AppText color="accent">✓</AppText> : null}
                  onPress={() => setSettings({ ...settings, contentTypes: { ...settings.contentTypes, [section]: !settings.contentTypes[section] } })}
                />
              </React.Fragment>
            ))}
          </Card>
        </View>

        <SectionLabel label={t.storageSection} />
        <AppText variant="bodySmall" color="muted" style={styles.help}>
          {usage != null ? t.storageUsageLabel(formatBytes(usage)) : t.loading}
        </AppText>
        <View style={styles.sectionWrap}>
          <Card style={styles.flatCard}>
            <ListRow label={t.clearDownloadsLabel} sublabel={t.deleteContentLabel} onPress={() => { clearDownloads().then(() => setUsage(0)); }} />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  help: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm, lineHeight: 20 },
  sectionWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  flatCard: { paddingVertical: 0, paddingHorizontal: 0, backgroundColor: colors.backgroundElevated },
});
